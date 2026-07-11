// @vitest-environment node
import { describe, expect, it } from "vitest";

import { exitCodeOrFailure } from "./processExit.mjs";

describe("exitCodeOrFailure", () => {
  it("通常の終了コードはそのまま返す", () => {
    expect(exitCodeOrFailure(0)).toBe(0);
    expect(exitCodeOrFailure(2)).toBe(2);
  });

  it("シグナル終了のnullは失敗コードに変換する", () => {
    expect(exitCodeOrFailure(null)).toBe(1);
  });
});
