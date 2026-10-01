// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NOTION_IDS } from "./notionIds";

describe("NOTION_IDS", () => {
  it("すべての ID が Notion の32桁の16進数で、一覧の URL は参加者 DB を指す", () => {
    for (const name of ["ledgerDb", "peopleDb", "recordsDb", "sessionsDb", "bridgePage"] as const) {
      expect(NOTION_IDS[name], name).toMatch(/^[0-9a-f]{32}$/u);
    }
    expect(NOTION_IDS.peopleDbUrl).toBe(`https://www.notion.so/${NOTION_IDS.peopleDb}`);
  });

  it("予約台帳は早朝集計と同じ DB", () => {
    expect(NOTION_IDS.ledgerDb).toBe("f93a73e9821e4a70b8ed72d3b413c203");
  });
});
