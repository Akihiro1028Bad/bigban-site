import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const PROD_URL = "https://www.thepicklebang.com";

describe("buildSportsActivityLocation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("@contextとSportsActivityLocationを含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("SportsActivityLocation");
    expect(schema["@id"]).toBe(`${PROD_URL}/#facility`);
  });

  it("施設名・URL・ロゴ・画像を含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.name).toBe("THE PICKLE BANG THEORY");
    expect(schema.url).toBe(PROD_URL);
    expect(schema.logo).toBe(`${PROD_URL}/logos/yoko-neon.png`);
    expect(schema.image).toContain(`${PROD_URL}/`);
  });

  it("住所を正しいPostalAddressで返す", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.address).toEqual({
      "@type": "PostalAddress",
      addressCountry: "JP",
      postalCode: "272-0021",
      addressRegion: "千葉県",
      addressLocality: "市川市",
      streetAddress: "八幡2-16-6 八幡ハタビル 6階",
    });
  });

  it("緯度経度を含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 35.7239695,
      longitude: 139.9317222,
    });
  });

  it("電話番号を国際形式で返す", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.telephone).toBe("+81-90-5523-3879");
  });

  it("営業時間（全曜日 06:00-23:00）を返す", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "06:00",
        closes: "23:00",
      },
    ]);
  });

  it("priceRangeは具体値レンジで返す", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.priceRange).toBe("¥4980-¥7980");
  });

  it("sport: Pickleball を含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.sport).toBe("Pickleball");
  });

  it("sameAs にInstagramリンクを含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.sameAs).toContain(
      "https://www.instagram.com/thepicklebangtheory"
    );
  });

  it("parentOrganizationで運営会社と連結する", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.parentOrganization).toEqual({
      "@id": `${PROD_URL}/#organization`,
    });
  });

  it("potentialActionにReserveActionを含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.potentialAction).toEqual({
      "@type": "ReserveAction",
      target: `${PROD_URL}/reserve`,
    });
  });

  it("en localeでも同じ@idを返す（一意性）", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const ja = buildSportsActivityLocation("ja");
    const en = buildSportsActivityLocation("en");

    expect(ja["@id"]).toBe(en["@id"]);
  });

  it("amenityFeatureに主要設備を含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(Array.isArray(schema.amenityFeature)).toBe(true);
    expect(schema.amenityFeature.length).toBeGreaterThanOrEqual(4);
    schema.amenityFeature.forEach((feature) => {
      expect(feature["@type"]).toBe("LocationFeatureSpecification");
      expect(typeof feature.name).toBe("string");
      expect(feature.value).toBe(true);
    });
    const names = schema.amenityFeature.map((f) => f.name);
    expect(names).toContain("空調完備");
    expect(names).toContain("男女別更衣室");
    expect(names).toContain("レンタル用具");
    expect(names).toContain("無人チェックイン");
  });

  it("hasMapにGoogle Maps URLを含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.hasMap).toMatch(/^https:\/\/www\.google\.com\/maps/);
    expect(schema.hasMap).toContain("35.7239695");
    expect(schema.hasMap).toContain("139.9317222");
  });

  it("paymentAcceptedとcurrenciesAcceptedを含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.paymentAccepted).toBe("Credit Card, PayPay");
    expect(schema.currenciesAccepted).toBe("JPY");
  });

  it("alternateNameに日本語施設名とカナ表記ゆれを含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(Array.isArray(schema.alternateName)).toBe(true);
    expect(schema.alternateName).toContain("ザ ピックルバン セオリー");
    expect(schema.alternateName).toContain("ピックルバンセオリー");
  });

  it("descriptionに立地とサービス概要を含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.description).toContain("本八幡");
    expect(schema.description).toContain("ピックルボール");
    expect(schema.description).toContain("6:00-23:00");
    expect(schema.description).not.toContain("24時間");
  });

  it("sloganにキャッチコピーを含む", async () => {
    const { buildSportsActivityLocation } = await import(
      "./sportsActivityLocation"
    );
    const schema = buildSportsActivityLocation("ja");

    expect(schema.slogan).toContain("ディンク");
  });

});
