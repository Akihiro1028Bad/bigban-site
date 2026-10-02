/** テニスベアのサークルの開催回から、申込日時の週ごとの件数だけを数える。参加者名は返さない。 */
import { CIRCLE_ID, FETCH_TIMEOUT_MS, TENNISBEAR_BASE_URL } from "../../early-morning/config";
import { parseNuxtState } from "../../early-morning/nuxtPayload";
import { TennisbearError, extractCircleEvents, extractEventDetail } from "../../early-morning/tennisbear";
import type { FetchFn } from "../../growth/http";
import { instantToJstDate, weekStartOf } from "./weeks";

export interface TennisbearApplicationDeps {
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  intervalMs: number;
  /** この日付以降に始まる開催回だけを数える(開催前の回に申し込めるので、窓より前の回に窓内の申込はない)。 */
  windowStart: string;
}

export interface TennisbearApplicationCounts {
  byWeek: Map<string, number>;
  undated: number;
  events: number;
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<string> {
  const response = await fetchFn(url, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PBT-weekly-health)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new TennisbearError(`${url} の取得に失敗しました (HTTP ${response.status})`);
  return response.text();
}

export async function fetchTennisbearApplicationCounts(deps: TennisbearApplicationDeps): Promise<TennisbearApplicationCounts> {
  const circleHtml = await fetchPage(`${TENNISBEAR_BASE_URL}/pickleball/circle/${CIRCLE_ID}/events`, deps.fetchFn);
  const targets = extractCircleEvents(parseNuxtState(circleHtml)).filter(
    (event) => !event.isCallOff && (instantToJstDate(event.startAt) ?? "") >= deps.windowStart,
  );
  const byWeek = new Map<string, number>();
  let undated = 0;
  for (const event of targets) {
    await deps.sleep(deps.intervalMs);
    const html = await fetchPage(`${TENNISBEAR_BASE_URL}/pickleball/event/${event.id}/info`, deps.fetchFn);
    const detail = extractEventDetail(parseNuxtState(html));
    if (detail.id !== event.id) throw new TennisbearError(`イベント ${event.id} の詳細が別のイベントを返しました`);
    for (const participant of detail.participants) {
      const date = participant.appliedAt === null ? null : instantToJstDate(participant.appliedAt);
      if (date === null) {
        undated += 1;
        continue;
      }
      const week = weekStartOf(date);
      byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
    }
  }
  return { byWeek, undated, events: targets.length };
}
