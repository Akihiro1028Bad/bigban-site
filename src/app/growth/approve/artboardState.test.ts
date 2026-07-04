import { describe, expect, it } from "vitest";

import { slotStateOf } from "./artboardState";
import type { OutlineImage } from "./outline";

const image: OutlineImage = {
  style: "mascot",
  description: "宇宙人が案内する",
};

describe("slotStateOf", () => {
  it("画像指定もラフも再生成もなければ empty", () => {
    expect(slotStateOf(undefined, undefined, false)).toBe("empty");
  });

  it("画像指定がありラフも再生成もなければ specified", () => {
    expect(slotStateOf(image, undefined, false)).toBe("specified");
  });

  it("roughUrl が非空なら画像指定の有無に関わらず rough-ready", () => {
    expect(slotStateOf(undefined, "https://example.com/rough.png", false)).toBe("rough-ready");
    expect(slotStateOf(image, "https://example.com/rough.png", false)).toBe("rough-ready");
  });

  it("isRegenerating が真なら他条件より優先して generating", () => {
    expect(slotStateOf(image, "https://example.com/rough.png", true)).toBe("generating");
  });
});
