// @vitest-environment node
import { describe, expect, it } from "vitest";

import { LABOLA_HOST, SITE_HOST, andFilters, excludeAutomatedAccess, hostFilter, stringFilter } from "./hosts.mjs";

describe("GA4 フィルタ部品", () => {
  it("ホスト名は hostName の完全一致", () => {
    expect(hostFilter(SITE_HOST)).toEqual({
      filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: "www.thepicklebang.com" } },
    });
    expect(LABOLA_HOST).toBe("yoyaku.labola.jp");
  });

  it("文字列フィルタは一致方式を変えられる", () => {
    expect(stringFilter("pagePath", "/x", "CONTAINS").filter.stringFilter.matchType).toBe("CONTAINS");
  });

  it("自動アクセスは『800x600 かつ Linux』の AND を NOT で除く(片方だけでは除かない)", () => {
    const expression = excludeAutomatedAccess();
    expect(expression.notExpression.andGroup.expressions).toEqual([
      stringFilter("screenResolution", "800x600"),
      stringFilter("operatingSystem", "Linux"),
    ]);
  });

  it("andFilters は空を除き、1つならそのまま、0個なら undefined", () => {
    const a = hostFilter(SITE_HOST);
    const b = stringFilter("pagePath", "/x");
    expect(andFilters(a, undefined, b)).toEqual({ andGroup: { expressions: [a, b] } });
    expect(andFilters(undefined, a)).toBe(a);
    expect(andFilters(undefined)).toBeUndefined();
  });
});
