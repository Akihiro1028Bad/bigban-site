// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readBridge } from "../early-morning/notionSync";
import { FakeNotion } from "./fixtures/fakeNotion";
import { ledgerProps } from "./fixtures/notionProps";
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
      todaySessions: 1,
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

  it("今日 LINE に載せる回がなければ nextDate と flex は null", async () => {
    const notion = setup();

    const summary = await runSync({ notion, now: new Date("2026-10-07T23:30:00Z"), ids });

    expect(summary.todaySessions).toBe(0);
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
});
