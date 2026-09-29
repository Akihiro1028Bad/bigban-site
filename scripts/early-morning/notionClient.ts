/** Notion REST API の薄いクライアント。429 は Retry-After、5xx は1秒待って再試行する。 */
import { z } from "zod";

import type { FetchFn } from "../growth/http";
import type { NotionPage } from "./notionProps";

const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const DEFAULT_RETRY_MS = 1000;

export class NotionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

export interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionClient {
  getDatabase(id: string): Promise<{ properties: Record<string, { id: string }> }>;
  queryAll(databaseId: string, body?: Record<string, unknown>, filterPropertyIds?: readonly string[]): Promise<NotionPage[]>;
  createPage(databaseId: string, properties: Record<string, unknown>): Promise<NotionPage>;
  updatePage(pageId: string, properties: Record<string, unknown>): Promise<void>;
  archivePage(pageId: string): Promise<void>;
  listChildren(blockId: string): Promise<NotionBlock[]>;
  deleteBlock(blockId: string): Promise<void>;
  appendChildren(blockId: string, children: readonly unknown[]): Promise<void>;
}

const pageSchema = z.object({ id: z.string(), properties: z.record(z.string(), z.unknown()) });
const listSchema = <T extends z.ZodType>(item: T) =>
  z.object({ results: z.array(item), has_more: z.boolean(), next_cursor: z.string().nullable() });
const blockSchema = z.object({ id: z.string(), type: z.string() }).passthrough();
const databaseSchema = z.object({ properties: z.record(z.string(), z.object({ id: z.string() })) });

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new NotionApiError(`${label} の応答の形が想定と違います`, 200);
  return result.data;
}

export function createNotionClient(options: {
  token: string;
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  maxRetries?: number;
}): NotionClient {
  const maxRetries = options.maxRetries ?? 3;

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const res = await options.fetchFn(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new NotionApiError(`Notion API ${method} ${path} が失敗しました (HTTP ${res.status}): ${await res.text()}`, res.status);
      }
      const retryAfter = Number(res.headers?.get("retry-after"));
      await options.sleep(res.status === 429 && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_MS);
    }
  }

  async function paginate<T>(fetchPage: (cursor: string | null) => Promise<{ results: T[]; has_more: boolean; next_cursor: string | null }>): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | null = null;
    do {
      const page = await fetchPage(cursor);
      all.push(...page.results);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return all;
  }

  return {
    async getDatabase(id) {
      return parse(databaseSchema, await request("GET", `/databases/${id}`), "getDatabase");
    },
    async queryAll(databaseId, body = {}, filterPropertyIds = []) {
      const query = filterPropertyIds.map((id) => `filter_properties=${encodeURIComponent(id)}`).join("&");
      const path = `/databases/${databaseId}/query${query ? `?${query}` : ""}`;
      return paginate(async (cursor) =>
        parse(listSchema(pageSchema), await request("POST", path, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }), "queryAll"),
      );
    },
    async createPage(databaseId, properties) {
      return parse(pageSchema, await request("POST", "/pages", { parent: { database_id: databaseId }, properties }), "createPage");
    },
    async updatePage(pageId, properties) {
      await request("PATCH", `/pages/${pageId}`, { properties });
    },
    async archivePage(pageId) {
      await request("PATCH", `/pages/${pageId}`, { archived: true });
    },
    async listChildren(blockId) {
      return paginate(async (cursor) =>
        parse(
          listSchema(blockSchema),
          await request("GET", `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`),
          "listChildren",
        ),
      );
    },
    async deleteBlock(blockId) {
      await request("DELETE", `/blocks/${blockId}`);
    },
    async appendChildren(blockId, children) {
      await request("PATCH", `/blocks/${blockId}/children`, { children });
    },
  };
}
