import { describe, expect, it } from "vitest";

import {
  countDraftsAutoTargets,
  draftsAutoQueryFilter,
  isDraftsAutoTarget,
} from "./draftsAuto";
import type { NotionPage } from "./notion";

function page(status: string, draftId = ""): NotionPage {
  return {
    id: `${status}-${draftId || "empty"}`,
    url: "",
    properties: {
      "ステータス": { select: { name: status } },
      "下書きID": { rich_text: draftId ? [{ plain_text: draftId }] : [] },
    },
  };
}

describe("draftsAuto", () => {
  it("承認か生成中で、下書きIDが空の行だけ対象にする", () => {
    expect(isDraftsAutoTarget(page("承認"))).toBe(true);
    expect(isDraftsAutoTarget(page("生成中"))).toBe(true);
    expect(isDraftsAutoTarget(page("承認", "content-id"))).toBe(false);
    expect(isDraftsAutoTarget(page("提案中"))).toBe(false);
    expect(isDraftsAutoTarget(page("下書き作成済み", "content-id"))).toBe(false);
  });

  it("対象件数を数える", () => {
    expect(
      countDraftsAutoTargets([
        page("承認"),
        page("生成中"),
        page("承認", "content-id"),
        page("提案中"),
      ])
    ).toBe(2);
  });

  it("Notion query 用の軽量 filter を返す", () => {
    expect(draftsAutoQueryFilter()).toEqual({
      and: [
        {
          or: [
            { property: "ステータス", select: { equals: "承認" } },
            { property: "ステータス", select: { equals: "生成中" } },
          ],
        },
        { property: "下書きID", rich_text: { is_empty: true } },
      ],
    });
  });
});
