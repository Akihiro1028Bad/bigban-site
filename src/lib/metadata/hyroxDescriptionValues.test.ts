import { describe, it, expect, vi, afterEach } from "vitest";
import { createTranslator } from "next-intl";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";

afterEach(() => {
  vi.doUnmock("@/constants/pricing");
  vi.doUnmock("@/constants/site");
  vi.resetModules();
});

function describeHyrox(
  locale: "ja" | "en",
  values: Record<string, string | number>,
): string {
  const messages = locale === "ja" ? ja : en;
  const t = createTranslator({ locale, messages, namespace: "Metadata" });
  return t("hyrox.description", values);
}

describe("buildHyroxDescriptionValues", () => {
  it("ja: 体験会の所要分・料金と営業時間を表示用に整える", async () => {
    const { buildHyroxDescriptionValues } = await import(
      "./hyroxDescriptionValues"
    );
    expect(buildHyroxDescriptionValues("ja")).toEqual({
      trialMinutes: 50,
      trialPrice: "3,000円",
      open: "6:00",
      close: "23:00",
    });
  });

  it("en: 料金は ¥ 表記", async () => {
    const { buildHyroxDescriptionValues } = await import(
      "./hyroxDescriptionValues"
    );
    expect(buildHyroxDescriptionValues("en").trialPrice).toBe("¥3,000");
  });

  it("ja の description が設計書どおりの文になる", async () => {
    const { buildHyroxDescriptionValues } = await import(
      "./hyroxDescriptionValues"
    );
    expect(describeHyrox("ja", buildHyroxDescriptionValues("ja"))).toBe(
      "HYROX公式トレーニングクラブに認定された、千葉・本八幡駅徒歩1分(JR総武線・都営新宿線)のトレーニングジム。公式8種目対応の器具を常設し、現HYROX日本代表・関吉大亮コーチのクラスも開催。初めての方は体験会(50分・3,000円)から。6:00〜23:00営業。",
    );
  });

  it("en の description に体験会の料金と営業時間が入る", async () => {
    const { buildHyroxDescriptionValues } = await import(
      "./hyroxDescriptionValues"
    );
    const description = describeHyrox("en", buildHyroxDescriptionValues("en"));
    expect(description).toContain("(50 min, ¥3,000)");
    expect(description).toContain("Open 6:00–23:00.");
  });

  it("料金・営業時間の定数を変えると description と構造化データが追従する", async () => {
    vi.doMock("@/constants/pricing", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/constants/pricing")>();
      return {
        ...actual,
        HYROX_LESSON_PRICES: {
          ...actual.HYROX_LESSON_PRICES,
          trial: { minutes: 45, priceYen: 2500 },
        },
        COURT_PRICES: actual.COURT_PRICES.map((row) => ({
          ...row,
          weekend: "¥8,800",
        })),
      };
    });
    vi.doMock("@/constants/site", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/constants/site")>();
      return {
        ...actual,
        BUSINESS_HOURS: { opens: "07:00", closes: "22:00" },
      };
    });
    const { buildHyroxDescriptionValues } = await import(
      "./hyroxDescriptionValues"
    );
    const { buildExerciseGym, buildSportsActivityLocation } = await import(
      "@/lib/structured-data"
    );

    expect(describeHyrox("ja", buildHyroxDescriptionValues("ja"))).toContain(
      "体験会(45分・2,500円)から。7:00〜22:00営業。",
    );
    const gym = buildExerciseGym("ja");
    expect(gym.priceRange).toBe("¥2500-¥8800");
    expect(gym.openingHoursSpecification[0]).toMatchObject({
      opens: "07:00",
      closes: "22:00",
    });
    expect(
      buildSportsActivityLocation("ja").openingHoursSpecification[0],
    ).toMatchObject({ opens: "07:00", closes: "22:00" });
  });
});
