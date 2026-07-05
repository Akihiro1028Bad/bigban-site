import { splitTopLevelBlocks } from "./decorate";
import { chunkRichText } from "./notion";

import type { TopLevelBlock } from "./decorate";
import type { NotionApiOptions, NotionPage } from "./notion";

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

export interface PlainBlock {
  text: string;
  isHeading: boolean;
}

export interface EditDiffSummary {
  headline: string;
  region: "導入" | "見出し" | "本文" | "全体";
  beforeChars: number;
  afterChars: number;
  delta: number;
  sample: { before: string; after: string };
  noChange: boolean;
}

function blockToPlainBlock(block: TopLevelBlock): PlainBlock | null {
  const text = block.html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  if (text === "") return null;
  return { text, isHeading: /^h[1-6]$/.test(block.tag) };
}

// HTML をトップレベルブロックのプレーンテキスト配列へ(タグ除去)。
export function htmlToPlainBlocks(html: string): PlainBlock[] {
  return splitTopLevelBlocks(html).flatMap((block) => {
    const plain = blockToPlainBlock(block);
    return plain ? [plain] : [];
  });
}

function plainTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").length;
}

function lcsPairs(beforeBlocks: PlainBlock[], afterBlocks: PlainBlock[]): Array<[number, number]> {
  const rowCount = beforeBlocks.length + 1;
  const columnCount = afterBlocks.length + 1;
  const dp = Array.from({ length: rowCount }, () => Array<number>(columnCount).fill(0));

  for (let i = beforeBlocks.length - 1; i >= 0; i -= 1) {
    for (let j = afterBlocks.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        beforeBlocks[i].text === afterBlocks[j].text
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < beforeBlocks.length && j < afterBlocks.length) {
    if (beforeBlocks[i].text === afterBlocks[j].text) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function lcsOutsideBlocks(
  beforeBlocks: PlainBlock[],
  afterBlocks: PlainBlock[]
): { removedBlocks: PlainBlock[]; addedBlocks: PlainBlock[] } {
  const pairs = lcsPairs(beforeBlocks, afterBlocks);
  const beforeMatched = new Set(pairs.map(([beforeIndex]) => beforeIndex));
  const afterMatched = new Set(pairs.map(([, afterIndex]) => afterIndex));

  return {
    removedBlocks: beforeBlocks.filter((_, index) => !beforeMatched.has(index)),
    addedBlocks: afterBlocks.filter((_, index) => !afterMatched.has(index)),
  };
}

// 前後本文 HTML からブロック単位 LCS で構造化要約を作る(LLM 非依存・決定的)。
export function summarizeEditDiff(before: string, after: string): EditDiffSummary {
  const beforeBlocks = htmlToPlainBlocks(before);
  const afterBlocks = htmlToPlainBlocks(after);
  const { removedBlocks, addedBlocks } = lcsOutsideBlocks(beforeBlocks, afterBlocks);
  const removedCount = removedBlocks.length;
  const addedCount = addedBlocks.length;
  const changed = Math.min(removedCount, addedCount);
  const pureAdded = addedCount - changed;
  const pureRemoved = removedCount - changed;
  const beforeChars = plainTextLength(before);
  const afterChars = plainTextLength(after);
  const noChange = removedCount === 0 && addedCount === 0;
  const changedBlocks = [...removedBlocks, ...addedBlocks];
  const hasOnlyHeadingChanges =
    changedBlocks.length > 0 && changedBlocks.every((block) => block.isHeading);
  const hasIntroChanged = beforeBlocks[0]?.text !== afterBlocks[0]?.text;
  const changedBlockScore = pureAdded + pureRemoved + changed;
  const headline = headlineOf({
    noChange,
    hasOnlyHeadingChanges,
    hasIntroChanged,
    changedBlockScore,
    pureAdded,
    pureRemoved,
  });
  const region = regionOf(headline, hasIntroChanged, changedBlockScore);

  return {
    headline,
    region,
    beforeChars,
    afterChars,
    delta: afterChars - beforeChars,
    sample: {
      before: (removedBlocks[0]?.text ?? "").slice(0, 200),
      after: (addedBlocks[0]?.text ?? "").slice(0, 200),
    },
    noChange,
  };
}

function headlineOf(input: {
  noChange: boolean;
  hasOnlyHeadingChanges: boolean;
  hasIntroChanged: boolean;
  changedBlockScore: number;
  pureAdded: number;
  pureRemoved: number;
}): string {
  if (input.noChange) return "無変更";
  if (input.hasOnlyHeadingChanges) return "見出しを修正";
  if (input.hasIntroChanged && input.changedBlockScore <= 2) return "導入を修正";
  if (input.pureAdded > input.pureRemoved) return "加筆";
  if (input.pureRemoved > input.pureAdded) return "短縮";
  return "言い換え";
}

function regionOf(
  headline: string,
  hasIntroChanged: boolean,
  changedBlockScore: number
): EditDiffSummary["region"] {
  if (headline === "見出しを修正") return "見出し";
  if (hasIntroChanged) return "導入";
  if (changedBlockScore >= 4) return "全体";
  return "本文";
}

// EditDiffSummary を `要約` プロパティ用の 1 本の文字列へ整形(2000 字で切る)。
export function formatEditDiffSummary(diff: EditDiffSummary): string {
  if (diff.noChange) return "無変更";
  const signedDelta = diff.delta >= 0 ? `+${diff.delta}` : `${diff.delta}`;
  return `[${diff.region}] ${diff.headline} / ${diff.beforeChars}字→${diff.afterChars}字(${signedDelta})\n変更前: ${diff.sample.before}\n変更後: ${diff.sample.after}`.slice(
    0,
    2000
  );
}

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

export interface AppendLearningLogDeps {
  /** learning log DB の data source ID。未設定(undefined/空)ならスキップ。 */
  dataSourceId: string | undefined;
  notionOptions: NotionApiOptions;
  /** createPage を注入(テストで差し替え)。既定は notion.ts の createPage。 */
  createPageFn: (
    dataSourceId: string,
    props: Record<string, unknown>,
    options: NotionApiOptions
  ) => Promise<string>;
  /** イベント発生時刻(既定 new Date().toISOString())。 */
  nowIso: string;
  /** 編集/採否の要約に使う前後差分(kind が 編集/採否 のときのみ)。 */
  diffSummary?: string;
  /** タイトルの headline(編集の「導入を短縮」等)。 */
  titleHeadline?: string;
}

export type AppendLearningLogOutcome =
  | { status: "skipped" }
  | { status: "appended"; pageId: string }
  | { status: "failed"; error: unknown };

export async function appendLearningLog(
  event: LearningEvent,
  deps: AppendLearningLogDeps
): Promise<AppendLearningLogOutcome> {
  if (!deps.dataSourceId) return { status: "skipped" };

  const props = buildLearningLogProps(
    event,
    deps.nowIso,
    deps.diffSummary ?? "",
    deps.titleHeadline
  );

  try {
    const pageId = await deps.createPageFn(deps.dataSourceId, props, deps.notionOptions);
    return { status: "appended", pageId };
  } catch (error) {
    return { status: "failed", error };
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

export interface LearningLogSummary {
  windowWeeks: number;
  totalRows: number;
  countByKind: Record<LearningEventKind | "その他", number>;
  editRegionHeatmap: Record<string, number>;
  adoptAspectHeatmap: Record<string, number>;
  imageRetryTop: { key: string; style: string; pageId: string; maxAttempt: number }[];
  failModeFrequency: Record<string, number>;
}

function emptyCountByKind(): Record<LearningEventKind | "その他", number> {
  return {
    編集: 0,
    採否: 0,
    画像試行: 0,
    工程失敗: 0,
    その他: 0,
  };
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function targetOrUnknown(target: string): string {
  return target === "" ? "不明" : target;
}

function editRegionOf(summary: string): string {
  const match = summary.match(/^\[(導入|見出し|本文|全体)\]/);
  return match?.[1] ?? "不明";
}

function sortFrequencyDesc(frequency: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(frequency).sort((a, b) => b[1] - a[1]));
}

// 直近 windowWeeks 週の学習ログを、SI2 が拾いやすい決定的な形に集計する。
export function summarizeLearningLog(
  rows: readonly LearningLogRow[],
  nowMs: number,
  windowWeeks: number
): LearningLogSummary {
  const cutoff = nowMs - windowWeeks * 7 * 24 * 60 * 60 * 1000;
  const windowRows = rows.filter(
    (row) => row.recordedAtMs !== null && row.recordedAtMs >= cutoff
  );
  const countByKind = emptyCountByKind();
  const editRegionHeatmap: Record<string, number> = {};
  const adoptAspectHeatmap: Record<string, number> = {};
  const imageRetries = new Map<
    string,
    { key: string; style: string; pageId: string; maxAttempt: number }
  >();
  const failModeFrequency: Record<string, number> = {};

  for (const row of windowRows) {
    countByKind[row.kind] += 1;

    switch (row.kind) {
      case "編集":
        incrementCount(editRegionHeatmap, editRegionOf(row.summary));
        break;
      case "採否":
        incrementCount(adoptAspectHeatmap, targetOrUnknown(row.target));
        break;
      case "画像試行": {
        const key = `${row.pageId}::${row.target}`;
        const maxAttempt = Math.max(row.count ?? 0, imageRetries.get(key)?.maxAttempt ?? 0);
        imageRetries.set(key, { key, style: row.target, pageId: row.pageId, maxAttempt });
        break;
      }
      case "工程失敗":
        incrementCount(failModeFrequency, targetOrUnknown(row.target));
        break;
      case "その他":
        break;
    }
  }

  return {
    windowWeeks,
    totalRows: windowRows.length,
    countByKind,
    editRegionHeatmap,
    adoptAspectHeatmap,
    imageRetryTop: [...imageRetries.values()]
      .sort((a, b) => b.maxAttempt - a.maxAttempt)
      .slice(0, 10),
    failModeFrequency: sortFrequencyDesc(failModeFrequency),
  };
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
