import { describe, expect, it } from "vitest";

import {
  PREVIEW_DEVICES,
  previewDeviceLabel,
  previewWidthClass,
} from "./previewDevice";

describe("previewDevice", () => {
  it("PC は全幅(空クラス)、モバイルは〜390px中央寄せ", () => {
    expect(previewWidthClass("pc")).toBe("");
    expect(previewWidthClass("mobile")).toContain("max-w-[390px]");
    expect(previewWidthClass("mobile")).toContain("mx-auto");
  });

  it("ラベルを返す", () => {
    expect(previewDeviceLabel("pc")).toBe("PC");
    expect(previewDeviceLabel("mobile")).toBe("モバイル");
  });

  it("対応デバイスは PC/モバイルの2つ", () => {
    expect(PREVIEW_DEVICES).toEqual(["pc", "mobile"]);
  });
});
