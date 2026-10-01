import { describe, expect, it } from "vitest";

import { resolveLocaleSwitchPath } from "./localeSwitch";

describe("resolveLocaleSwitchPath", () => {
  it("相手言語版があれば undefined(同じパスで切り替える)", () => {
    expect(
      resolveLocaleSwitchPath({
        section: "news",
        hasCounterpart: true,
        counterpartShowsColumns: false,
      }),
    ).toBeUndefined();
  });

  it("ニュースで相手版が無ければ相手言語のニュース一覧", () => {
    expect(
      resolveLocaleSwitchPath({
        section: "news",
        hasCounterpart: false,
        counterpartShowsColumns: true,
      }),
    ).toBe("/news");
  });

  it("コラムで相手版が無く、相手言語でコラムを出すならコラム一覧", () => {
    expect(
      resolveLocaleSwitchPath({
        section: "columns",
        hasCounterpart: false,
        counterpartShowsColumns: true,
      }),
    ).toBe("/columns");
  });

  it("コラムで相手版が無く、相手言語でコラムを出さない(英語0件)ならニュース一覧", () => {
    expect(
      resolveLocaleSwitchPath({
        section: "columns",
        hasCounterpart: false,
        counterpartShowsColumns: false,
      }),
    ).toBe("/news");
  });
});
