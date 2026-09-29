// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NOTION_IDS } from "./notionIds";

describe("NOTION_IDS", () => {
  it("DB とページの ID はハイフンなし32桁の16進数", () => {
    const { ledgerDb, peopleDb, recordsDb, sessionsDb, bridgePage } = NOTION_IDS;
    for (const id of [ledgerDb, peopleDb, recordsDb, sessionsDb, bridgePage]) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("予約台帳は既存の Labora 予約台帳を指す", () => {
    expect(NOTION_IDS.ledgerDb).toBe("f93a73e9821e4a70b8ed72d3b413c203");
  });

  it("常連 DB の URL は常連 DB の ID を含む notion.so の URL", () => {
    expect(NOTION_IDS.peopleDbUrl).toBe(`https://www.notion.so/${NOTION_IDS.peopleDb}`);
  });
});
