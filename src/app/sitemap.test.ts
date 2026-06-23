import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const PROD_URL = "https://www.thepicklebang.com";

describe("sitemap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_URL);
    vi.doMock("@/lib/microcms/queries", () => ({
      getNewsSlugs: async () => [],
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/microcms/queries");
  });

  it("静的ページ5つ + ニュース一覧1つ = 6エントリ（slugなし時）", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    expect(entries).toHaveLength(6);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${PROD_URL}`);
    expect(urls).toContain(`${PROD_URL}/reserve`);
    expect(urls).toContain(`${PROD_URL}/about`);
    expect(urls).toContain(`${PROD_URL}/hyrox`);
    expect(urls).toContain(`${PROD_URL}/tokushoho`);
    expect(urls).toContain(`${PROD_URL}/news`);
  });

  it("/hyrox を ja/en alternates 付きで含む", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const hyrox = entries.find((e) => e.url === `${PROD_URL}/hyrox`);
    expect(hyrox).toBeDefined();
    expect(hyrox?.alternates?.languages?.en).toBe(`${PROD_URL}/en/hyrox`);
  });

  it("/teaser / /facility / /services は sitemap に含まれない", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.includes("/teaser"))).toBe(false);
    expect(urls.some((u) => u.includes("/facility"))).toBe(false);
    expect(urls.some((u) => u.includes("/services"))).toBe(false);
  });

  it("静的エントリに ja/en/x-default の alternates.languages が設定される", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const staticEntries = entries.filter(
      (e) =>
        e.url === PROD_URL ||
        e.url === `${PROD_URL}/about` ||
        e.url === `${PROD_URL}/tokushoho` ||
        e.url === `${PROD_URL}/news`,
    );
    for (const entry of staticEntries) {
      expect(entry.alternates?.languages).toBeDefined();
      expect(entry.alternates?.languages?.ja).toBeDefined();
      expect(entry.alternates?.languages?.en).toBeDefined();
      expect(entry.alternates?.languages?.["x-default"]).toBeDefined();
    }
  });

  it("ja URL は prefix なし", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const home = entries.find((e) => e.url === PROD_URL);
    expect(home?.alternates?.languages?.ja).toBe(PROD_URL);

    const about = entries.find((e) => e.url === `${PROD_URL}/about`);
    expect(about?.alternates?.languages?.ja).toBe(`${PROD_URL}/about`);
  });

  it("en URL は /en prefix 付き", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const home = entries.find((e) => e.url === PROD_URL);
    expect(home?.alternates?.languages?.en).toBe(`${PROD_URL}/en`);

    const about = entries.find((e) => e.url === `${PROD_URL}/about`);
    expect(about?.alternates?.languages?.en).toBe(`${PROD_URL}/en/about`);
  });

  it("x-default は ja URL と一致する", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const staticEntries = entries.filter(
      (e) => e.alternates?.languages?.["x-default"],
    );
    for (const entry of staticEntries) {
      expect(entry.alternates?.languages?.["x-default"]).toBe(
        entry.alternates?.languages?.ja,
      );
    }
  });

  it("priority と changeFrequency が SITEMAP_ROUTES と一致する", async () => {
    const { default: sitemap } = await import("./sitemap");
    const { SITEMAP_ROUTES } = await import("@/constants/routes");
    const entries = await sitemap();

    for (const route of SITEMAP_ROUTES) {
      const expectedUrl =
        route.path === "/" ? PROD_URL : `${PROD_URL}${route.path}`;
      const entry = entries.find((e) => e.url === expectedUrl);
      expect(entry?.priority).toBe(route.priority);
      expect(entry?.changeFrequency).toBe(route.changeFrequency);
    }
  });

  it("lastModified は設定しない", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    for (const entry of entries) {
      expect(entry.lastModified).toBeUndefined();
    }
  });
});

describe("news sitemap entries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_URL);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ニュース一覧 /news を含む", async () => {
    vi.doMock("@/lib/microcms/queries", () => ({
      getNewsSlugs: async () => [],
    }));
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toContain(`${PROD_URL}/news`);
  });

  it("ニュース詳細をslugごとに含む", async () => {
    vi.doMock("@/lib/microcms/queries", () => ({
      getNewsSlugs: async () => [
        { locale: "ja", slug: "s1" },
        { locale: "en", slug: "s2" },
      ],
    }));
    const { default: sitemap } = await import("./sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${PROD_URL}/news/s1`);
    expect(urls).toContain(`${PROD_URL}/en/news/s2`);
  });

  it("両 locale 揃った slug は alternates.languages を出力", async () => {
    vi.doMock("@/lib/microcms/queries", () => ({
      getNewsSlugs: async () => [
        { locale: "ja", slug: "both" },
        { locale: "en", slug: "both" },
      ],
    }));
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const jaEntry = entries.find((e) => e.url === `${PROD_URL}/news/both`);
    expect(jaEntry?.alternates?.languages?.ja).toBe(
      `${PROD_URL}/news/both`,
    );
    expect(jaEntry?.alternates?.languages?.en).toBe(
      `${PROD_URL}/en/news/both`,
    );
    expect(jaEntry?.alternates?.languages?.["x-default"]).toBe(
      `${PROD_URL}/news/both`,
    );
  });

  it("片 locale のみの slug は alternates.languages を出力しない", async () => {
    vi.doMock("@/lib/microcms/queries", () => ({
      getNewsSlugs: async () => [{ locale: "ja", slug: "only-ja" }],
    }));
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const jaEntry = entries.find(
      (e) => e.url === `${PROD_URL}/news/only-ja`,
    );
    expect(jaEntry?.alternates?.languages).toBeUndefined();
  });

  it("updatedAt があれば news 詳細に lastModified を出力する", async () => {
    vi.doMock("@/lib/microcms/queries", () => ({
      getNewsSlugs: async () => [
        { locale: "ja", slug: "s1", updatedAt: "2026-05-01T00:00:00.000Z" },
      ],
    }));
    const { default: sitemap } = await import("./sitemap");
    const entry = (await sitemap()).find(
      (e) => e.url === `${PROD_URL}/news/s1`,
    );
    expect(entry?.lastModified).toBe("2026-05-01T00:00:00.000Z");
  });
});
