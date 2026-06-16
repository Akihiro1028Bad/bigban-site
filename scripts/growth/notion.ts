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

/**
 * ページの select プロパティ(「ステータス」等)を更新し、更新したページ ID を返す。
 * 対象DBの「ステータス」は status 型ではなく select 型のため select で更新する。
 */
export async function updatePageSelect(
  pageId: string,
  selectProperty: string,
  selectValue: string,
  options: NotionApiOptions
): Promise<string> {
  const json = (await notionRequest(
    "PATCH",
    `${NOTION_API_BASE}/pages/${pageId}`,
    { properties: { [selectProperty]: { select: { name: selectValue } } } },
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
