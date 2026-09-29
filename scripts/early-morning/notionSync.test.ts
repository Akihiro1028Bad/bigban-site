// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionBlock, NotionClient } from "./notionClient";
import { readPlainText, readSelect, type NotionPage } from "./notionProps";
import {
  deriveAbsentKeys,
  deriveLinks,
  hashOf,
  markBridgeFailed,
  readBridge,
  readNotionState,
  syncPeople,
  syncRecords,
  syncSessions,
  writeBridge,
  type BridgePayload,
  type RecordRow,
} from "./notionSync";
import type { AttendanceRecord, PersonStats, Session } from "./types";

const ids = { peopleDb: "people", recordsDb: "records", sessionsDb: "sessions", bridgePage: "bridge" };

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

class FakeNotion implements NotionClient {
  pages = new Map<string, { db: string; properties: Record<string, unknown>; archived: boolean }>();
  blocks: NotionBlock[] = [];
  log: string[] = [];
  failAppend = false;
  private seq = 0;

  seed(db: string, properties: Record<string, unknown>): string {
    const id = `seed${++this.seq}`;
    this.pages.set(id, { db, properties, archived: false });
    return id;
  }
  async getDatabase() {
    return { properties: {} };
  }
  async queryAll(databaseId: string): Promise<NotionPage[]> {
    return [...this.pages.entries()]
      .filter(([, p]) => p.db === databaseId && !p.archived)
      .map(([id, p]) => ({ id, properties: p.properties }));
  }
  async createPage(databaseId: string, properties: Record<string, unknown>) {
    const id = `new${++this.seq}`;
    this.pages.set(id, { db: databaseId, properties: withPlainText(properties), archived: false });
    this.log.push(`create ${databaseId}`);
    return { id, properties };
  }
  async updatePage(pageId: string, properties: Record<string, unknown>) {
    const page = this.pages.get(pageId)!;
    page.properties = { ...page.properties, ...withPlainText(properties) };
    this.log.push(`update ${pageId} ${Object.keys(properties).sort().join(",")}`);
  }
  async archivePage(pageId: string) {
    this.pages.get(pageId)!.archived = true;
    this.log.push(`archive ${pageId}`);
  }
  async listChildren() {
    return this.blocks;
  }
  async deleteBlock(blockId: string) {
    this.blocks = this.blocks.filter((b) => b.id !== blockId);
    this.log.push(`delete ${blockId}`);
  }
  async appendChildren(_blockId: string, children: readonly unknown[]) {
    if (this.failAppend) throw new Error("append failed");
    this.blocks = [...this.blocks, ...children.map((c) => ({ id: `blk${++this.seq}`, ...(c as Record<string, unknown>), type: "code" }))];
    this.log.push("append");
  }
}

const text = (v: string) => ({ rich_text: [{ plain_text: v }] });
const title = (v: string) => ({ title: [{ plain_text: v }] });

function stats(key: string, overrides: Partial<PersonStats> = {}): PersonStats {
  return {
    key,
    displayName: `名前${key}`,
    tbId: key.startsWith("tb:") ? Number(key.slice(3)) : null,
    lbName: null,
    total: 5,
    classCounts: { 初中級: 4, 中級以上: 1 },
    streak: 2,
    firstDate: "2026-08-04",
    lastDate: "2026-09-29",
    state: "常連",
    nextMilestone: "あと5回で10回",
    reachedMilestones: [5],
    isNextApplied: true,
    ...overrides,
  };
}

function rec(date: string, personKey: string, ordinal: number | null = 1): AttendanceRecord {
  return { key: `${date}_${personKey}`, date, personKey, route: "テニスベア", appliedAt: null, status: "申込", sources: ["tb:1"], ordinal };
}

describe("readNotionState / deriveLinks / deriveAbsentKeys", () => {
  it("3つの DB を読み、対応表と欠席キーを作る", async () => {
    const notion = new FakeNotion();
    notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト　太郎"),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text("m"), 同期ハッシュ: text("h1"),
    });
    notion.seed("people", { 識別子: text("tb:8"), テニスベアID: { number: 8 }, LaBOLA氏名: text(""), 同期ハッシュ: text("") });
    notion.seed("records", { キー: title("2026-09-15_lb:テスト太郎"), 出欠: { select: { name: "欠席" } }, 状態: { select: { name: "申込" } }, 同期ハッシュ: text("r") });
    notion.seed("records", { キー: title("2026-09-22_tb:8"), 出欠: { select: null }, 状態: { select: null }, 同期ハッシュ: text("") });
    notion.seed("sessions", { 開催日: title("2026-09-22"), 同期ハッシュ: text("s") });

    const state = await readNotionState(notion, ids);
    expect(state.people.map((p) => [p.key, p.tbId, p.lbName, p.rewarded, p.memo])).toEqual([
      ["tb:7", 7, "テスト　太郎", ["5"], "m"],
      ["tb:8", 8, null, [], ""],
    ]);
    expect(state.records.map((r) => [r.date, r.personKey, r.isAbsent, r.status])).toEqual([
      ["2026-09-15", "lb:テスト太郎", true, "申込"],
      ["2026-09-22", "tb:8", false, null],
    ]);
    expect(state.sessions).toEqual([{ pageId: expect.any(String), date: "2026-09-22", hash: "s" }]);
    expect(state.people.map((p) => p.isNextApplied)).toEqual([false, false]);

    const links = deriveLinks(state.people);
    expect(links).toEqual([{ tbId: 7, lbName: "テスト　太郎" }]);
    expect([...deriveAbsentKeys(state.records, links)]).toEqual(["2026-09-15_tb:7"]);
  });
});

describe("deriveAbsentKeys 追加ケース", () => {
  it("対応表にない LaBOLA 氏名はキーをそのまま使う", () => {
    const records: RecordRow[] = [
      { pageId: "p", key: "2026-09-15_lb:未知太郎", date: "2026-09-15", personKey: "lb:未知太郎", status: "申込", isAbsent: true, hash: "" },
    ];
    expect([...deriveAbsentKeys(records, [{ tbId: 7, lbName: "テスト太郎" }])]).toEqual(["2026-09-15_lb:未知太郎"]);
  });
});

describe("syncSessions", () => {
  it("同じ開催日の行が重複していれば1つを残してアーカイブする", async () => {
    const notion = new FakeNotion();
    notion.seed("sessions", { 開催日: title("2026-09-22"), 同期ハッシュ: text("") });
    notion.seed("sessions", { 開催日: title("2026-09-22"), 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const counts = await syncSessions(notion, ids, [{ date: "2026-09-22", tbEventIds: [1], isCallOff: false, classType: "初中級" }], [], state.sessions);
    expect(counts).toEqual({ created: 0, updated: 1, archived: 1 });
  });

  it("新しい回は作成、変化した回だけ更新", async () => {
    const notion = new FakeNotion();
    const sessionsInput: Session[] = [
      { date: "2026-09-22", tbEventIds: [1, 2], isCallOff: false, classType: "初中級" },
      { date: "2026-09-29", tbEventIds: [3], isCallOff: false, classType: "初中級" },
    ];
    const counts1 = await syncSessions(notion, ids, sessionsInput, [rec("2026-09-22", "tb:1")], []);
    expect(counts1).toEqual({ created: 2, updated: 0, archived: 0 });

    const state = await readNotionState(notion, ids);
    const counts2 = await syncSessions(notion, ids, sessionsInput, [rec("2026-09-22", "tb:1")], state.sessions);
    expect(counts2).toEqual({ created: 0, updated: 0, archived: 0 });

    const counts3 = await syncSessions(notion, ids, sessionsInput, [rec("2026-09-22", "tb:1"), rec("2026-09-22", "tb:2")], state.sessions);
    expect(counts3).toEqual({ created: 0, updated: 1, archived: 0 });
  });
});

describe("syncSessions のクラス列", () => {
  it("開催回のクラスを クラス(select)に書く", async () => {
    const notion = new FakeNotion();
    const input: Session[] = [
      { date: "2026-10-06", tbEventIds: [1], isCallOff: false, classType: "初中級" },
      { date: "2026-10-01", tbEventIds: [2], isCallOff: false, classType: "中級以上" },
      { date: "2026-06-24", tbEventIds: [3], isCallOff: false, classType: "その他" },
    ];
    await syncSessions(notion, ids, input, [], []);
    const rows = await notion.queryAll("sessions");
    const classes = new Map(rows.map((row) => [readPlainText(row, "開催日"), readSelect(row, "クラス")]));
    expect(classes).toEqual(new Map([["2026-10-06", "初中級"], ["2026-10-01", "中級以上"], ["2026-06-24", "その他"]]));
  });
});

describe("syncPeople", () => {
  it("作成・差分更新・未渡し節目・スタッフ列の保持", async () => {
    const notion = new FakeNotion();
    const existingId = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text(""),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text("スタッフのメモ"), 同期ハッシュ: text("old"),
    });
    const state = await readNotionState(notion, ids);

    const result = await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] }), stats("tb:9")], state.people, []);

    expect(result.counts).toEqual({ created: 1, updated: 1, archived: 0 });
    expect(result.pageIdByKey.get("tb:7")).toBe(existingId);
    const updated = notion.pages.get(existingId)!.properties;
    expect(updated.未渡し節目).toEqual({ multi_select: [{ name: "10" }] });
    expect(updated.メモ).toEqual(text("スタッフのメモ"));
    expect(notion.log.find((l) => l.startsWith("update"))).not.toContain("リワード済み");
    expect(updated["初中級(火)"]).toEqual({ number: 4 });
    expect(updated["中級以上(木)"]).toEqual({ number: 1 });
    expect(Object.keys(updated)).not.toContain("直近8回");

    const again = await readNotionState(notion, ids);
    const second = await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] }), stats("tb:9")], again.people, []);
    expect(second.counts).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("LaBOLA単独行を対応表の人に統合し、リワード済みは和集合・メモは空欄補完", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text(""), 同期ハッシュ: text(""),
    });
    const source = notion.seed("people", {
      識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "10" }] }, メモ: text("LaBOLA側のメモ"), 同期ハッシュ: text(""),
    });
    const state = await readNotionState(notion, ids);
    const links = deriveLinks(state.people);

    const result = await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] })], state.people, links);

    expect(result.counts.archived).toBe(1);
    expect(notion.pages.get(source)!.archived).toBe(true);
    const merged = notion.pages.get(target)!.properties;
    expect(merged.リワード済み).toEqual({ multi_select: [{ name: "10" }, { name: "5" }] });
    expect(readPlainText({ id: target, properties: merged }, "メモ")).toBe("LaBOLA側のメモ");
    expect(merged.未渡し節目).toEqual({ multi_select: [] });
  });

  it("統合先にメモがあれば残し、両方空ならメモは空", async () => {
    for (const [targetMemo, sourceMemo, expected] of [["A", "B", "A"], ["", "", ""]] as const) {
      const notion = new FakeNotion();
      const target = notion.seed("people", {
        識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"), メモ: text(targetMemo), 同期ハッシュ: text(""),
      });
      notion.seed("people", { 識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"), メモ: text(sourceMemo), 同期ハッシュ: text("") });
      const state = await readNotionState(notion, ids);
      await syncPeople(notion, ids, [stats("tb:7")], state.people, deriveLinks(state.people));
      expect(readPlainText({ id: target, properties: notion.pages.get(target)!.properties }, "メモ")).toBe(expected);
    }
  });

  it("同じ識別子の行が重複していれば1つを残してアーカイブする", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("tb:7"), テニスベアID: { number: 7 }, 同期ハッシュ: text("") });
    const dup = notion.seed("people", { 識別子: text("tb:7"), テニスベアID: { number: 7 }, 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const result = await syncPeople(notion, ids, [stats("tb:7")], state.people, []);
    expect(result.counts.archived).toBe(1);
    expect(notion.pages.get(dup)!.archived).toBe(true);
  });

  it("統合先の行がまだなければ統合しない", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"), 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const result = await syncPeople(notion, ids, [], state.people, [{ tbId: 99, lbName: "テスト太郎" }]);
    expect(result.counts).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("重複行のリワード済み・メモを残す行に引き継ぐ", async () => {
    const notion = new FakeNotion();
    const kept = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 },
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text(""), 同期ハッシュ: text(""),
    });
    const dup = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 },
      リワード済み: { multi_select: [{ name: "10" }] }, メモ: text("重複行のメモ"), 同期ハッシュ: text(""),
    });
    const state = await readNotionState(notion, ids);

    const result = await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] })], state.people, []);

    expect(result.counts.archived).toBe(1);
    expect(notion.pages.get(dup)!.archived).toBe(true);
    const merged = notion.pages.get(kept)!.properties;
    expect(merged.リワード済み).toEqual({ multi_select: [{ name: "10" }, { name: "5" }] });
    expect(readPlainText({ id: kept, properties: merged }, "メモ")).toBe("重複行のメモ");
    expect(merged.未渡し節目).toEqual({ multi_select: [] });
  });

  it("重複行のメモが両方空でもリワード済みの差分だけで引き継ぎを更新する", async () => {
    const notion = new FakeNotion();
    const kept = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 },
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text(""), 同期ハッシュ: text(""),
    });
    notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 },
      リワード済み: { multi_select: [{ name: "10" }] }, メモ: text(""), 同期ハッシュ: text(""),
    });
    const state = await readNotionState(notion, ids);

    await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] })], state.people, []);

    const merged = notion.pages.get(kept)!.properties;
    expect(merged.リワード済み).toEqual({ multi_select: [{ name: "10" }, { name: "5" }] });
    expect(readPlainText({ id: kept, properties: merged }, "メモ")).toBe("");
  });
});

describe("syncPeople のスタッフ列の保護", () => {
  it("統合先にメモがあるときはメモを書かない(古いスナップショットで上書きしない)", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text("先方のメモ"), 同期ハッシュ: text(""),
    });
    notion.seed("people", {
      識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "10" }] }, メモ: text("LaBOLA側のメモ"), 同期ハッシュ: text(""),
    });
    const state = await readNotionState(notion, ids);
    await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] })], state.people, deriveLinks(state.people));
    const mergeUpdate = notion.log.find((l) => l.startsWith(`update ${target}`))!;
    expect(mergeUpdate).toBe(`update ${target} リワード済み`);
    expect(readPlainText({ id: target, properties: notion.pages.get(target)!.properties }, "メモ")).toBe("先方のメモ");
  });

  it("統合でメモを引き継ぐときだけメモを書く", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"), メモ: text(""), 同期ハッシュ: text(""),
    });
    notion.seed("people", { 識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"), メモ: text("引き継ぐ"), 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    await syncPeople(notion, ids, [stats("tb:7")], state.people, deriveLinks(state.people));
    expect(notion.log.find((l) => l.startsWith(`update ${target}`))).toBe(`update ${target} メモ`);
  });

  it("統合で書く内容(新しいリワード済み・引き継ぐメモ)がなければ更新しない", async () => {
    const notion = new FakeNotion();
    notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text("先方"), 同期ハッシュ: text(""),
    });
    notion.seed("people", {
      識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text(""), 同期ハッシュ: text(""),
    });
    const state = await readNotionState(notion, ids);
    const result = await syncPeople(notion, ids, [stats("tb:7")], state.people, deriveLinks(state.people));
    expect(result.counts.archived).toBe(1);
    expect(notion.log[0]).toBe("archive seed2");
    expect(notion.log.filter((l) => l.startsWith("update seed1 リワード済み") || l.startsWith("update seed1 メモ"))).toEqual([]);
  });

  it("重複行の統合でも、残す行にメモがあればメモを書かない", async () => {
    const notion = new FakeNotion();
    const kept = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 },
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text("残す側"), 同期ハッシュ: text(""),
    });
    notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 },
      リワード済み: { multi_select: [{ name: "10" }] }, メモ: text("重複側"), 同期ハッシュ: text(""),
    });
    const state = await readNotionState(notion, ids);
    await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] })], state.people, []);
    expect(notion.log.find((l) => l.startsWith(`update ${kept}`))).toBe(`update ${kept} リワード済み`);
  });

  it("重複行の統合でメモだけを引き継ぐときはメモだけを書く", async () => {
    const notion = new FakeNotion();
    const kept = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, メモ: text(""), 同期ハッシュ: text(""),
    });
    notion.seed("people", { 識別子: text("tb:7"), テニスベアID: { number: 7 }, メモ: text("重複側"), 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    await syncPeople(notion, ids, [stats("tb:7")], state.people, []);
    expect(notion.log.find((l) => l.startsWith(`update ${kept}`))).toBe(`update ${kept} メモ`);
  });

  it("テニスベアの人は LaBOLA氏名 を書かない(実行中にスタッフが入力した氏名を消さない)", async () => {
    const notion = new FakeNotion();
    const rowId = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("スタッフ入力"), 同期ハッシュ: text("old"),
    });
    const state = await readNotionState(notion, ids);
    await syncPeople(notion, ids, [stats("tb:7", { lbName: null }), stats("tb:9", { lbName: null })], state.people, []);
    expect(readPlainText({ id: rowId, properties: notion.pages.get(rowId)!.properties }, "LaBOLA氏名")).toBe("スタッフ入力");
    const created = [...notion.pages.values()].find((p) => JSON.stringify(p.properties.識別子).includes("tb:9"))!;
    expect(created.properties).not.toHaveProperty("LaBOLA氏名");
  });

  it("LaBOLA単独の人は LaBOLA氏名 を書く", async () => {
    const notion = new FakeNotion();
    await syncPeople(notion, ids, [stats("lb:テスト太郎", { lbName: "テスト太郎" })], [], []);
    const created = [...notion.pages.values()][0];
    expect(readPlainText({ id: "x", properties: created.properties }, "LaBOLA氏名")).toBe("テスト太郎");
  });

  it("計算から消えた人の次回申込が true のままなら false に戻してハッシュを空にする", async () => {
    const notion = new FakeNotion();
    const stale = notion.seed("people", {
      識別子: text("tb:5"), テニスベアID: { number: 5 }, 次回申込: { checkbox: true }, 同期ハッシュ: text("old"),
    });
    const already = notion.seed("people", {
      識別子: text("tb:6"), テニスベアID: { number: 6 }, 次回申込: { checkbox: false }, 同期ハッシュ: text("old"),
    });
    const state = await readNotionState(notion, ids);
    const result = await syncPeople(notion, ids, [], state.people, []);
    expect(result.counts).toEqual({ created: 0, updated: 1, archived: 0 });
    expect(notion.log).toEqual([`update ${stale} 同期ハッシュ,次回申込`]);
    expect(notion.pages.get(stale)!.properties.次回申込).toEqual({ checkbox: false });
    expect(notion.pages.get(stale)!.properties.同期ハッシュ).toEqual({ rich_text: [] });
    expect(notion.pages.get(already)!.properties.同期ハッシュ).toEqual(text("old"));
  });

  it("統合元としてアーカイブした行には次回申込の更新をしない", async () => {
    const notion = new FakeNotion();
    notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"), 同期ハッシュ: text(""),
    });
    notion.seed("people", { 識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"), 次回申込: { checkbox: true }, 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const result = await syncPeople(notion, ids, [stats("tb:7")], state.people, deriveLinks(state.people));
    expect(result.counts.archived).toBe(1);
    expect(notion.log.some((l) => l.startsWith("update seed2"))).toBe(false);
  });
});

describe("syncRecords", () => {
  it("作成・差分更新・統合元はアーカイブ・消えた記録は元データになし", async () => {
    const notion = new FakeNotion();
    const mergedAway = notion.seed("records", { キー: title("2026-09-08_lb:テスト太郎"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const vanished = notion.seed("records", { キー: title("2026-09-01_tb:5"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const alreadyGone = notion.seed("records", { キー: title("2026-08-25_tb:5"), 状態: { select: { name: "元データになし" } }, 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);

    const counts = await syncRecords(
      notion,
      ids,
      [rec("2026-09-08", "tb:7"), rec("2026-09-15", "tb:7", 2)],
      new Map([["tb:7", "pagePerson7"]]),
      state.records,
      [{ tbId: 7, lbName: "テスト太郎" }],
      new Set(),
    );

    expect(counts).toEqual({ created: 2, updated: 1, archived: 1 });
    expect(notion.pages.get(mergedAway)!.archived).toBe(true);
    expect(notion.pages.get(vanished)!.properties.状態).toEqual({ select: { name: "元データになし" } });
    expect(notion.log.some((l) => l.startsWith(`update ${alreadyGone}`))).toBe(false);
    const created = [...notion.pages.values()].find((p) => JSON.stringify(p.properties.キー).includes("2026-09-15_tb:7"))!;
    expect(created.properties.人).toEqual({ relation: [{ id: "pagePerson7" }] });
    expect(created.properties.回次).toEqual({ number: 2 });
    expect(created.properties).not.toHaveProperty("出欠");
  });

  it("人のページが見つからなければエラー", async () => {
    const notion = new FakeNotion();
    const failure = syncRecords(notion, ids, [rec("2026-09-08", "lb:テスト太郎")], new Map(), [], [], new Set());
    await expect(failure).rejects.toThrow("参加記録の人のページが見つかりません");
    await expect(failure).rejects.not.toThrow("テスト太郎");
  });

  it("変化のない記録は書かない", async () => {
    const notion = new FakeNotion();
    await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), [], [], new Set());
    const state = await readNotionState(notion, ids);
    const counts = await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), state.records, [], new Set());
    expect(counts).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("欠席の記録には出欠を書き写す(統合で作り直した行でも欠席が消えない)", async () => {
    const notion = new FakeNotion();
    await syncRecords(notion, ids, [rec("2026-09-15", "tb:7", null)], new Map([["tb:7", "p"]]), [], [], new Set(["2026-09-15_tb:7"]));
    const created = [...notion.pages.values()][0];
    expect(created.properties.出欠).toEqual({ select: { name: "欠席" } });
  });

  it("同じキーの行が重複していれば1つを残してアーカイブする", async () => {
    const notion = new FakeNotion();
    const first = notion.seed("records", { キー: title("2026-09-08_tb:7"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const second = notion.seed("records", { キー: title("2026-09-08_tb:7"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const counts = await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), state.records, [], new Set());
    expect(counts.archived).toBe(1);
    expect(notion.pages.get(first)!.archived).toBe(false);
    expect(notion.pages.get(second)!.archived).toBe(true);
  });

  it("消えて「元データになし」になった記録が復活すると状態が申込に戻る", async () => {
    const notion = new FakeNotion();
    await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), [], [], new Set());
    let state = await readNotionState(notion, ids);

    await syncRecords(notion, ids, [], new Map([["tb:7", "p"]]), state.records, [], new Set());
    state = await readNotionState(notion, ids);
    expect(state.records[0].status).toBe("元データになし");

    await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), state.records, [], new Set());
    state = await readNotionState(notion, ids);
    expect(state.records[0].status).toBe("申込");
  });
});

describe("bridge", () => {
  const payload: BridgePayload = {
    nextDate: "2026-10-06",
    updatedAt: "2026-10-05T20:31:00+09:00",
    status: "ok",
    failure: null,
    flex: { type: "flex", altText: "a", contents: { type: "bubble", note: "x".repeat(2500) } },
  };

  it("先に新しい JSON コードブロックを追加してから古いブロックを消し、読み戻せる", async () => {
    const notion = new FakeNotion();
    notion.blocks = [{ id: "old", type: "paragraph" }];
    await writeBridge(notion, "bridge", payload);
    expect(notion.log).toEqual(["append", "delete old"]);
    expect(notion.blocks).toHaveLength(1);
    const code = notion.blocks[0] as unknown as { code: { rich_text: Array<{ text: { content: string } }> } };
    expect(code.code.rich_text.length).toBeGreaterThan(1);
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: code.code.rich_text.map((t) => ({ plain_text: t.text.content })) } }];
    await expect(readBridge(notion, "bridge")).resolves.toEqual(payload);
  });

  it("追加に失敗しても前回のブロックが残り、前回の内容を読める", async () => {
    const notion = new FakeNotion();
    const previous = { ...payload, flex: null };
    notion.blocks = [{ id: "old", type: "code", code: { rich_text: [{ plain_text: JSON.stringify(previous) }] } }];
    notion.failAppend = true;
    await expect(writeBridge(notion, "bridge", payload)).rejects.toThrow("append failed");
    expect(notion.blocks.map((b) => b.id)).toEqual(["old"]);
    expect(notion.log).toEqual([]);
    await expect(readBridge(notion, "bridge")).resolves.toEqual(previous);
  });

  it("古いコードブロックが残っていても最後のコードブロック(最新)を読む", async () => {
    const notion = new FakeNotion();
    const older = { ...payload, nextDate: "2026-09-29", flex: null };
    notion.blocks = [
      { id: "a", type: "code", code: { rich_text: [{ plain_text: JSON.stringify(older) }] } },
      { id: "b", type: "code", code: { rich_text: [{ plain_text: JSON.stringify(payload) }] } },
    ];
    await expect(readBridge(notion, "bridge")).resolves.toEqual(payload);
  });

  it("通常の書き込みではコードブロックがちょうど1つになる", async () => {
    const notion = new FakeNotion();
    await writeBridge(notion, "bridge", payload);
    await writeBridge(notion, "bridge", { ...payload, nextDate: null });
    expect(notion.blocks).toHaveLength(1);
    expect(notion.log.filter((l) => l === "append")).toHaveLength(2);
    expect(notion.log.filter((l) => l.startsWith("delete"))).toHaveLength(1);
  });

  it("コードブロックがない・JSON が壊れていれば null", async () => {
    const notion = new FakeNotion();
    await expect(readBridge(notion, "bridge")).resolves.toBeNull();
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: [{ plain_text: "{broken" }] } }];
    await expect(readBridge(notion, "bridge")).resolves.toBeNull();
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: [{ plain_text: '{"foo":1}' }] } }];
    await expect(readBridge(notion, "bridge")).resolves.toBeNull();
  });

  it("失敗時は状態と理由だけを書き換え、前回の内容を残す", async () => {
    const notion = new FakeNotion();
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: [{ plain_text: JSON.stringify(payload) }] } }];
    await markBridgeFailed(notion, "bridge", "テニスベア: HTTP 503", "2026-10-06T20:30:00+09:00");
    const code = notion.blocks[0] as unknown as { code: { rich_text: Array<{ text: { content: string } }> } };
    const written = JSON.parse(code.code.rich_text.map((t) => t.text.content).join(""));
    expect(written).toEqual({ ...payload, status: "failed", failure: "テニスベア: HTTP 503" });
  });

  it("前回の内容がなければ空の内容で失敗を書く", async () => {
    const notion = new FakeNotion();
    await markBridgeFailed(notion, "bridge", "予約台帳: x", "2026-10-06T20:30:00+09:00");
    const code = notion.blocks[0] as unknown as { code: { rich_text: Array<{ text: { content: string } }> } };
    expect(JSON.parse(code.code.rich_text.map((t) => t.text.content).join(""))).toEqual({
      nextDate: null, updatedAt: "2026-10-06T20:30:00+09:00", status: "failed", failure: "予約台帳: x", flex: null,
    });
  });
});

describe("hashOf", () => {
  it("同じ値は同じ、違う値は違う16桁", () => {
    expect(hashOf({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
    expect(hashOf({ a: 1 })).toBe(hashOf({ a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });
});
