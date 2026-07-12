// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  columnCategoryColor,
  columnCategoryName,
} from "./category";
import { COLUMN_CATEGORY_FALLBACK_COLOR } from "@/constants/columns";
import type { ColumnCategory } from "@/lib/microcms/columnsSchema";

const full: ColumnCategory = {
  id: "start",
  name: "はじめ方・体験",
  nameEn: "Getting Started",
  color: "#C8FF00",
  order: 1,
};

describe("columnCategoryName", () => {
  it("ja は name を返す", () => {
    expect(columnCategoryName(full, "ja")).toBe("はじめ方・体験");
  });

  it("en は nameEn を返す", () => {
    expect(columnCategoryName(full, "en")).toBe("Getting Started");
  });

  it("nameEn 未設定の en は name にフォールバックする", () => {
    expect(
      columnCategoryName({ ...full, nameEn: undefined }, "en"),
    ).toBe("はじめ方・体験");
  });
});

describe("columnCategoryColor", () => {
  it("color を返す", () => {
    expect(columnCategoryColor(full)).toBe("#C8FF00");
  });

  it("color 未設定は既定トーンにフォールバックする", () => {
    expect(columnCategoryColor({ ...full, color: undefined })).toBe(
      COLUMN_CATEGORY_FALLBACK_COLOR,
    );
  });
});
