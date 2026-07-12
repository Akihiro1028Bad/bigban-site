import { describe, expect, it } from "vitest";

import {
  densityListClass,
  filterByQuery,
  nextDensity,
  parseDensity,
  pruneSelection,
  toggleId,
} from "./boardPrefs";

describe("density", () => {
  it("parseDensity は compact 以外を comfortable に倒す", () => {
    expect(parseDensity("compact")).toBe("compact");
    expect(parseDensity("comfortable")).toBe("comfortable");
    expect(parseDensity(null)).toBe("comfortable");
    expect(parseDensity("謎")).toBe("comfortable");
  });
  it("nextDensity は切替", () => {
    expect(nextDensity("comfortable")).toBe("compact");
    expect(nextDensity("compact")).toBe("comfortable");
  });
  it("densityListClass は行間クラス", () => {
    expect(densityListClass("comfortable")).toBe("space-y-2");
    expect(densityListClass("compact")).toBe("space-y-1");
  });
});

describe("filterByQuery", () => {
  const items = [{ title: "猛暑記事" }, { title: "雨の日" }, { title: "夜の習慣" }];
  it("空クエリは全件(コピー)", () => {
    expect(filterByQuery(items, "  ")).toEqual(items);
  });
  it("部分一致(大文字小文字無視)", () => {
    expect(filterByQuery([{ title: "Pickle" }], "pick")).toEqual([{ title: "Pickle" }]);
    expect(filterByQuery(items, "雨").map((i) => i.title)).toEqual(["雨の日"]);
  });
  it("一致なしは空", () => {
    expect(filterByQuery(items, "xyz")).toEqual([]);
  });
});

describe("toggleId", () => {
  it("無→有、有→無", () => {
    const a = toggleId(new Set<string>(), "x");
    expect([...a]).toEqual(["x"]);
    const b = toggleId(a, "x");
    expect([...b]).toEqual([]);
  });
});

describe("pruneSelection", () => {
  it("盤に無い選択を掃除する", () => {
    const result = pruneSelection(new Set(["a", "b", "c"]), ["a", "c"]);
    expect([...result].sort()).toEqual(["a", "c"]);
  });
});
