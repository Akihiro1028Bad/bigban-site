import { describe, it, expect } from "vitest";

import { CONTACT_CATEGORY_VALUES, isContactCategory } from "./contact";

describe("contact categories", () => {
  it("貸切・法人(private)を含む5種別を持つ", () => {
    expect([...CONTACT_CATEGORY_VALUES]).toEqual([
      "court",
      "lesson",
      "private",
      "press",
      "other",
    ]);
  });

  it("有効な種別は true", () => {
    for (const value of CONTACT_CATEGORY_VALUES) {
      expect(isContactCategory(value)).toBe(true);
    }
  });

  it("未知の文字列・空文字・文字列以外は false", () => {
    expect(isContactCategory("unknown")).toBe(false);
    expect(isContactCategory("")).toBe(false);
    expect(isContactCategory(undefined)).toBe(false);
    expect(isContactCategory(["private"])).toBe(false);
  });
});
