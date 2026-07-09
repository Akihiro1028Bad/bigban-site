import { describe, expect, it } from "vitest";

import {
  countInitiativesAutoTargets,
  initiativesAutoQueryFilter,
  isInitiativesAutoTarget,
} from "./initiativesAuto";
import type { NotionPage } from "./notion";

function page(status: string): NotionPage {
  return {
    id: status,
    url: "",
    properties: {
      "ステータス": { select: { name: status } },
    },
  };
}

describe("initiativesAuto", () => {
  it("ステータスが承認の施策だけ対象にする", () => {
    expect(isInitiativesAutoTarget(page("承認"))).toBe(true);
    expect(isInitiativesAutoTarget(page("未処理"))).toBe(false);
    expect(isInitiativesAutoTarget(page("成果物化済"))).toBe(false);
    expect(isInitiativesAutoTarget(page("却下"))).toBe(false);
    expect(isInitiativesAutoTarget(page("見送り"))).toBe(false);
  });

  it("ステータス select が欠落または null なら対象外にする", () => {
    expect(isInitiativesAutoTarget({ id: "missing", url: "", properties: {} })).toBe(false);
    expect(
      isInitiativesAutoTarget({
        id: "null-select",
        url: "",
        properties: { "ステータス": { select: null } },
      })
    ).toBe(false);
  });

  it("対象件数を数える", () => {
    expect(
      countInitiativesAutoTargets([
        page("承認"),
        page("承認"),
        page("成果物化済"),
        page("却下"),
      ])
    ).toBe(2);
  });

  it("Notion query 用の軽量 filter を返す", () => {
    expect(initiativesAutoQueryFilter()).toEqual({
      property: "ステータス",
      select: { equals: "承認" },
    });
  });
});
