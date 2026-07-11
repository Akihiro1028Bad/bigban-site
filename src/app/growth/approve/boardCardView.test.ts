import { describe, expect, it } from "vitest";

import { cardExcerpt, cardHasEyecatch, cardHue } from "./boardCardView";
import type { PendingItem } from "./types";

function pi(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("cardExcerpt", () => {
  it("subtitle を優先して返す", () => {
    expect(cardExcerpt(pi({ id: "a", kind: "idea", stage: "proposed", subtitle: "サブ" }))).toBe("サブ");
  });
  it("subtitle が空なら details を使う", () => {
    expect(
      cardExcerpt(
        pi({ id: "a", kind: "idea", stage: "proposed", subtitle: "", details: [{ label: "l", value: "詳細" }] }),
      ),
    ).toBe("詳細");
  });
  it("max を超えたら … を付けて切る", () => {
    const long = "あ".repeat(80);
    const out = cardExcerpt(pi({ id: "a", kind: "idea", stage: "proposed", subtitle: long }), 10);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(11);
  });
  it("どちらも無ければ空文字", () => {
    expect(cardExcerpt(pi({ id: "a", kind: "idea", stage: "proposed", subtitle: undefined }))).toBe("");
  });
  it("本番型の details(PendingDetail[]) は value を連結して使う", () => {
    const out = cardExcerpt(
      pi({
        id: "a",
        kind: "idea",
        stage: "proposed",
        subtitle: "",
        details: [
          { label: "l1", value: "前半" },
          { label: "l2", value: "後半" },
        ],
      }),
    );
    expect(out).toBe("前半 後半");
  });
});

describe("cardHue", () => {
  it("同じ seed は同じ値・範囲は 0-359", () => {
    const h = cardHue("abc");
    expect(h).toBe(cardHue("abc"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
  it("異なる seed で分布する(空文字も 0-359)", () => {
    expect(cardHue("")).toBeGreaterThanOrEqual(0);
    expect(cardHue("x")).not.toBe(cardHue("y"));
  });
});

describe("cardHasEyecatch", () => {
  it("contentId があれば true", () => {
    expect(cardHasEyecatch(pi({ id: "a", kind: "idea", stage: "drafted", contentId: "c1" }))).toBe(true);
  });
  it("contentId が無ければ false", () => {
    expect(cardHasEyecatch(pi({ id: "a", kind: "idea", stage: "proposed" }))).toBe(false);
  });
});
