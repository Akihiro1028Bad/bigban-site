// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "../growth/http";
import type { NotionBlock, NotionClient } from "./notionClient";
import type { NotionPage } from "./notionProps";
import { runSync } from "./sync";

const ids = {
  ledgerDb: "ledger",
  peopleDb: "people",
  recordsDb: "records",
  sessionsDb: "sessions",
  bridgePage: "bridge",
  peopleDbUrl: "https://www.notion.so/people",
};

function html(state: unknown): string {
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify(state)}}());</script>`;
}

const circle = {
  state: { feature: { circle: { circleDetail: { CircleOrganizedEvents: {
    circleOrganizedFutureEventList: [{ id: 2, startDatetimeString: "2026-10-06T06:00:00.000+09:00", callOff: false }],
    circleOrganizedPastEventList: [{ id: 1, startDatetimeString: "2026-09-29T06:00:00.000+09:00", callOff: false }],
  } } } } },
};

function detail(id: number, start: string, userIds: number[]) {
  return {
    state: { feature: { event: { eventDetail: { EventDetail: { event: {
      id, startDateTime: start, callOff: false, cancelUserList: [],
      participantList: userIds.map((uid) => ({
        eventUserStatusType: "APPROVE", guestUserFlg: false, applyDateTime: null, user: { id: uid, name: `テスト${uid}` },
      })),
    } } } } } },
  };
}

function res(body: string, status = 200): HttpResponse {
  return { ok: status < 400, status, json: async () => ({}), text: async () => body };
}

function tennisbear(status = 200): FetchFn {
  return vi.fn<FetchFn>(async (url) => {
    if (status !== 200) return res("", status);
    if (url.endsWith("/events")) return res(html(circle));
    if (url.endsWith("/event/1/info")) return res(html(detail(1, "2026-09-29T06:00:00.000+09:00", [11, 12])));
    return res(html(detail(2, "2026-10-06T06:00:00.000+09:00", [11])));
  });
}

/** 実際の Notion API は読み取り時に plain_text を返すので、偽物でも書いた値に plain_text を補う。 */
function addPlainText(_key: string, value: unknown): unknown {
  if (typeof value === "object" && value !== null && "text" in value) {
    const text = (value as { text?: { content?: unknown } }).text;
    if (typeof text?.content === "string") return { ...value, plain_text: text.content };
  }
  return value;
}

function withPlainText(properties: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(properties, addPlainText)) as Record<string, unknown>;
}

class MemoryNotion implements NotionClient {
  pages = new Map<string, { db: string; properties: Record<string, unknown> }>();
  blocks: NotionBlock[] = [];
  failOn: string | null = null;
  private seq = 0;
  async getDatabase() {
    return { properties: Object.fromEntries(["予約番号", "予約者", "利用日", "時間帯", "ステータス", "受付日時"].map((n) => [n, { id: n }])) };
  }
  async queryAll(databaseId: string): Promise<NotionPage[]> {
    if (this.failOn === `query ${databaseId}`) throw new Error(`query ${databaseId} failed`);
    if (databaseId === "ledger") {
      return [{ id: "l1", properties: {
        予約番号: { title: [{ plain_text: "#1" }] }, 予約者: { rich_text: [{ plain_text: "テスト花子" }] },
        利用日: { date: { start: "2026-09-29" } }, 時間帯: { rich_text: [{ plain_text: "06:00～08:00" }] },
        ステータス: { select: { name: "有効" } }, 受付日時: { date: null },
      } }];
    }
    return [...this.pages.entries()].filter(([, p]) => p.db === databaseId).map(([id, p]) => ({ id, properties: p.properties }));
  }
  async createPage(databaseId: string, properties: Record<string, unknown>) {
    if (this.failOn === `create ${databaseId}`) throw new Error("create failed");
    const id = `p${++this.seq}`;
    this.pages.set(id, { db: databaseId, properties: withPlainText(properties) });
    return { id, properties };
  }
  async updatePage(pageId: string, properties: Record<string, unknown>) {
    const page = this.pages.get(pageId)!;
    page.properties = { ...page.properties, ...withPlainText(properties) };
  }
  async archivePage(pageId: string) {
    this.pages.delete(pageId);
  }
  async listChildren() {
    if (this.failOn === "listChildren") throw new Error("bridge failed");
    return this.blocks;
  }
  async deleteBlock(blockId: string) {
    this.blocks = this.blocks.filter((b) => b.id !== blockId);
  }
  async appendChildren(_id: string, children: readonly unknown[]) {
    this.blocks = children.map((c, i) => {
      const block = c as { code: { rich_text: Array<{ text: { content: string } }> } };
      return { id: `b${i}`, type: "code", code: { rich_text: block.code.rich_text.map((t) => ({ plain_text: t.text.content })) } };
    });
  }
  bridge(): Record<string, unknown> {
    const code = this.blocks[0] as unknown as { code: { rich_text: Array<{ plain_text: string }> } };
    return JSON.parse(code.code.rich_text.map((t) => t.plain_text).join(""));
  }
}

const now = new Date("2026-10-05T11:30:00Z"); // JST 2026-10-05 20:30

describe("runSync", () => {
  it("取得・計算・書き込み・橋渡しを行い、件数を返す", async () => {
    const notion = new MemoryNotion();
    const summary = await runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now, ids });

    expect(summary).toEqual({
      events: 2,
      sessions: 2,
      people: 3,
      records: 4,
      unmatchedReservations: 0,
      ignoredStatuses: 0,
      writes: { created: 9, updated: 0, archived: 0 },
      nextDate: "2026-10-06",
    });
    const bridge = notion.bridge();
    expect(bridge).toMatchObject({ nextDate: "2026-10-06", updatedAt: "2026-10-05T20:30:00+09:00", status: "ok", failure: null });
    expect(JSON.stringify(bridge.flex)).toContain("テスト11");
    expect(JSON.stringify(bridge.flex)).toContain("2回目");

    const again = await runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now, ids });
    expect(again.writes).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("次回の開催回がなければ nextDate と flex は null", async () => {
    const notion = new MemoryNotion();
    const later = new Date("2026-10-06T11:30:00Z");
    const summary = await runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now: later, ids });
    expect(summary.nextDate).toBeNull();
    expect(notion.bridge()).toMatchObject({ nextDate: null, flex: null });
  });

  it("テニスベアの取得に失敗したら橋渡しを失敗にして例外を投げる", async () => {
    const notion = new MemoryNotion();
    await expect(runSync({ notion, fetchFn: tennisbear(503), sleep: async () => undefined, now, ids })).rejects.toThrow("HTTP 503");
    expect(notion.bridge()).toMatchObject({ status: "failed", failure: expect.stringContaining("テニスベア") });
    expect([...notion.pages.values()]).toHaveLength(0);
  });

  it("予約台帳・Notion 読み取り・書き込みの失敗もそれぞれ理由を残す", async () => {
    for (const [failOn, label] of [["query ledger", "予約台帳"], ["query people", "Notion読み取り"], ["create sessions", "Notion書き込み"]] as const) {
      const notion = new MemoryNotion();
      notion.failOn = failOn;
      await expect(runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now, ids })).rejects.toThrow();
      expect(notion.bridge()).toMatchObject({ status: "failed", failure: expect.stringContaining(label) });
    }
  });

  it("橋渡しの更新も失敗したら元の例外を投げる", async () => {
    const notion = new MemoryNotion();
    notion.failOn = "listChildren";
    await expect(runSync({ notion, fetchFn: tennisbear(503), sleep: async () => undefined, now, ids })).rejects.toThrow("HTTP 503");
  });

  it("Error 以外が投げられても文字列にして残す", async () => {
    const notion = new MemoryNotion();
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw "boom";
    });
    await expect(runSync({ notion, fetchFn, sleep: async () => undefined, now, ids })).rejects.toBe("boom");
    expect(notion.bridge()).toMatchObject({ failure: "テニスベア: boom" });
  });
});
