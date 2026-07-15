import { createHash } from "node:crypto";

import { resolveColumnCategoryId } from "./columnCategory";
import { placeholderIndices } from "./body-image";
import { buildSourceLedgerFromUsedFacts, duplicateExternalLinks, externalLinksOutsideFacts, parseWriterOutput, RESERVE_URL } from "./draftPipeline";
import { resolveFacilityPhase } from "./facility-context";
import { rebuildSourceIdOf } from "./rebuildDraft";
import type { ResearchPacket, WriterOutput } from "./draftPipeline";
import type { FacilityContextData, FacilityPhase } from "./facility-context";
import type { NotionPage } from "./notion";

export interface DraftInput {
  pageId: string;
  title: string;
  outline: string;
  audience: string;
  searchIntent: string;
  cta: string;
  primaryNotes: string;
  media: string;
  articleType: string;
  columnCategory: string;
  newsCategory: string;
  rebuildSourceId: string;
}

export interface DraftGenerationMarker {
  sourceId: string;
  attemptId: string;
}

export interface DraftGenerationScope {
  cacheScope: string;
  marker: DraftGenerationMarker | null;
}

/** 意図的な再生成は新しいキャッシュ領域にし、同じattemptの障害再試行だけを再利用する。 */
export function resolveDraftGenerationScope(
  rebuildSourceId: string,
  persisted: DraftGenerationMarker | null,
  createAttemptId: () => string,
): DraftGenerationScope {
  if (!rebuildSourceId) return { cacheScope: "standard", marker: null };
  if (persisted?.sourceId === rebuildSourceId && persisted.attemptId) {
    return { cacheScope: `rebuild:${persisted.attemptId}`, marker: persisted };
  }
  const attemptId = createAttemptId();
  const marker = { sourceId: rebuildSourceId, attemptId };
  return { cacheScope: `rebuild:${attemptId}`, marker };
}

export interface DraftImageInput {
  index: number;
  style: "auto" | "mascot" | "illust" | "court" | "flow" | "infographic";
  description: string;
  textSpec?: string;
}

export interface FacilityResearchContext {
  name: string;
  openDate: string;
  phase: FacilityPhase;
  phaseDays: number;
  location: string[];
  confirmed: string[];
  doNotWrite: string[];
  notes?: string;
}

export function buildFacilityResearchContext(
  facility: FacilityContextData,
  reference: Date,
): FacilityResearchContext {
  const { phase, days } = resolveFacilityPhase(facility.openDate, reference);
  return {
    name: facility.name,
    openDate: facility.openDate,
    phase,
    phaseDays: days,
    location: facility.location,
    confirmed: facility.confirmed,
    doNotWrite: facility.doNotWrite,
    ...(facility.notes ? { notes: facility.notes } : {}),
  };
}

interface FacilityRelevanceRule {
  article: RegExp;
  facility: RegExp;
}

const FACILITY_RELEVANCE_RULES: readonly FacilityRelevanceRule[] = [
  { article: /場所|どこ|アクセス|行き方|住所|駅|徒歩|駐車/, facility: /〒|住所|駅|徒歩|駐車|アクセス/ },
  { article: /時間|営業時間|早朝|朝活|夜|曜日|定休/, facility: /営業時間|時刻|不定休|定休|曜日|\d{1,2}:\d{2}/ },
  { article: /料金|価格|費用|いくら|円|予算/, facility: /料金|価格|費用|円|無料|有料/ },
  { article: /持ち物|用具|道具|パドル|シューズ|レンタル|服装/, facility: /用具|道具|パドル|シューズ|レンタル|服装/ },
  { article: /予約|空き|申し込|申込|利用方法/, facility: /予約|空き|申し込|申込|利用方法|サービス名/ },
  { article: /ピックルボール|コート|施設|屋内|プレー/, facility: /ピックルボール|コート|施設|屋内|空調|DecoTurf|デコターフ/ },
  { article: /HYROX|ハイロックス|トレーニング/, facility: /HYROX|ハイロックス|トレーニング|SkiErg|RowErg|スレッド|ケトルベル|ウォールボール|サンドバッグ/ },
  { article: /イベント|大会|リーグ|体験会|レッスン|クリニック/, facility: /イベント|大会|リーグ|体験会|レッスン|クリニック/ },
  { article: /キャンペーン|クーポン|割引|特典/, facility: /キャンペーン|クーポン|割引|特典/ },
  { article: /コーチ|スタッフ|選手|人物|実績/, facility: /コーチ|スタッフ|選手|人物|実績|関吉/ },
  { article: /貸切|法人/, facility: /貸切|法人/ },
  { article: /ラウンジ/, facility: /ラウンジ/ },
  { article: /コンセプト|理念|スローガン/, facility: /コンセプト|理念|スローガン/ },
];

function isRelevantFacilityItem(item: string, articleText: string): boolean {
  return FACILITY_RELEVANCE_RULES.some(
    (rule) => rule.article.test(articleText) && rule.facility.test(item),
  );
}

export function selectRelevantFacilityContext(
  facility: FacilityResearchContext,
  articleText: string,
): FacilityResearchContext {
  const normalizedArticle = articleText.normalize("NFKC");
  const includesLocation = /場所|どこ|アクセス|行き方|住所|駅|徒歩|駐車/.test(normalizedArticle);
  return {
    name: facility.name,
    openDate: facility.openDate,
    phase: facility.phase,
    phaseDays: facility.phaseDays,
    location: includesLocation ? [...facility.location] : [],
    confirmed: facility.confirmed.filter((item) =>
      isRelevantFacilityItem(item, normalizedArticle),
    ),
    doNotWrite: facility.doNotWrite.filter((item) =>
      isRelevantFacilityItem(item, normalizedArticle),
    ),
  };
}

export function buildWriterInput(
  input: DraftInput,
  preparedOutline: string,
  research: ResearchPacket,
  doNotWrite: readonly string[],
) {
  return {
    title: input.title,
    outline: preparedOutline,
    audience: input.audience,
    searchIntent: input.searchIntent,
    cta: input.cta,
    facts: research.facts,
    doNotWrite: [...doNotWrite],
    allowedHtml: [
      "h2", "h3", "p", "ul", "ol", "li", "strong", "a",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    reserveUrl: RESERVE_URL,
    disclaimer: "※この記事はAIが作成した下書きです。公開前に内容をご確認ください。",
  };
}

function textItems(property: unknown, key: "title" | "rich_text"): string {
  if (!property || typeof property !== "object") return "";
  const items = (property as Record<string, unknown>)[key];
  if (!Array.isArray(items)) return "";
  return items.map((item) => {
    if (!item || typeof item !== "object") return "";
    const text = (item as Record<string, unknown>).plain_text;
    return typeof text === "string" ? text : "";
  }).join("").trim();
}

function selectName(property: unknown): string {
  if (!property || typeof property !== "object") return "";
  const select = (property as Record<string, unknown>).select;
  if (!select || typeof select !== "object") return "";
  const name = (select as Record<string, unknown>).name;
  return typeof name === "string" ? name.trim() : "";
}

function firstMultiSelectName(property: unknown): string {
  if (!property || typeof property !== "object") return "";
  const items = (property as Record<string, unknown>).multi_select;
  if (!Array.isArray(items)) return "";
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = (item as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

export function draftInputFromPage(page: NotionPage): DraftInput {
  return {
    pageId: page.id,
    title: textItems(page.properties["タイトル案"], "title"),
    outline: textItems(page.properties["構成案"], "rich_text"),
    audience: textItems(page.properties["狙う読者"], "rich_text"),
    searchIntent: textItems(page.properties["検索意図"], "rich_text"),
    cta: textItems(page.properties["想定CTA"], "rich_text"),
    primaryNotes: textItems(page.properties["一次情報メモ"], "rich_text"),
    media: selectName(page.properties["媒体"]) || "コラム",
    articleType: firstMultiSelectName(page.properties["記事タイプ"]) || selectName(page.properties["記事タイプ"]),
    columnCategory: selectName(page.properties["コラムカテゴリ"]),
    newsCategory: selectName(page.properties["ニュースカテゴリ"]) || firstMultiSelectName(page.properties["ニュースカテゴリ"]),
    rebuildSourceId: rebuildSourceIdOf(page),
  };
}

const STYLE_NAMES: Record<string, DraftImageInput["style"]> = {
  "おまかせ": "auto",
  "宇宙人マスコット": "mascot",
  "雰囲気イラスト": "illust",
  "コート図・ルール図解": "court",
  "手順・フロー図": "flow",
  "比較・インフォグラフィック": "infographic",
  "マスコット・コスミック": "mascot",
  "ミニマル図解": "illust",
  "詳しい図解": "court",
};

export function prepareOutlineImages(outline: string): { outline: string; images: DraftImageInput[] } {
  const images: DraftImageInput[] = [];
  const lines = outline.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed === "[画像:なし]") return "";
    const match = trimmed.match(/^\[画像:([^:]+):\s*(.*?)(?:\s*[|｜]\s*文字:\s*(.*?))?\]$/);
    if (!match) return line;
    if (images.length >= 3) return "";
    const style = STYLE_NAMES[match[1].trim()];
    const description = match[2].trim();
    if (!style || !description) return "";
    const index = images.length + 1;
    const textSpec = match[3]?.trim();
    images.push({ index, style, description, ...(textSpec ? { textSpec } : {}) });
    return `{{IMG:${index}}}`;
  });
  return { outline: lines.join("\n"), images };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function stageCacheKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function publishedContentId(output: string): string {
  const contentId = output.match(/contentId=([^\s]+)/)?.[1];
  if (!contentId) throw new Error("publish-draftの出力にcontentIdがありません。");
  return contentId;
}

export function validateWriterContract(
  writer: WriterOutput,
  research: ResearchPacket,
  preparedOutline: string,
): void {
  const unexpectedLinks = externalLinksOutsideFacts(writer.bodyHtml, research, writer.usedFactIds);
  if (unexpectedLinks.length > 0) {
    throw new Error(`確認済みでない外部リンクがあります: ${unexpectedLinks.join(", ")}`);
  }
  const duplicateLinks = duplicateExternalLinks(writer.bodyHtml);
  if (duplicateLinks.length > 0) {
    throw new Error(`同じ外部URLが重複しています: ${duplicateLinks.join(", ")}`);
  }
  const expectedPlacements = imageMarkerPlacementsInOutline(preparedOutline);
  const actualPlacements = imageMarkerPlacementsInHtml(writer.bodyHtml);
  const expectedImageIndices = expectedPlacements.map(({ index }) => index);
  const actualImageIndices = placeholderIndices(writer.bodyHtml);
  if (expectedImageIndices.join(",") !== actualImageIndices.join(",")) {
    throw new Error("本文画像プレースホルダーが構成案と一致しません。");
  }
  if (JSON.stringify(expectedPlacements) !== JSON.stringify(actualPlacements)) {
    throw new Error("本文画像プレースホルダーの配置見出しが構成案と一致しません。");
  }
}

export function parseValidatedWriterOutput(
  value: unknown,
  research: ResearchPacket,
  preparedOutline: string,
): WriterOutput {
  const writer = parseWriterOutput(value, research);
  validateWriterContract(writer, research, preparedOutline);
  return writer;
}

interface ImageMarkerPlacement {
  index: number;
  headings: string[];
}

function normalizeHeading(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function updateHeadingStack(stack: string[], level: number, heading: string): void {
  if (level === 2) {
    stack.splice(0, stack.length, heading);
  } else {
    stack.splice(1, stack.length - 1, heading);
  }
}

function imageMarkerPlacementsInOutline(outline: string): ImageMarkerPlacement[] {
  const headings: string[] = [];
  const placements: ImageMarkerPlacement[] = [];
  for (const line of outline.split(/\r?\n/)) {
    const heading = line.match(/^\s*(#{2,3})\s+(.+?)\s*$/);
    if (heading) {
      updateHeadingStack(headings, heading[1].length, normalizeHeading(heading[2]));
    }
    for (const marker of line.matchAll(/\{\{IMG:(\d+)\}\}/g)) {
      placements.push({ index: Number(marker[1]), headings: [...headings] });
    }
  }
  return placements;
}

function imageMarkerPlacementsInHtml(html: string): ImageMarkerPlacement[] {
  const headings: string[] = [];
  const placements: ImageMarkerPlacement[] = [];
  const tokens = /<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>|\{\{IMG:(\d+)\}\}/gi;
  for (const token of html.matchAll(tokens)) {
    if (token[1]) {
      updateHeadingStack(headings, Number(token[1]), normalizeHeading(token[2]));
    } else {
      placements.push({ index: Number(token[3]), headings: [...headings] });
    }
  }
  return placements;
}

export function shouldInvalidateWriterCacheForPublishFailure(output: string): boolean {
  return /(?:^|\n)✗ quality-gate:/m.test(output)
    || /(?:^|\n)✗ notion-context:.*構成案ゲート不合格/m.test(output);
}

export function workerLogTargetFields(pageId: string): Record<string, string> {
  return {
    "target-type": "article",
    "target-page-id": pageId,
  };
}

export async function cleanupDraftWorkDirs(
  directories: readonly string[],
  remove: (
    directory: string,
    options: { recursive: true; force: true },
  ) => Promise<unknown>,
): Promise<void> {
  await Promise.allSettled(
    directories.map((directory) => remove(directory, { recursive: true, force: true })),
  );
}

export function runDraftNotificationBestEffort(params: {
  notifyPath: string;
  notify: () => void;
  warn: (message: string) => void;
}): boolean {
  try {
    params.notify();
    return true;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    params.warn(
      `下書き投入は完了しましたがLINE通知に失敗しました: ${detail}\n`
      + `通知だけ再送: npm run growth:notify-drafts -- ${params.notifyPath}`,
    );
    return false;
  }
}

export function assemblePublishSpec(params: {
  input: DraftInput;
  writer: WriterOutput;
  research: ResearchPacket;
  images: DraftImageInput[];
}): Record<string, unknown> {
  const { input, writer, research, images } = params;
  const category = resolveColumnCategoryId(input.articleType, input.columnCategory);
  const payload: Record<string, unknown> = {
    title: input.title,
    slug: writer.slug,
    locale: ["ja"],
    excerpt: writer.excerpt,
    displayMode: ["html"],
    bodyHtml: writer.bodyHtml,
  };
  if (input.media === "ニュース") {
    payload.category = [resolveNewsCategory(input)];
  } else {
    if (input.articleType) payload.articleType = [input.articleType];
    if (category) payload.category = category;
  }
  return {
    media: input.media === "ニュース" ? "ニュース" : "コラム",
    payload,
    eyecatchAction: "pending",
    imagePath: `/tmp/growth-eyecatch-${writer.slug}.png`,
    images,
    sourceLedger: buildSourceLedgerFromUsedFacts(research, writer.usedFactIds),
    notion: { pageId: input.pageId, property: "ステータス", value: "下書き作成済み" },
  };
}

const NEWS_CATEGORIES = ["お知らせ", "メディア掲載", "イベント情報", "キャンペーン"] as const;
type NewsCategory = (typeof NEWS_CATEGORIES)[number];

function resolveNewsCategory(input: DraftInput): NewsCategory {
  if (NEWS_CATEGORIES.includes(input.newsCategory as NewsCategory)) {
    return input.newsCategory as NewsCategory;
  }
  if (input.articleType === "イベント") return "イベント情報";
  const approvedText = `${input.title}\n${input.outline}`;
  if (/メディア掲載|掲載され|取材|テレビ|TV|新聞|雑誌/.test(approvedText)) return "メディア掲載";
  if (/キャンペーン|割引|特典|クーポン/.test(approvedText)) return "キャンペーン";
  if (/イベント|大会|体験会|クリニック/.test(approvedText)) return "イベント情報";
  return "お知らせ";
}
