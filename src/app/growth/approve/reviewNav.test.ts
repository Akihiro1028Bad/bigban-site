import { describe, expect, it } from "vitest";

import { nextReviewId } from "./reviewNav";

const order = [
  { id: "a", actionable: true },
  { id: "b", actionable: false }, // 決定済み等はスキップ
  { id: "c", actionable: true },
  { id: "d", actionable: true },
];

describe("nextReviewId", () => {
  it("次方向: 非actionableを飛ばして次のactionableを返す", () => {
    expect(nextReviewId(order, "a", 1)).toBe("c");
    expect(nextReviewId(order, "c", 1)).toBe("d");
  });

  it("前方向: 前のactionableを返す", () => {
    expect(nextReviewId(order, "c", -1)).toBe("a");
    expect(nextReviewId(order, "d", -1)).toBe("c");
  });

  it("末尾/先頭で対象が無ければ null", () => {
    expect(nextReviewId(order, "d", 1)).toBeNull();
    expect(nextReviewId(order, "a", -1)).toBeNull();
  });

  it("current が order に無ければ null", () => {
    expect(nextReviewId(order, "zzz", 1)).toBeNull();
  });
});
