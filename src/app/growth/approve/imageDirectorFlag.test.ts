import { describe, expect, it } from "vitest";

import { isImageDirectorEnabled } from "./imageDirectorFlag";

describe("isImageDirectorEnabled", () => {
  it("既定は false(保存先・生成側読込が未実装のため画像ディレクター UI を隠す #62)", () => {
    expect(isImageDirectorEnabled()).toBe(false);
  });
});
