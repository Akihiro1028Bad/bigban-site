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
    const stations = (
      ja as unknown as {
        HyroxPage: {
          stations: Record<string, { name: string; nameJa: string }>;
        };
      }
    ).HyroxPage.stations;
    for (let i = 1; i <= 8; i++) {
      const key = `station${String(i).padStart(2, "0")}`;
      expect(stations[key].name).toBeTypeOf("string");
      expect(stations[key].nameJa).toBeTypeOf("string");
    }
  });

  it("ja と en の HyroxPage のキー構造が一致する", () => {
    const jaObj = ja as Record<string, unknown>;
    const enObj = en as Record<string, unknown>;
    expect(keysOf(enObj.HyroxPage)).toEqual(keysOf(jaObj.HyroxPage));
  });

  it("撤去した HomeHyroxPromo のメッセージを残さない", () => {
    // ホームの HYROX 誘導はフルワイドカードから SERVICES 内の一行リンクへ集約した。
    // 未使用の名前空間が残ると、次に触る人が生きている面だと誤解する。
    expect(ja).not.toHaveProperty("HomeHyroxPromo");
    expect(en).not.toHaveProperty("HomeHyroxPromo");
  });
});
