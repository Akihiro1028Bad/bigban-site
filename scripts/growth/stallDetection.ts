import type { NotionPage } from "./notion";
import {
  selectStalledGeneratingIds,
  selectStaleJobIds,
  selectWedgeJobIds,
  type GeneratingRow,
  type StaleJobRow,
} from "./staleJob";
import { formatWedgeTitle, WEDGE_LOOPS } from "./wedgeLoops";

const STATUS_PROP = "ステータス";
const TITLE_PROP = "タイトル案";

function selectOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function titleOf(page: NotionPage): string {
  const value = page.properties[TITLE_PROP] as { title?: { plain_text?: string }[] } | undefined;
  return (value?.title ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

function dateMsOf(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

function lastEditedMsOf(page: NotionPage): number | null {
  const raw = (page as { last_edited_time?: string }).last_edited_time;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

export interface StallDetectionResult {
  generatingTitles: string[];
  staleLoopTitles: string[];
  wedgeTitles: string[];
}

/** Notionページ群から生成滞留・期限超過busy・依頼時刻なしwedgeを横断抽出する。 */
export function detectStalls(
  pages: readonly NotionPage[],
  nowMs: number,
  timeoutMs: number
): StallDetectionResult {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const generatingRows: (GeneratingRow & { id: string })[] = pages.map((page) => ({
    id: page.id,
    status: selectOf(page, STATUS_PROP),
    lastEditedMs: lastEditedMsOf(page),
  }));
  const generatingTitles = selectStalledGeneratingIds(generatingRows, nowMs, timeoutMs).map(
    (id) => titleOf(byId.get(id) as NotionPage)
  );

  const staleLoopTitles: string[] = [];
  const wedgeTitles: string[] = [];
  for (const loop of WEDGE_LOOPS) {
    const rows: (StaleJobRow & { id: string })[] = pages.map((page) => ({
      id: page.id,
      status: selectOf(page, loop.statusProp),
      requestedAtMs: dateMsOf(page, loop.requestedAtProp),
    }));
    for (const id of selectWedgeJobIds(rows)) {
      wedgeTitles.push(formatWedgeTitle(titleOf(byId.get(id) as NotionPage), loop.label));
    }
    for (const id of selectStaleJobIds(rows, nowMs, timeoutMs)) {
      staleLoopTitles.push(formatWedgeTitle(titleOf(byId.get(id) as NotionPage), loop.label));
    }
  }

  return { generatingTitles, staleLoopTitles, wedgeTitles };
}
