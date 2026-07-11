import { ADVISE_PROPS, type AdviceStatus } from "./advise";
import { BODY_REGEN_PROPS, type BodyRegenStatus } from "./bodyImageRegen";
import { DECORATE_PROPS, type DecorateStatus } from "./decorate";
import { REGEN_PROPS, type RegenStatus } from "./eyecatchRegen";
import { REVISE_PROPS, type ReviseStatus } from "./revise";
import type { NotionPage } from "./notion";

export type PendingActivityKind =
  | "revise"
  | "title-revise"
  | "advise"
  | "decorate"
  | "eyecatch-regen"
  | "body-image-regen"
  | "draft"
  | "initiative";

export type PendingActivityStatus = "idle" | "requested" | "running" | "presented" | "failed";

export interface PendingActivity {
  kind: PendingActivityKind;
  status: PendingActivityStatus;
  label: string;
  requestedAtMs: number | null;
  updatedAtMs: number | null;
  hasResult: boolean;
  summary: string | null;
}

function readSelectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function readRichText(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function readDateStartMs(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

function mapStatus(status: string): PendingActivityStatus {
  if (status === "依頼中") return "requested";
  if (status === "処理中") return "running";
  if (status === "提示中") return "presented";
  if (status === "失敗") return "failed";
  return "idle";
}

function shortSummary(text: string, max = 80): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

interface BuildActivityInput {
  kind: PendingActivityKind;
  label: string;
  rawStatus: string;
  requestedAtMs: number | null;
  result: string;
}

function buildActivity(input: BuildActivityInput): PendingActivity {
  const status = mapStatus(input.rawStatus);
  return {
    kind: input.kind,
    status,
    label: input.label,
    requestedAtMs: input.requestedAtMs,
    updatedAtMs: input.requestedAtMs,
    hasResult: input.result.trim().length > 0,
    summary: shortSummary(input.result),
  };
}

export function pendingActivitiesOf(page: NotionPage): PendingActivity[] {
  const reviseStatus = readSelectName(page, REVISE_PROPS.status) as ReviseStatus | "";
  const reviseProposal = readRichText(page, REVISE_PROPS.proposal);
  const titleProposal = readRichText(page, REVISE_PROPS.titleProposal);
  const reviseRequestedAtMs = readDateStartMs(page, REVISE_PROPS.requestedAt);
  const activities: PendingActivity[] = [
    buildActivity({
      kind: "revise",
      label: "構成案修正",
      rawStatus: reviseStatus,
      requestedAtMs: reviseRequestedAtMs,
      result: reviseProposal,
    }),
    buildActivity({
      kind: "title-revise",
      label: "タイトル修正",
      rawStatus: reviseStatus,
      requestedAtMs: reviseRequestedAtMs,
      result: titleProposal,
    }),
    buildActivity({
      kind: "advise",
      label: "スタイリング助言",
      rawStatus: readSelectName(page, ADVISE_PROPS.status) as AdviceStatus | "",
      requestedAtMs: readDateStartMs(page, ADVISE_PROPS.requestedAt),
      result: readRichText(page, ADVISE_PROPS.result),
    }),
    buildActivity({
      kind: "decorate",
      label: "装飾提案",
      rawStatus: readSelectName(page, DECORATE_PROPS.status) as DecorateStatus | "",
      requestedAtMs: readDateStartMs(page, DECORATE_PROPS.requestedAt),
      result: readRichText(page, DECORATE_PROPS.result),
    }),
    buildActivity({
      kind: "eyecatch-regen",
      label: "アイキャッチ再生成",
      rawStatus: readSelectName(page, REGEN_PROPS.status) as RegenStatus | "",
      requestedAtMs: readDateStartMs(page, REGEN_PROPS.requestedAt),
      result: "",
    }),
    buildActivity({
      kind: "body-image-regen",
      label: "本文画像再生成",
      rawStatus: readSelectName(page, BODY_REGEN_PROPS.status) as BodyRegenStatus | "",
      requestedAtMs: readDateStartMs(page, BODY_REGEN_PROPS.requestedAt),
      result: readRichText(page, BODY_REGEN_PROPS.targetSrc),
    }),
  ];
  return activities.filter((a) => a.status !== "idle" || a.hasResult);
}

export function activityBadgeLabels(activities: readonly PendingActivity[]): string[] {
  const labels: string[] = [];
  if (activities.some((a) => a.status === "requested" || a.status === "running")) labels.push("AI処理中");
  if (activities.some((a) => a.kind === "revise" && a.status === "presented")) labels.push("修正案あり");
  if (activities.some((a) => a.kind === "title-revise" && a.status === "presented")) labels.push("タイトル案あり");
  if (activities.some((a) => a.kind === "advise" && a.status === "requested")) labels.push("アドバイス依頼中");
  if (activities.some((a) => a.kind === "decorate" && a.status === "presented")) labels.push("装飾提案あり");
  if (activities.some((a) => a.kind === "eyecatch-regen" || a.kind === "body-image-regen")) {
    if (activities.some((a) => (a.kind === "eyecatch-regen" || a.kind === "body-image-regen") && (a.status === "requested" || a.status === "running"))) {
      labels.push("画像再生成中");
    }
  }
  if (activities.some((a) => a.status === "failed")) labels.push("直近失敗");
  return [...new Set(labels)];
}
