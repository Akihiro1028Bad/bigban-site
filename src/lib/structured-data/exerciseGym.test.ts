import { describe, it, expect } from "vitest";
import { buildExerciseGym } from "./exerciseGym";
import { buildSportsActivityLocation } from "./sportsActivityLocation";

describe("buildExerciseGym", () => {
  it("ja: url が /hyrox、@id が /#hyrox", () => {
    const schema = buildExerciseGym("ja");
    expect(schema["@type"]).toBe("ExerciseGym");
    expect(schema["@id"]).toBe("http://localhost:3000/#hyrox");
    expect(schema.url).toBe("http://localhost:3000/hyrox");
    expect(schema.sport).toContain("HYROX");
  });

  it("en: url が /en/hyrox", () => {
    const schema = buildExerciseGym("en");
    expect(schema.url).toBe("http://localhost:3000/en/hyrox");
  });

  it("住所・座標・電話・営業時間が SportsActivityLocation と一致する(二重管理しない)", () => {
    const gym = buildExerciseGym("ja");
    const facility = buildSportsActivityLocation("ja");
    expect(gym.address).toEqual(facility.address);
    expect(gym.geo).toEqual(facility.geo);
    expect(gym.telephone).toBe(facility.telephone);
    expect(gym.openingHoursSpecification).toEqual(
      facility.openingHoursSpecification,
    );
  });

  it("毎日 06:00〜23:00 の営業時間を持つ", () => {
    const [hours] = buildExerciseGym("ja").openingHoursSpecification;
    expect(hours.dayOfWeek).toHaveLength(7);
    expect(hours.opens).toBe("06:00");
    expect(hours.closes).toBe("23:00");
  });

  it("画像・価格帯・コーチ(employee)を持つ", () => {
    const schema = buildExerciseGym("ja");
    expect(schema.image).toBe("http://localhost:3000/images/hyrox/promo-card.jpg");
    expect(schema.priceRange).toBe("¥3000-¥7980");
    expect(schema.employee).toEqual({
      "@id": "http://localhost:3000/#person-sekiyoshi",
    });
  });

  it("description をロケール別に返す", () => {
    expect(buildExerciseGym("ja").description).toContain(
      "HYROX公式トレーニングクラブ",
    );
    expect(buildExerciseGym("ja").description).toContain("本八幡駅徒歩1分");
    expect(buildExerciseGym("en").description).toContain(
      "HYROX Training Club",
    );
  });
});
