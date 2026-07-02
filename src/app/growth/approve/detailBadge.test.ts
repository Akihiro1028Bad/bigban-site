import { describe, expect, it } from "vitest";

import { detailBadge } from "./detailBadge";

describe("detailBadge", () => {
  it("記事は実効段階のラベルと色テーマを返す", () => {
    expect(detailBadge({ id: "i", kind: "idea", stage: "proposed" }).label).toBe("提案中");
    expect(detailBadge({ id: "i", kind: "idea", stage: "generating" }).label).toBe("生成中");
    expect(detailBadge({ id: "i", kind: "idea", stage: "drafted" }).label).toBe("下書き");
    // 色テーマ(accent)は段階に応じて変わる
    expect(detailBadge({ id: "i", kind: "idea", stage: "proposed" }).theme.accent).toContain("blue");
  });

  it("記事は楽観的承認で『生成待ち』へ前進する", () => {
    const badge = detailBadge({ id: "i", kind: "idea", stage: "proposed" }, "承認");
    expect(badge.label).toBe("生成待ち");
    expect(badge.theme.accent).toContain("amber");
  });

  it("施策は未処理/承認/却下のラベルを返す", () => {
    expect(detailBadge({ id: "p", kind: "proposal", stage: "untouched" }).label).toBe("未処理");
    expect(detailBadge({ id: "p", kind: "proposal", stage: "untouched" }, "承認").label).toBe("承認");
    expect(detailBadge({ id: "p", kind: "proposal", stage: "untouched" }, "却下").label).toBe("却下");
  });

  it("施策の色は状態で変わる(未処理=blue/承認=teal/却下=gray)", () => {
    expect(detailBadge({ id: "p", kind: "proposal", stage: "untouched" }).theme.accent).toContain("blue");
    expect(detailBadge({ id: "p", kind: "proposal", stage: "untouched" }, "承認").theme.accent).toContain("teal");
    expect(detailBadge({ id: "p", kind: "proposal", stage: "untouched" }, "却下").theme.accent).toContain("gray");
  });
});
