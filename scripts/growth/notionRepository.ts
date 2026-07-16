import {
  NotionHttpError,
  queryDataSourcePage,
  type NotionApiOptions,
  type NotionPage,
  type QueryDataSourceBody,
  type QueryDataSourceResult,
} from "./notion";

export const NOTION_PAGE_SIZE = 100;
export const NOTION_MAX_PAGES = 100;
export const NOTION_MAX_ITEMS = 10_000;
export const NOTION_MAX_ATTEMPTS = 4;
export const NOTION_BASE_RETRY_MS = 500;
export const NOTION_MAX_RETRY_MS = 30_000;

type QueryBody = Omit<QueryDataSourceBody, "pageSize" | "startCursor">;
type SleepFn = (delayMs: number) => Promise<void>;

export interface NotionRepositoryOptions {
  sleepFn?: SleepFn;
}

/* istanbul ignore next -- @preserve 実待機は注入sleepFnで置換し、単体テストでは時間を進めない */
const defaultSleep: SleepFn = (delayMs) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof NotionHttpError)) return true;
  return error.status === 429 || error.status >= 500;
}

function retryDelay(error: unknown, attempt: number): number {
  if (error instanceof NotionHttpError && error.status === 429 && error.retryAfterMs !== null) {
    return Math.min(error.retryAfterMs, NOTION_MAX_RETRY_MS);
  }
  return Math.min(NOTION_BASE_RETRY_MS * 2 ** (attempt - 1), NOTION_MAX_RETRY_MS);
}

async function queryPageWithRetry(
  dataSourceId: string,
  body: QueryDataSourceBody,
  options: NotionApiOptions,
  repositoryOptions: NotionRepositoryOptions,
): Promise<QueryDataSourceResult> {
  const sleep = repositoryOptions.sleepFn ?? defaultSleep;
  for (let attempt = 1; attempt <= NOTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await queryDataSourcePage(dataSourceId, body, options);
    } catch (error: unknown) {
      if (!shouldRetry(error) || attempt === NOTION_MAX_ATTEMPTS) throw error;
      await sleep(retryDelay(error, attempt));
    }
  }
  /* istanbul ignore next -- @preserve ループ最終試行のcatchが必ずreturnまたはthrowする */
  throw new Error("Notion Data Source Query の再試行が予期せず終了しました。");
}

export async function queryAllDataSource(
  dataSourceId: string,
  body: QueryBody,
  options: NotionApiOptions,
  repositoryOptions: NotionRepositoryOptions = {},
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  const usedCursors = new Set<string>();
  let startCursor: string | undefined;

  for (let pageNumber = 1; pageNumber <= NOTION_MAX_PAGES; pageNumber += 1) {
    const result = await queryPageWithRetry(
      dataSourceId,
      { ...body, pageSize: NOTION_PAGE_SIZE, ...(startCursor ? { startCursor } : {}) },
      options,
      repositoryOptions,
    );
    if (pages.length + result.pages.length > NOTION_MAX_ITEMS) {
      throw new Error(`Notion Data Source Query が最大件数 ${NOTION_MAX_ITEMS} 件を超えました。`);
    }
    pages.push(...result.pages);
    if (!result.hasMore) return pages;
    if (!result.nextCursor) {
      throw new Error("Notion API が has_more=true なのに next_cursor を返しませんでした。");
    }
    if (usedCursors.has(result.nextCursor) || result.nextCursor === startCursor) {
      throw new Error(`Notion API が使用済みカーソルを返しました: ${result.nextCursor}`);
    }
    if (pageNumber === NOTION_MAX_PAGES) {
      throw new Error(`Notion Data Source Query が最大ページ数 ${NOTION_MAX_PAGES} に到達しました。`);
    }
    usedCursors.add(result.nextCursor);
    startCursor = result.nextCursor;
  }
  /* istanbul ignore next -- @preserve 最大ページ到達時はループ内で必ずthrowする */
  throw new Error("Notion Data Source Query が予期せず終了しました。");
}

export async function queryFirstDataSource(
  dataSourceId: string,
  body: QueryBody,
  options: NotionApiOptions,
  repositoryOptions: NotionRepositoryOptions = {},
): Promise<NotionPage | null> {
  const result = await queryPageWithRetry(
    dataSourceId,
    { ...body, pageSize: 1 },
    options,
    repositoryOptions,
  );
  return result.pages[0] ?? null;
}

/** 降順ログ等を上限件数だけ読み、履歴全体はページングしない。 */
export async function queryRecentDataSource(
  dataSourceId: string,
  body: QueryBody,
  limit: number,
  options: NotionApiOptions,
  repositoryOptions: NotionRepositoryOptions = {},
): Promise<NotionPage[]> {
  const result = await queryPageWithRetry(
    dataSourceId,
    { ...body, pageSize: limit },
    options,
    repositoryOptions,
  );
  return result.pages;
}

export function getLatestReport(
  dataSourceId: string,
  options: NotionApiOptions,
  repositoryOptions: NotionRepositoryOptions = {},
): Promise<NotionPage | null> {
  return queryFirstDataSource(
    dataSourceId,
    { sorts: [{ timestamp: "created_time", direction: "descending" }] },
    options,
    repositoryOptions,
  );
}
