import { describe, expect, it } from "vitest";

import {
  otherTab,
  paneClass,
  PREVIEW_WIDTH_PRESETS,
  previewWidthCss,
} from "./draftWorkspace";

describe("previewWidthCss", () => {
  it("desktop はペイン幅いっぱい(100%)", () => {
    expect(previewWidthCss("desktop")).toBe("100%");
  });

  it("mobile はスマホ実幅(390px)", () => {
    expect(previewWidthCss("mobile")).toBe("390px");
  });

  it("プリセットは desktop / mobile の2種", () => {
    expect(PREVIEW_WIDTH_PRESETS.map((p) => p.key)).toEqual(["desktop", "mobile"]);
  });
});

describe("otherTab", () => {
  it("edit → preview", () => {
    expect(otherTab("edit")).toBe("preview");
  });

  it("preview → edit", () => {
    expect(otherTab("preview")).toBe("edit");
  });
});

describe("paneClass", () => {
  it("activeTab と一致するペインは表示", () => {
    expect(paneClass("edit", "edit")).toBe("block lg:block");
    expect(paneClass("preview", "preview")).toBe("block lg:block");
  });

  it("activeTab と異なるペインは狭幅で隠す(lg は表示)", () => {
    expect(paneClass("edit", "preview")).toBe("hidden lg:block");
    expect(paneClass("preview", "edit")).toBe("hidden lg:block");
  });
});
