// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readPlainText, readSelect } from "../early-morning/notionProps";
import { FakeNotion } from "./fixtures/fakeNotion";
import { select, text, title } from "./fixtures/notionProps";
import { buildAliasMap, canonicalPersonKey } from "./identity";
import {
  deriveAbsentKeys,
  deriveAliasLinks,
  readHyroxState,
  syncPeople,
  syncRecords,
  syncSessions,
  type PeopleRow,
  type RecordRow,
} from "./notionSync";
import type { ClassRecord, PersonStats, Session } from "./types";

const ids = { peopleDb: "people", recordsDb: "records", sessionsDb: "sessions", bridgePage: "bridge" };

function stats(key: string, overrides: Partial<PersonStats> = {}): PersonStats {
  return {
    key,
    displayName: `名前${key}`,
    total: 3,
    classCounts: { ビギナー: 2, 通常: 1, ダブルス: 0 },
    firstDate: "2026-09-09",
    lastDate: "2026-09-30",
    state: "常連",
    isNextApplied: true,
    history: "体験会(9/22)",
    ...overrides,
  };
}

function rec(sessionKey: string, personKey: string, overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    key: `${sessionKey}_${personKey}`,
    sessionKey,
    date: sessionKey.slice(0, 10),
    startTime: sessionKey.slice(11),
    classType: "通常",
    personKey,
    reservationNos: ["#1"],
    status: "申込",
    ordinal: 1,
    ...overrides,
  };
}

function propsOf(notion: FakeNotion, pageId: string) {
  return { id: pageId, properties: notion.pages.get(pageId)?.properties ?? {} };
}

describe("readHyroxState", () => {
  it("3つの DB を読み、別名・メモ・次回申込・欠席・キーを取り出す", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("lb:架空一郎"), 別名: text(" かくう一郎 "), メモ: text("膝に注意"), 次回申込: { checkbox: true }, 同期ハッシュ: text("h1") });
    notion.seed("records", { キー: title("2026-09-30_20:00_lb:架空一郎"), 状態: select("申込"), 出欠: select("欠席"), 同期ハッシュ: text("h2") });
    notion.seed("sessions", { キー: title("2026-09-30_20:00"), 同期ハッシュ: text("h3") });

    const state = await readHyroxState(notion, ids);

    expect(state.people).toEqual([{ pageId: "seed1", key: "lb:架空一郎", alias: "かくう一郎", memo: "膝に注意", isNextApplied: true, hash: "h1" }]);
    expect(state.records).toEqual([
      { pageId: "seed2", key: "2026-09-30_20:00_lb:架空一郎", personKey: "lb:架空一郎", status: "申込", isAbsent: true, hash: "h2" },
    ]);
    expect(state.sessions).toEqual([{ pageId: "seed3", key: "2026-09-30_20:00", hash: "h3" }]);
  });
});

describe("deriveAliasLinks / deriveAbsentKeys", () => {
  it("別名のある行だけを対応にし、欠席のキーは統合先の人キーに寄せる", () => {
    const people: PeopleRow[] = [
      { pageId: "p1", key: "lb:架空一郎", alias: "かくう一郎", memo: "", isNextApplied: false, hash: "" },
      { pageId: "p2", key: "lb:架空二郎", alias: "", memo: "", isNextApplied: false, hash: "" },
    ];
    expect(deriveAliasLinks(people)).toEqual([{ personKey: "lb:架空一郎", alias: "かくう一郎" }]);

    const records: RecordRow[] = [
      { pageId: "r1", key: "2026-09-23_20:00_lb:かくう一郎", personKey: "lb:かくう一郎", status: "申込", isAbsent: true, hash: "" },
      { pageId: "r2", key: "2026-09-30_20:00_lb:架空二郎", personKey: "lb:架空二郎", status: "申込", isAbsent: false, hash: "" },
    ];
    expect([...deriveAbsentKeys(records, new Map([["lb:かくう一郎", "lb:架空一郎"]]))]).toEqual(["2026-09-23_20:00_lb:架空一郎"]);
  });
});

describe("syncSessions", () => {
  it("開催回を作り、申込数は申込の人数。変化がなければ書かず、重複行はアーカイブする", async () => {
    const notion = new FakeNotion();
    const session: Session = { key: "2026-09-30_20:00", date: "2026-09-30", startTime: "20:00", classType: "通常", eventName: "HYROX TRAINING @ DAISUKE CLASS" };
    const records = [rec(session.key, "lb:A"), rec(session.key, "lb:B", { status: "キャンセル", ordinal: null })];

    expect(await syncSessions(notion, ids, [session], records, [])).toEqual({ created: 1, updated: 0, archived: 0 });
    expect(notion.live("sessions")[0].properties.申込数).toEqual({ number: 1 });

    const state = await readHyroxState(notion, ids);
    const duplicate = notion.seed("sessions", { キー: title(session.key), 同期ハッシュ: text("old") });
    const second = await syncSessions(notion, ids, [session], records, [...state.sessions, { pageId: duplicate, key: session.key, hash: "old" }]);

    expect(second).toEqual({ created: 0, updated: 0, archived: 1 });
    expect(notion.pages.get(duplicate)?.archived).toBe(true);
  });
});

describe("syncPeople", () => {
  it("人を作り、スタッフ列(別名・メモ)は書かない", async () => {
    const notion = new FakeNotion();
    const { pageIdByKey, counts } = await syncPeople(notion, ids, [stats("lb:A")], [], new Map());

    expect(counts).toEqual({ created: 1, updated: 0, archived: 0 });
    const [row] = notion.live("people");
    expect(pageIdByKey.get("lb:A")).toBe(row.id);
    expect(Object.keys(row.properties)).not.toContain("メモ");
    expect(Object.keys(row.properties)).not.toContain("別名");
    expect(readPlainText(row, "利用歴")).toBe("体験会(9/22)");
  });

  it("別名の人の行を統合先へ吸収してアーカイブし、統合先のメモが空なら移す。別名列は残す", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", { 識別子: text("lb:架空一郎"), 別名: text("かくう一郎") });
    const source = notion.seed("people", { 識別子: text("lb:かくう一郎"), メモ: text("膝に注意") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [stats("lb:架空一郎")], state.people, new Map([["lb:かくう一郎", "lb:架空一郎"]]));

    expect(counts.archived).toBe(1);
    expect(notion.pages.get(source)?.archived).toBe(true);
    expect(readPlainText(propsOf(notion, target), "メモ")).toBe("膝に注意");
    expect(readPlainText(propsOf(notion, target), "別名")).toBe("かくう一郎");
  });

  it("統合先にメモがあれば上書きしない。同じ識別子の重複行も吸収する", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", { 識別子: text("lb:架空一郎"), 別名: text("かくう一郎"), メモ: text("既存") });
    const duplicate = notion.seed("people", { 識別子: text("lb:架空一郎"), メモ: text("重複のメモ") });
    const source = notion.seed("people", { 識別子: text("lb:かくう一郎"), メモ: text("別名のメモ") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [stats("lb:架空一郎")], state.people, new Map([["lb:かくう一郎", "lb:架空一郎"]]));

    expect(counts.archived).toBe(2);
    expect(notion.pages.get(duplicate)?.archived).toBe(true);
    expect(notion.pages.get(source)?.archived).toBe(true);
    expect(readPlainText(propsOf(notion, target), "メモ")).toBe("既存");
  });

  it("連鎖した別名は統合先へ引き継がれ、次の実行でもほどけない", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("lb:A"), 別名: text("B") });
    const chained = notion.seed("people", { 識別子: text("lb:B"), 別名: text("C") });
    const state = await readHyroxState(notion, ids);
    const aliasMap = buildAliasMap(deriveAliasLinks(state.people));

    await syncPeople(notion, ids, [stats("lb:A")], state.people, aliasMap);

    expect(notion.pages.get(chained)?.archived).toBe(true);
    const target = notion.live("people").find((row) => readPlainText(row, "識別子") === "lb:A");
    expect(readPlainText(target ?? { id: "", properties: {} }, "別名")).toBe("B、C");

    const next = await readHyroxState(notion, ids);
    const nextMap = buildAliasMap(deriveAliasLinks(next.people));
    expect(canonicalPersonKey("lb:C", nextMap)).toBe("lb:A");
  });

  it("統合元に別名がなければ別名を書かない", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", { 識別子: text("lb:架空一郎"), 別名: text("かくう一郎") });
    notion.seed("people", { 識別子: text("lb:かくう一郎"), メモ: text("膝に注意") });
    const state = await readHyroxState(notion, ids);

    await syncPeople(notion, ids, [stats("lb:架空一郎")], state.people, new Map([["lb:かくう一郎", "lb:架空一郎"]]));

    expect(readPlainText(propsOf(notion, target), "別名")).toBe("かくう一郎");
  });

  it("統合先を指す別名は追記しない", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", { 識別子: text("lb:A"), 別名: text("B") });
    const source = notion.seed("people", { 識別子: text("lb:B"), 別名: text("A") });
    const state = await readHyroxState(notion, ids);
    const aliasMap = buildAliasMap(deriveAliasLinks(state.people));

    await syncPeople(notion, ids, [stats("lb:A")], state.people, aliasMap);

    expect(notion.pages.get(source)?.archived).toBe(true);
    expect(readPlainText(propsOf(notion, target), "別名")).toBe("B");
  });

  it("メモと別名を移すときは1回の更新で書く", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", { 識別子: text("lb:A"), 別名: text("B") });
    notion.seed("people", { 識別子: text("lb:B"), 別名: text("C"), メモ: text("膝に注意") });
    const state = await readHyroxState(notion, ids);
    const aliasMap = buildAliasMap(deriveAliasLinks(state.people));

    const { counts } = await syncPeople(notion, ids, [], state.people, aliasMap);

    expect(counts.updated).toBe(1);
    expect(notion.log.filter((entry) => entry === `update ${target}`)).toHaveLength(1);
    expect(readPlainText(propsOf(notion, target), "メモ")).toBe("膝に注意");
    expect(readPlainText(propsOf(notion, target), "別名")).toBe("B、C");
  });

  it("別名の統合先の行がまだ無ければ吸収しない", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("lb:かくう一郎") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [stats("lb:架空一郎")], state.people, new Map([["lb:かくう一郎", "lb:架空一郎"]]));

    expect(counts).toEqual({ created: 1, updated: 0, archived: 0 });
  });

  it("計算から消えた人の次回申込を外す", async () => {
    const notion = new FakeNotion();
    const gone = notion.seed("people", { 識別子: text("lb:Z"), 次回申込: { checkbox: true }, 同期ハッシュ: text("h") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [], state.people, new Map());

    expect(counts).toEqual({ created: 0, updated: 1, archived: 0 });
    expect(notion.pages.get(gone)?.properties.次回申込).toEqual({ checkbox: false });
  });
});

describe("syncRecords", () => {
  it("参加記録を作り、欠席を書き写す。人のページが無ければ失敗する", async () => {
    const notion = new FakeNotion();
    const record = rec("2026-09-30_20:00", "lb:A", { ordinal: null });

    const counts = await syncRecords(notion, ids, [record], new Map([["lb:A", "pA"]]), [], new Map(), new Set([record.key]));

    expect(counts).toEqual({ created: 1, updated: 0, archived: 0 });
    const [row] = notion.live("records");
    expect(row.properties.出欠).toEqual({ select: { name: "欠席" } });
    expect(row.properties.人).toEqual({ relation: [{ id: "pA" }] });
    await expect(syncRecords(notion, ids, [record], new Map(), [], new Map(), new Set())).rejects.toThrow("参加記録の人のページが見つかりません");
  });

  it("元データから消えた記録は元データになしにし、別名の記録と重複はアーカイブする", async () => {
    const notion = new FakeNotion();
    const gone = notion.seed("records", { キー: title("2026-09-23_20:00_lb:A"), 状態: select("申込") });
    const already = notion.seed("records", { キー: title("2026-09-16_20:00_lb:A"), 状態: select("元データになし") });
    const alias = notion.seed("records", { キー: title("2026-09-23_20:00_lb:かくう一郎"), 状態: select("申込") });
    const duplicate = notion.seed("records", { キー: title("2026-09-23_20:00_lb:A"), 状態: select("申込") });
    const state = await readHyroxState(notion, ids);

    const counts = await syncRecords(notion, ids, [], new Map(), state.records, new Map([["lb:かくう一郎", "lb:A"]]), new Set());

    expect(counts).toEqual({ created: 0, updated: 1, archived: 2 });
    expect(readSelect(propsOf(notion, gone), "状態")).toBe("元データになし");
    expect(notion.pages.get(alias)?.archived).toBe(true);
    expect(notion.pages.get(duplicate)?.archived).toBe(true);
    expect(notion.log).not.toContain(`update ${already}`);
  });

  it("計算された記録が既存にあり変化がなければ書かない。欠席でなければ出欠を書かない", async () => {
    const notion = new FakeNotion();
    const record = rec("2026-09-30_20:00", "lb:A");
    const pageIdByKey = new Map([["lb:A", "pA"]]);

    await syncRecords(notion, ids, [record], pageIdByKey, [], new Map(), new Set());
    expect(Object.keys(notion.live("records")[0].properties)).not.toContain("出欠");

    const state = await readHyroxState(notion, ids);
    const counts = await syncRecords(notion, ids, [record], pageIdByKey, state.records, new Map(), new Set());

    expect(counts).toEqual({ created: 0, updated: 0, archived: 0 });
  });
});
