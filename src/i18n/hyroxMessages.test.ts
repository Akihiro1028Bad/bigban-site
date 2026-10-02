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

function deepKeys(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return null;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, deepKeys(v)]),
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

  it("ja の Metadata.hyrox の title/description が公式トレーニングジム・本八幡・体験会を訴求する", () => {
    const meta = ja.Metadata.hyrox;
    expect(meta.title).toBe(
      "HYROX（ハイロックス）公式トレーニングジム｜千葉・本八幡駅徒歩1分",
    );
    expect(meta.description).toContain("HYROX公式トレーニングクラブに認定");
    expect(meta.description).toContain("本八幡駅徒歩1分");
    expect(meta.description).toContain("関吉大亮");
  });

  it("en の Metadata.hyrox の title/description が Official Training Club・Motoyawata を訴求する", () => {
    const meta = en.Metadata.hyrox;
    expect(meta.title).toBe(
      "HYROX Official Training Club in Chiba | 1 min from Motoyawata Station",
    );
    expect(meta.description).toContain("HYROX Training Club");
    expect(meta.description).toContain("Motoyawata Station");
    expect(meta.description).toContain("Daisuke Sekiyoshi");
  });

  it.each([
    ["ja", ja.Metadata.hyrox.description],
    ["en", en.Metadata.hyrox.description],
  ])(
    "%s の description は料金・時間・営業時間を直書きせず定数から差し込む",
    (_locale, description) => {
      for (const placeholder of [
        "{trialMinutes}",
        "{trialPrice}",
        "{open}",
        "{close}",
      ]) {
        expect(description).toContain(placeholder);
      }
      expect(description).not.toMatch(/\d{1,2}:\d{2}|3,000|50分|50 min/);
    },
  );

  it("meta keywords は変更しない", () => {
    expect(ja.Metadata.hyrox.keywords).toEqual([
      "HYROX",
      "ハイロックス",
      "HYROX 市川",
      "HYROX 本八幡",
      "HYROX 千葉",
      "HYROX ジム",
      "HYROX トレーニング",
      "HYROX 体験",
      "ファンクショナルフィットネス",
      "機能性トレーニング",
    ]);
    expect(en.Metadata.hyrox.keywords).toEqual([
      "HYROX",
      "HYROX Japan",
      "HYROX Chiba",
      "HYROX Motoyawata",
      "HYROX training",
      "functional fitness",
      "fitness racing",
    ]);
  });

  it("HyroxPage.trial は ja/en とも同じキーを持ち、cardMeta に差し込み口がある", () => {
    type TrialMessages = { HyroxPage: { trial: Record<string, string> } };
    const jaTrial = (ja as unknown as TrialMessages).HyroxPage.trial;
    const enTrial = (en as unknown as TrialMessages).HyroxPage.trial;
    expect(Object.keys(enTrial)).toEqual(Object.keys(jaTrial));
    expect(jaTrial.cardMeta).toContain("{minutes}");
    expect(jaTrial.cardMeta).toContain("{price}");
    expect(enTrial.cardMeta).toContain("{minutes}");
    expect(enTrial.cardMeta).toContain("{price}");
  });

  it("HyroxPage.faq / access は ja/en で同じキー構造を持つ", () => {
    const pick = (m: unknown, key: "faq" | "access") =>
      (m as { HyroxPage: Record<string, unknown> }).HyroxPage[key];
    for (const key of ["faq", "access"] as const) {
      expect(pick(ja, key)).toBeDefined();
      expect(JSON.stringify(deepKeys(pick(en, key)))).toBe(
        JSON.stringify(deepKeys(pick(ja, key))),
      );
    }
  });
});
