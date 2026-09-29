// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readPlainText, type NotionPage } from "../early-morning/notionProps";
import { readBridge } from "../early-morning/notionSync";
import { FakeNotion } from "./fixtures/fakeNotion";
import { ledgerProps, text } from "./fixtures/notionProps";
import { LEDGER_COLUMNS } from "./ledger";
import { runSync } from "./sync";

const ids = {
  ledgerDb: "ledger",
  peopleDb: "people",
  recordsDb: "records",
  sessionsDb: "sessions",
  bridgePage: "bridge",
  peopleDbUrl: "https://www.notion.so/people",
};

/** JST 2026-10-07(水) 08:30。 */
const now = new Date("2026-10-06T23:30:00Z");
const BEGINNER = "HYROX TRAINING @ DAISUKE CLASS ビギナーの部";

function setup(): FakeNotion {
  const notion = new FakeNotion();
  notion.columns = [...LEDGER_COLUMNS];
  notion.seed("ledger", ledgerProps({ no: "#10", name: "架空一郎", date: "2026-09-30", slot: "20:00～21:00" }));
  notion.seed("ledger", ledgerProps({ no: "#11", name: "架空一郎", date: "2026-10-07", slot: "19:00～19:50", event: BEGINNER }));
  notion.seed("ledger", ledgerProps({ no: "#12", name: "架空二郎", date: "2026-10-07", slot: "19:00～19:50", event: BEGINNER }));
  notion.seed(
    "ledger",
    ledgerProps({ no: "#13", name: "架空二郎", date: "2026-09-22", slot: "09:00～09:50", event: "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）" }),
  );
  notion.seed("ledger", ledgerProps({ no: "#14", name: "架空三郎", date: "2026-10-09", slot: "20:00～21:00" }));
  return notion;
}

describe("runSync", () => {
  it("台帳から集計して Notion に書き、今日の回の Flex を橋渡しページに置く", async () => {
    const notion = setup();

    const summary = await runSync({ notion, now, ids });

    expect(summary).toEqual({
      sessions: 3,
      people: 3,
      records: 4,
      nextDate: "2026-10-07",
      nextSessions: 1,
      skippedRows: 0,
      missingEventName: 0,
      writes: { created: 10, updated: 0, archived: 0 },
    });
    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.nextDate).toBe("2026-10-07");
    expect(bridge?.status).toBe("ok");
    const flex = JSON.stringify(bridge?.flex);
    expect(flex).toContain("19:00 ビギナーの部  2名");
    expect(flex).toContain("ビギナーは初めて(通常回1回)");
    expect(flex).toContain("これまで: 体験会(9/22)");
  });

  it("2回目の実行は変化がなければ Notion の DB に書かない", async () => {
    const notion = setup();
    await runSync({ notion, now, ids });

    const second = await runSync({ notion, now, ids });

    expect(second.writes).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("今日に回がなく、あとの日にあれば、その日の分を置く(所見もその日の時点で作る)", async () => {
    const notion = setup();
    notion.seed("ledger", ledgerProps({ no: "#15", name: "架空一郎", date: "2026-10-09", slot: "20:00～21:00" }));

    // JST 2026-10-08(木) 08:30: 今日は回がなく、次は 10/9
    const summary = await runSync({ notion, now: new Date("2026-10-07T23:30:00Z"), ids });

    expect(summary.nextDate).toBe("2026-10-09");
    expect(summary.nextSessions).toBe(1);
    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.nextDate).toBe("2026-10-09");
    const flex = JSON.stringify(bridge?.flex);
    expect(flex).toContain("10/9");
    expect(flex).toContain("20:00 通常  2名");
    expect(flex).toContain("初めての方。声かけをお願いします");
    expect(flex).toContain("直近28日で2回・前回 10/7");
  });

  it("今日以降に LINE に載せる回がなければ nextDate と flex は null", async () => {
    const notion = setup();

    // JST 2026-10-10(土) 08:30: 10/9 の回は過ぎている
    const summary = await runSync({ notion, now: new Date("2026-10-09T23:30:00Z"), ids });

    expect(summary.nextDate).toBeNull();
    expect(summary.nextSessions).toBe(0);
    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.nextDate).toBeNull();
    expect(bridge?.flex).toBeNull();
  });

  it("台帳の取得に失敗したら DB に書かず、橋渡しを失敗にして投げ直す", async () => {
    const notion = setup();
    notion.failQueryDb = "ledger";

    await expect(runSync({ notion, now, ids })).rejects.toThrow("query ledger failed");

    expect(notion.live("people")).toEqual([]);
    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.status).toBe("failed");
    expect(bridge?.failure).toBe("予約台帳: query ledger failed");
  });

  it("橋渡しの失敗記録にも失敗したら、元の例外を投げる", async () => {
    const notion = setup();
    notion.failQueryDb = "ledger";
    notion.failAppend = true;

    await expect(runSync({ notion, now, ids })).rejects.toThrow("query ledger failed");
  });

  it("Error 以外が投げられても、失敗理由を文字列にして残す", async () => {
    class RejectingNotion extends FakeNotion {
      override async queryAll(): Promise<never> {
        return Promise.reject("boom");
      }
    }
    const notion = new RejectingNotion();
    notion.columns = [...LEDGER_COLUMNS];

    await expect(runSync({ notion, now, ids })).rejects.toBe("boom");

    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.failure).toBe("予約台帳: boom");
  });

  it("会員番号が同じ予約は、氏名の表記が違っても同じ人にまとめる(2回目と出て、別名に他方の表記が残る)", async () => {
    const notion = new FakeNotion();
    notion.columns = [...LEDGER_COLUMNS];
    notion.seed("ledger", ledgerProps({ no: "#20", name: "架空一郎", member: "99001", date: "2026-09-23", slot: "20:00～21:00" }));
    notion.seed("ledger", ledgerProps({ no: "#21", name: "架空壱郎", member: "99001", date: "2026-09-30", slot: "20:00～21:00" }));

    // 会員番号が付く前に別々の人として作られていた行
    notion.seed("people", { 識別子: text("lb:架空一郎") });
    notion.seed("people", { 識別子: text("lb:架空壱郎"), メモ: text("膝に注意") });

    // JST 2026-09-30(水) 08:30
    const summary = await runSync({ notion, now: new Date("2026-09-29T23:30:00Z"), ids });

    expect(summary.people).toBe(1);
    expect(summary.records).toBe(2);
    const bridge = await readBridge(notion, "bridge");
    const flex = JSON.stringify(bridge?.flex);
    expect(flex).toContain("2回目");
    expect(flex).not.toContain("初めての方");
    const people = notion.live("people");
    expect(people).toHaveLength(1);
    expect(readPlainText(people[0] as NotionPage, "識別子")).toBe("lb:架空一郎");
    expect(readPlainText(people[0] as NotionPage, "別名")).toBe("架空壱郎");
    expect(readPlainText(people[0] as NotionPage, "メモ")).toBe("膝に注意");
  });
});
