import { chunkRichText, type NotionPage } from "./notion";

// ── イベント種別・discriminated union(spec §3.4.3) ──
export type LearningEventKind = "編集" | "採否" | "画像試行" | "工程失敗";

export const LEARNING_EVENT_KINDS: readonly LearningEventKind[] = [
  "編集",
  "採否",
  "画像試行",
  "工程失敗",
];

export type LearningImageResult = "成功" | "失敗" | "リトライ";

export type LearningEvent =
  | { kind: "編集"; pageId: string; title: string; before: string; after: string }
  | { kind: "採否"; pageId: string; title: string; aspect: string; before: string; after: string }
  | { kind: "画像試行"; pageId: string; title: string; style: string; result: "成功" | "失敗"; attempt: number }
  | { kind: "工程失敗"; mode: string; exitCode: number | null; detail: string };

// ── Notion「学習ログ」DB のプロパティ名(日本語・spec §3.1) ──
export const LEARNING_LOG_PROPS = {
  event: "イベント",
  kind: "種別",
  recordedAt: "記録時刻",
  articleTitle: "記事タイトル",
  pageId: "ページID",
  target: "対象",
  result: "結果",
  summary: "要約",
  count: "回数",
} as const;

export const LEARNING_LOG_RESULTS: readonly LearningImageResult[] = ["成功", "失敗", "リトライ"];

function articleTitleHead(title: string): string {
  return title.trim() === "" ? "無題" : title.slice(0, 20);
}

// ── タイトル生成(spec §3.4.1) ──
export function buildLearningLogTitle(event: LearningEvent, editHeadline?: string): string {
  const title =
    event.kind === "工程失敗"
      ? `失敗: ${event.mode} 異常終了(exit ${event.exitCode ?? "?"})`
      : buildArticleEventTitle(event, editHeadline);
  return title.slice(0, 60);
}

function buildArticleEventTitle(
  event: Exclude<LearningEvent, { kind: "工程失敗" }>,
  editHeadline?: string
): string {
  const titleHead = articleTitleHead(event.title);
  switch (event.kind) {
    case "編集":
      return `編集: ${editHeadline ?? "変更"} (${titleHead})`;
    case "採否":
      return `採用: ${event.aspect || "観点なし"} (${titleHead})`;
    case "画像試行":
      return `画像${event.result}: ${event.style} ×${event.attempt} (${titleHead})`;
  }
}

// ── プロパティ組み立て(spec §3.4 末尾) ──
export function buildLearningLogProps(
  event: LearningEvent,
  nowIso: string,
  summary: string,
  titleHeadline?: string
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    [LEARNING_LOG_PROPS.kind]: { select: { name: event.kind } },
    [LEARNING_LOG_PROPS.recordedAt]: { date: { start: nowIso } },
    [LEARNING_LOG_PROPS.event]: { title: chunkRichText(buildLearningLogTitle(event, titleHeadline)) },
    [LEARNING_LOG_PROPS.summary]: { rich_text: chunkRichText(summary) },
  };

  switch (event.kind) {
    case "編集":
      return {
        ...props,
        [LEARNING_LOG_PROPS.articleTitle]: { rich_text: chunkRichText(event.title) },
        [LEARNING_LOG_PROPS.pageId]: { rich_text: chunkRichText(event.pageId) },
        [LEARNING_LOG_PROPS.target]: { rich_text: [] },
      };
    case "採否":
      return {
        ...props,
        [LEARNING_LOG_PROPS.articleTitle]: { rich_text: chunkRichText(event.title) },
        [LEARNING_LOG_PROPS.pageId]: { rich_text: chunkRichText(event.pageId) },
        [LEARNING_LOG_PROPS.target]: { rich_text: chunkRichText(event.aspect) },
      };
    case "画像試行":
      return {
        ...props,
        [LEARNING_LOG_PROPS.articleTitle]: { rich_text: chunkRichText(event.title) },
        [LEARNING_LOG_PROPS.pageId]: { rich_text: chunkRichText(event.pageId) },
        [LEARNING_LOG_PROPS.target]: { rich_text: chunkRichText(event.style) },
        [LEARNING_LOG_PROPS.result]: { select: { name: event.result } },
        [LEARNING_LOG_PROPS.count]: { number: event.attempt },
      };
    case "工程失敗":
      return {
        ...props,
        [LEARNING_LOG_PROPS.articleTitle]: { rich_text: [] },
        [LEARNING_LOG_PROPS.pageId]: { rich_text: [] },
        [LEARNING_LOG_PROPS.target]: { rich_text: chunkRichText(event.mode) },
        [LEARNING_LOG_PROPS.result]: { select: { name: "失敗" } },
      };
  }
}

// ── 読み取り(weekly 集計の入力・spec §3.2) ──
export interface LearningLogRow {
  id: string;
  kind: LearningEventKind | "その他";
  recordedAtMs: number | null;
  articleTitle: string;
  pageId: string;
  target: string;
  result: LearningImageResult | "";
  summary: string;
  count: number | null;
}

function readSelectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function readRichTextPlain(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
}

function readDateStartMs(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

function readNumber(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { number?: number | null } | undefined;
  return value?.number ?? null;
}

function normalizeLearningEventKind(kind: string): LearningEventKind | "その他" {
  return (LEARNING_EVENT_KINDS as readonly string[]).includes(kind)
    ? (kind as LearningEventKind)
    : "その他";
}

function normalizeLearningResult(result: string): LearningImageResult | "" {
  return (LEARNING_LOG_RESULTS as readonly string[]).includes(result)
    ? (result as LearningImageResult)
    : "";
}

export function parseLearningLogPage(page: NotionPage): LearningLogRow {
  return {
    id: page.id,
    kind: normalizeLearningEventKind(readSelectName(page, LEARNING_LOG_PROPS.kind)),
    recordedAtMs: readDateStartMs(page, LEARNING_LOG_PROPS.recordedAt),
    articleTitle: readRichTextPlain(page, LEARNING_LOG_PROPS.articleTitle),
    pageId: readRichTextPlain(page, LEARNING_LOG_PROPS.pageId),
    target: readRichTextPlain(page, LEARNING_LOG_PROPS.target),
    result: normalizeLearningResult(readSelectName(page, LEARNING_LOG_PROPS.result)),
    summary: readRichTextPlain(page, LEARNING_LOG_PROPS.summary),
    count: readNumber(page, LEARNING_LOG_PROPS.count),
  };
}
