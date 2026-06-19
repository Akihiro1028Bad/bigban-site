/**
 * Notion REST API を直接叩く薄いクライアント。
 *
 * 承認ページ/週次通知が headless / サーバから Notion を読み書きするため、
 * MCP に依存せず REST(`https://api.notion.com/v1/...`)を使う。
 * fetch は注入可能(テスト容易性)。`collection://` の ID は data source ID。
 *
 * - data source 照会: POST /v1/data_sources/{id}/query
 * - ページ更新:       PATCH /v1/pages/{id}
 * - API バージョン:   Notion-Version(data sources API は 2025-09-03)
 */

import type { FetchFn } from "./http";

export const NOTION_API_BASE = "https://api.notion.com/v1";
export const DEFAULT_NOTION_VERSION = "2025-09-03";

export interface NotionApiOptions {
  token: string;
  fetchFn: FetchFn;
  /** 既定は DEFAULT_NOTION_VERSION。 */
  version?: string;
}

export interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, unknown>;
}

export interface QueryDataSourceBody {
  filter?: unknown;
  sorts?: unknown[];
  pageSize?: number;
  startCursor?: string;
}

export interface QueryDataSourceResult {
  pages: NotionPage[];
  hasMore: boolean;
  nextCursor: string | null;
}

function notionHeaders(options: NotionApiOptions): Record<string, string> {
  return {
    Authorization: `Bearer ${options.token}`,
    "Notion-Version": options.version ?? DEFAULT_NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionRequest(
  method: "POST" | "PATCH",
  url: string,
  body: unknown,
  options: NotionApiOptions
): Promise<unknown> {
  const res = await options.fetchFn(url, {
    method,
    headers: notionHeaders(options),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API に失敗しました (HTTP ${res.status}): ${text}`);
  }

  return res.json();
}

/** data source を照会して該当ページ一覧(と次カーソル)を返す。 */
export async function queryDataSource(
  dataSourceId: string,
  body: QueryDataSourceBody,
  options: NotionApiOptions
): Promise<QueryDataSourceResult> {
  const requestBody: Record<string, unknown> = {};
  if (body.filter !== undefined) requestBody.filter = body.filter;
  if (body.sorts !== undefined) requestBody.sorts = body.sorts;
  if (body.pageSize !== undefined) requestBody.page_size = body.pageSize;
  if (body.startCursor !== undefined) requestBody.start_cursor = body.startCursor;

  const json = (await notionRequest(
    "POST",
    `${NOTION_API_BASE}/data_sources/${dataSourceId}/query`,
    requestBody,
    options
  )) as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null };

  return {
    pages: json.results ?? [],
    hasMore: json.has_more ?? false,
    nextCursor: json.next_cursor ?? null,
  };
}

/** Notion rich_text の書き込み 1 要素。content は最大 2000 文字。 */
export interface NotionRichTextItem {
  text: { content: string };
}

const RICH_TEXT_CHUNK = 2000; // 1 要素 content の上限
const RICH_TEXT_MAX_ITEMS = 100; // 配列要素数の上限

/**
 * 長文を Notion rich_text の書き込み配列に分割する(純関数)。
 * - 空文字は [](プロパティを空にする)。
 * - 2000 文字ごとに 1 要素。100 要素(=200,000 文字)超は throw(無言切り捨てを避ける)。
 */
export function chunkRichText(text: string): NotionRichTextItem[] {
  if (text.length === 0) return [];
  // 文字数で早期に上限チェック(巨大配列を確保する前に弾く)。
  if (text.length > RICH_TEXT_CHUNK * RICH_TEXT_MAX_ITEMS) {
    throw new Error(
      `テキストが長すぎます(${text.length} 文字 > ${RICH_TEXT_CHUNK * RICH_TEXT_MAX_ITEMS})。`
    );
  }
  const items: NotionRichTextItem[] = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_CHUNK) {
    items.push({ text: { content: text.slice(i, i + RICH_TEXT_CHUNK) } });
  }
  return items;
}

/**
 * ページの複数プロパティを 1 PATCH で原子的に更新し、更新したページ ID を返す。
 * select / rich_text / date 等の Notion プロパティ値をそのまま渡す。
 */
export async function updatePageProps(
  pageId: string,
  properties: Record<string, unknown>,
  options: NotionApiOptions
): Promise<string> {
  const json = (await notionRequest(
    "PATCH",
    `${NOTION_API_BASE}/pages/${pageId}`,
    { properties },
    options
  )) as { id?: string };

  if (!json.id) {
    throw new Error("Notion 応答に id が含まれていません。");
  }
  return json.id;
}

/**
 * ページの select プロパティ(「ステータス」等)を更新し、更新したページ ID を返す。
 * 対象DBの「ステータス」は status 型ではなく select 型のため select で更新する。
 */
export function updatePageSelect(
  pageId: string,
  selectProperty: string,
  selectValue: string,
  options: NotionApiOptions
): Promise<string> {
  return updatePageProps(
    pageId,
    { [selectProperty]: { select: { name: selectValue } } },
    options
  );
}

/**
 * 指定 data source 配下にページを新規作成し、作成したページ ID を返す。
 * data sources API では parent に data_source_id を指定する(2025-09-03)。
 */
export async function createPage(
  dataSourceId: string,
  properties: Record<string, unknown>,
  options: NotionApiOptions
): Promise<string> {
  const json = (await notionRequest(
    "POST",
    `${NOTION_API_BASE}/pages`,
    {
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    },
    options
  )) as { id?: string };

  if (!json.id) {
    throw new Error("Notion 応答に id が含まれていません。");
  }
  return json.id;
}

/** 指定 data source の最新ページ(作成日降順の先頭)を返す。無ければ null。 */
export async function getLatestReport(
  dataSourceId: string,
  options: NotionApiOptions
): Promise<NotionPage | null> {
  const { pages } = await queryDataSource(
    dataSourceId,
    { sorts: [{ timestamp: "created_time", direction: "descending" }], pageSize: 1 },
    options
  );
  return pages[0] ?? null;
}
