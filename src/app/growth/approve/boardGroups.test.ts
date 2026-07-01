import { describe, expect, it } from "vitest";

import { groupByBoardStage } from "./boardGroups";
import type { PendingItem } from "./types";

function pi(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("groupByBoardStage", () => {
  it("BoardStage ごとに STAGE_ORDER 順のセクションへ分ける", () => {
    const items = [
      pi({ id: "g", kind: "idea", stage: "generating" }),
      pi({ id: "p", kind: "idea", stage: "published" }),
      pi({ id: "o", kind: "idea", stage: "proposed" }),
    ];
    const groups = groupByBoardStage(items);
    const stages = groups.map((g) => g.stage);
    // outline_review が generating より前・published が最後(STAGE_ORDER 準拠)
    expect(stages).toContain("outline_review");
    expect(stages).toContain("generating");
    expect(stages).toContain("published");
    expect(stages.indexOf("outline_review")).toBeLessThan(stages.indexOf("generating"));
    expect(stages.indexOf("generating")).toBeLessThan(stages.indexOf("published"));
  });
  it("空セクションは含めない", () => {
    const groups = groupByBoardStage([pi({ id: "p", kind: "idea", stage: "published" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stage).toBe("published");
    expect(groups[0].label.length).toBeGreaterThan(0);
  });
  it("group 内は入力順を保つ", () => {
    const items = [
      pi({ id: "a", kind: "idea", stage: "proposed" }),
      pi({ id: "b", kind: "idea", stage: "proposed" }),
    ];
    expect(groupByBoardStage(items)[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("空配列は空配列", () => {
    expect(groupByBoardStage([])).toEqual([]);
  });
});
