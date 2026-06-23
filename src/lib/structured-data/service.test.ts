import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const PROD_URL = "https://www.thepicklebang.com";

describe("buildServices", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("HomeServicesの6サービスすべてを返す", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    expect(services).toHaveLength(6);
  });

  it("HYROX トレーニングを含む", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    expect(services).toHaveLength(6);
    expect(services.some((s) => s.serviceType === "HYROXトレーニング")).toBe(
      true,
    );
  });

  it("各サービスが@contextとServiceを含む", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    services.forEach((service) => {
      expect(service["@context"]).toBe("https://schema.org");
      expect(service["@type"]).toBe("Service");
    });
  });

  it("各サービスがname・description・serviceTypeを含む", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    services.forEach((service) => {
      expect(service.name.length).toBeGreaterThan(0);
      expect(service.description.length).toBeGreaterThan(0);
      expect(service.serviceType.length).toBeGreaterThan(0);
    });
  });

  it("providerで施設（@id=#facility）と連結する", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    services.forEach((service) => {
      expect(service.provider).toEqual({
        "@id": `${PROD_URL}/#facility`,
      });
    });
  });

  it("areaServedで市川市を指す", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    services.forEach((service) => {
      expect(service.areaServed).toEqual({
        "@type": "AdministrativeArea",
        name: "千葉県市川市",
      });
    });
  });

  it("コートレンタルサービスを含む", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    const rental = services.find((s) => s.name === "コートレンタル");
    expect(rental).toBeDefined();
    expect(rental?.serviceType).toBe("コートレンタル");
  });

  it("コートレンタルに価格帯(¥4,980〜¥7,980)の Offer を付与する", async () => {
    const { buildServices } = await import("./service");
    const rental = buildServices().find((s) => s.name === "コートレンタル");
    expect(rental?.offers?.priceSpecification).toMatchObject({
      "@type": "PriceSpecification",
      priceCurrency: "JPY",
      minPrice: 4980,
      maxPrice: 7980,
    });
  });

  it("HYROXトレーニングに単価(¥3,000/時)の Offer を付与する", async () => {
    const { buildServices } = await import("./service");
    const hyrox = buildServices().find(
      (s) => s.serviceType === "HYROXトレーニング",
    );
    expect(hyrox?.offers?.priceSpecification).toMatchObject({
      "@type": "UnitPriceSpecification",
      priceCurrency: "JPY",
      price: 3000,
      unitCode: "HUR",
    });
  });

  it("価格未設定のサービスには offers を付けない", async () => {
    const { buildServices } = await import("./service");
    const lesson = buildServices().find((s) => s.name.includes("レッスン"));
    expect(lesson?.offers).toBeUndefined();
  });

  it("レッスンサービスを含む", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    const lesson = services.find((s) => s.name.includes("レッスン"));
    expect(lesson).toBeDefined();
  });

  it("大会・リーグサービスを含む", async () => {
    const { buildServices } = await import("./service");
    const services = buildServices();
    const tournament = services.find((s) => s.name.includes("大会"));
    expect(tournament).toBeDefined();
  });
});
