import { describe, it, expect } from "vitest";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";

function keysOf(obj: unknown): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? Object.keys(v as object).map((c) => `${k}.${c}`)
      : [k],
  );
}

describe("HYROX i18n messages", () => {
  it("ja に Navigation.hyrox / Metadata.hyrox がある", () => {
    expect((ja.Navigation as Record<string, unknown>).hyrox).toBeTypeOf("string");
    expect((ja.Metadata as Record<string, unknown>).hyrox).toBeTypeOf("object");
  });

  it("ja に 8 stations が定義されている", () => {
    const stations = (ja as Record<string, any>).HyroxPage.stations;
    for (let i = 1; i <= 8; i++) {
      const key = `station${String(i).padStart(2, "0")}`;
      expect(stations[key].name).toBeTypeOf("string");
      expect(stations[key].nameJa).toBeTypeOf("string");
    }
  });

  it("ja と en の HyroxPage / HomeHyroxPromo のキー構造が一致する", () => {
    const jaObj = ja as Record<string, unknown>;
    const enObj = en as Record<string, unknown>;
    expect(keysOf(enObj.HyroxPage)).toEqual(keysOf(jaObj.HyroxPage));
    expect(keysOf(enObj.HomeHyroxPromo)).toEqual(keysOf(jaObj.HomeHyroxPromo));
  });
});
