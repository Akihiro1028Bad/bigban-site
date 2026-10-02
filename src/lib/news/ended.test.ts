import { describe, expect, it } from "vitest";

import { isNewsEnded } from "./ended";

const NOW = new Date("2026-10-01T00:00:00.000Z");

describe("isNewsEnded", () => {
  it("eventEndAt が未設定なら終了扱いにしない", () => {
    expect(isNewsEnded(undefined, NOW)).toBe(false);
  });

  it("空文字は終了扱いにしない", () => {
    expect(isNewsEnded("", NOW)).toBe(false);
  });

  it("日時として読めない値は終了扱いにしない", () => {
    expect(isNewsEnded("not-a-date", NOW)).toBe(false);
  });

  it("終了日時を過ぎていれば終了", () => {
    expect(isNewsEnded("2026-09-30T14:59:00.000Z", NOW)).toBe(true);
  });

  it("終了日時が未来なら終了ではない", () => {
    expect(isNewsEnded("2026-10-01T00:00:01.000Z", NOW)).toBe(false);
  });

  it("終了日時ちょうどは終了ではない(過ぎたら終了)", () => {
    expect(isNewsEnded("2026-10-01T00:00:00.000Z", NOW)).toBe(false);
  });

  it("now を省略すると現在時刻で判定する", () => {
    expect(isNewsEnded("2020-01-01T00:00:00.000Z")).toBe(true);
    expect(isNewsEnded("2099-01-01T00:00:00.000Z")).toBe(false);
  });
});
