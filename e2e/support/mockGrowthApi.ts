import { expect, type Page, type Request, type Route } from "@playwright/test";

import type { PendingItem } from "../../src/app/growth/approve/types";

type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export interface RecordedRequest {
  method: string;
  path: string;
  body: JsonValue | undefined;
}

export interface MockResponse {
  status: number;
  body: JsonObject;
}

interface InstallMockGrowthApiOptions {
  items: PendingItem[];
  publishResponses?: MockResponse[];
}

interface DraftFixture {
  title: string;
  bodyHtml: string;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && Object.values(value).every(isJsonValue);
}

function bodyOf(request: Request): JsonValue | undefined {
  const text = request.postData();
  if (text === null || text === "") return undefined;
  const parsed: unknown = JSON.parse(text);
  if (!isJsonValue(parsed)) throw new TypeError("JSON以外のリクエスト本文です");
  return parsed;
}

function objectBody(value: JsonValue | undefined): JsonObject {
  if (value === undefined || value === null || Array.isArray(value) || typeof value !== "object") return {};
  return value;
}

async function fulfillJson(route: Route, status: number, body: JsonObject): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

export class MockGrowthApi {
  private readonly items: PendingItem[];
  private readonly drafts = new Map<string, DraftFixture>();
  private readonly publishResponses: MockResponse[];
  private readonly unexpected: string[] = [];
  private isAuthenticated = false;
  public unauthorizedApproveCount = 0;
  public readonly requests: RecordedRequest[] = [];

  public constructor(options: InstallMockGrowthApiOptions) {
    this.items = structuredClone(options.items);
    this.publishResponses = [...(options.publishResponses ?? [])];
    for (const item of this.items) {
      if (item.isDraftReady) this.drafts.set(item.id, { title: item.title, bodyHtml: "<p>初期本文です。</p>" });
    }
  }

  public async install(page: Page): Promise<void> {
    await page.route("**/*", async (route) => this.handle(route));
  }

  public requestsFor(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && request.path === path);
  }

  public bodyFor(method: string, path: string): JsonValue | undefined {
    return this.requestsFor(method, path).at(-1)?.body;
  }

  public bodyAt(method: string, path: string, index: number): JsonValue | undefined {
    return this.requestsFor(method, path)[index]?.body;
  }

  public async waitForBody(method: string, path: string): Promise<JsonObject> {
    await expect.poll(() => this.requestsFor(method, path).length).toBeGreaterThan(0);
    return objectBody(this.bodyFor(method, path));
  }

  public assertNoUnexpectedRequests(): void {
    expect(this.unexpected, "未登録APIまたは外部hostへのアクセス").toEqual([]);
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!isLocal) {
      this.unexpected.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    if (!url.pathname.startsWith("/api/growth/")) {
      await route.continue();
      return;
    }

    const record: RecordedRequest = { method: request.method(), path: url.pathname, body: bodyOf(request) };
    this.requests.push(record);
    const body = objectBody(record.body);

    if (record.method === "GET" && record.path === "/api/growth/approve") {
      if (!this.isAuthenticated) {
        this.unauthorizedApproveCount += 1;
        await fulfillJson(route, 401, { success: false, error: "認証が必要です。" });
      } else {
        await fulfillJson(route, 200, { success: true, items: this.items as unknown as JsonValue });
      }
      return;
    }
    if (record.method === "POST" && record.path === "/api/growth/auth/session") {
      this.isAuthenticated = true;
      await fulfillJson(route, 200, { success: true });
      return;
    }
    if (record.method === "POST" && record.path === "/api/growth/auth/step-up") {
      await fulfillJson(route, 200, { success: true, expiresAt: Date.now() + 60_000 });
      return;
    }
    if (record.method === "GET" && record.path === "/api/growth/ops") {
      await fulfillJson(route, 200, {
        success: true,
        ops: {
          setupMissing: true,
          worker: { status: "unknown", workerId: null, lastHeartbeatAt: null, currentJob: null },
          currentTargets: [],
          recentRuns: [],
          recentFailures: [],
          reconcileFindings: [],
        },
      });
      return;
    }
    if (record.method === "POST" && record.path === "/api/growth/approve") {
      const decisions = body.decisions;
      if (Array.isArray(decisions)) {
        for (const decision of decisions) {
          const entry = objectBody(decision);
          if (entry.decision !== "承認" || typeof entry.id !== "string") continue;
          const item = this.items.find(({ id }) => id === entry.id);
          if (!item) continue;
          item.stage = "drafted";
          item.isDraftReady = true;
          item.contentId = `content-${item.id}`;
          item.eyecatchUrl = "/logos/tate-neon-logo.svg";
          item.hasDraftBody = true;
          this.drafts.set(item.id, { title: item.title, bodyHtml: "<p>生成された本文です。</p>" });
        }
      }
      await fulfillJson(route, 200, { success: true });
      return;
    }
    if (record.method === "GET" && record.path === "/api/growth/draft") {
      const pageId = url.searchParams.get("pageId") ?? "";
      const draft = this.drafts.get(pageId);
      await fulfillJson(route, 200, draft
        ? { success: true, exists: true, draft: { ...draft, displayMode: "html", body: "" } }
        : { success: true, exists: false });
      return;
    }
    if (record.method === "POST" && record.path === "/api/growth/draft/edit") {
      if (typeof body.pageId === "string" && typeof body.bodyHtml === "string") {
        const current = this.drafts.get(body.pageId);
        this.drafts.set(body.pageId, { title: current?.title ?? "下書き", bodyHtml: body.bodyHtml });
      }
      await fulfillJson(route, 200, { success: true });
      return;
    }
    if (record.method === "POST" && record.path === "/api/growth/publish/schedule") {
      if (typeof body.pageId === "string") {
        const item = this.items.find(({ id }) => id === body.pageId);
        if (item) item.scheduledAtMs = typeof body.scheduledAt === "string" ? Date.parse(body.scheduledAt) : null;
      }
      await fulfillJson(route, 200, { success: true });
      return;
    }
    if (record.method === "POST" && record.path === "/api/growth/publish") {
      const response = this.publishResponses.shift() ?? {
        status: 200,
        body: { success: true, outcome: "success", message: "公開しました。", completedStages: [], events: [], externalIds: {} },
      };
      await fulfillJson(route, response.status, response.body);
      return;
    }

    this.unexpected.push(`${record.method} ${record.path}`);
    await fulfillJson(route, 501, { success: false, error: "E2E未登録API" });
  }
}

export async function installMockGrowthApi(
  page: Page,
  options: InstallMockGrowthApiOptions,
): Promise<MockGrowthApi> {
  const api = new MockGrowthApi(options);
  await api.install(page);
  return api;
}
