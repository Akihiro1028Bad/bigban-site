/** テニスベアのサークル一覧とイベント詳細から、早朝イベントの参加者を取り出す。 */
import { z } from "zod";

import type { FetchFn } from "../growth/http";
import { CIRCLE_ID, EARLY_START_TIME, FETCH_TIMEOUT_MS, TENNISBEAR_BASE_URL } from "./config";
import { isoTimePart } from "./dates";
import { parseNuxtState } from "./nuxtPayload";
import type { TbEventDetail, TbEventSummary, TbParticipant } from "./types";

export class TennisbearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TennisbearError";
  }
}

const summarySchema = z.object({ id: z.number().int(), startDatetimeString: z.string(), callOff: z.boolean() });

const circleSchema = z.object({
  state: z.object({
    feature: z.object({
      circle: z.object({
        circleDetail: z.object({
          CircleOrganizedEvents: z.object({
            circleOrganizedFutureEventList: z.array(summarySchema),
            circleOrganizedPastEventList: z.array(summarySchema),
          }),
        }),
      }),
    }),
  }),
});

const participantSchema = z.object({
  eventUserStatusType: z.string(),
  guestUserFlg: z.boolean(),
  applyDateTime: z.string().nullable(),
  user: z.object({ id: z.number().int(), name: z.string() }),
});

const eventSchema = z.object({
  state: z.object({
    feature: z.object({
      event: z.object({
        eventDetail: z.object({
          EventDetail: z.object({
            event: z.object({
              id: z.number().int(),
              startDateTime: z.string(),
              callOff: z.boolean(),
              participantList: z.array(participantSchema),
              cancelUserList: z.array(participantSchema),
            }),
          }),
        }),
      }),
    }),
  }),
});

type RawParticipant = z.infer<typeof participantSchema>;

function parseWith<T>(schema: z.ZodType<T>, state: unknown, label: string): T {
  const result = schema.safeParse(state);
  if (!result.success) throw new TennisbearError(`${label}の形が想定と違います: ${result.error.message}`);
  return result.data;
}

export function extractCircleEvents(state: unknown): TbEventSummary[] {
  const lists = parseWith(circleSchema, state, "サークル一覧").state.feature.circle.circleDetail.CircleOrganizedEvents;
  const byId = new Map<number, TbEventSummary>();
  for (const item of [...lists.circleOrganizedFutureEventList, ...lists.circleOrganizedPastEventList]) {
    if (!byId.has(item.id)) byId.set(item.id, { id: item.id, startAt: item.startDatetimeString, isCallOff: item.callOff });
  }
  return [...byId.values()];
}

export function isEarlyEvent(event: TbEventSummary): boolean {
  return isoTimePart(event.startAt) === EARLY_START_TIME;
}

function toParticipant(raw: RawParticipant, status: TbParticipant["status"]): TbParticipant {
  return {
    userId: raw.user.id,
    name: raw.user.name,
    status,
    isGuest: raw.guestUserFlg || raw.user.id === -1,
    appliedAt: raw.applyDateTime,
  };
}

export function extractEventDetail(state: unknown): TbEventDetail {
  const event = parseWith(eventSchema, state, "イベント詳細").state.feature.event.eventDetail.EventDetail.event;
  const approved = event.participantList.filter((p) => p.eventUserStatusType === "APPROVE");
  const cancelled = event.cancelUserList.filter((p) => p.eventUserStatusType === "CANCEL");
  const ignoredStatusCount =
    event.participantList.length - approved.length + (event.cancelUserList.length - cancelled.length);
  return {
    id: event.id,
    startAt: event.startDateTime,
    isCallOff: event.callOff,
    ignoredStatusCount,
    participants: [
      ...approved.map((p) => toParticipant(p, "APPROVE")),
      ...cancelled.map((p) => toParticipant(p, "CANCEL")),
    ],
  };
}

async function fetchHtml(url: string, fetchFn: FetchFn): Promise<string> {
  const res = await fetchFn(url, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PBT-early-sync)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new TennisbearError(`${url} の取得に失敗しました (HTTP ${res.status})`);
  return res.text();
}

export async function fetchEarlyEventDetails(deps: {
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  intervalMs: number;
}): Promise<TbEventDetail[]> {
  const circleHtml = await fetchHtml(`${TENNISBEAR_BASE_URL}/pickleball/circle/${CIRCLE_ID}/events`, deps.fetchFn);
  const early = extractCircleEvents(parseNuxtState(circleHtml))
    .filter(isEarlyEvent)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const details: TbEventDetail[] = [];
  for (const event of early) {
    if (event.isCallOff) {
      details.push({ ...event, participants: [], ignoredStatusCount: 0 });
      continue;
    }
    await deps.sleep(deps.intervalMs);
    const html = await fetchHtml(`${TENNISBEAR_BASE_URL}/pickleball/event/${event.id}/info`, deps.fetchFn);
    const detail = extractEventDetail(parseNuxtState(html));
    if (detail.id !== event.id) throw new TennisbearError(`イベント ${event.id} の詳細が別のイベントを返しました`);
    details.push(detail);
  }
  return details;
}
