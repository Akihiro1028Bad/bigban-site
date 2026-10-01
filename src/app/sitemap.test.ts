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

  it("静的ページ8つ + ニュース一覧1つ を ja/en それぞれ = 18エントリ（slugなし時）", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    expect(entries).toHaveLength(18);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${PROD_URL}`);
    expect(urls).toContain(`${PROD_URL}/about`);
    expect(urls).toContain(`${PROD_URL}/reserve`);
    expect(urls).toContain(`${PROD_URL}/first-visit`);
    expect(urls).toContain(`${PROD_URL}/hyrox`);
    expect(urls).toContain(`${PROD_URL}/pbt-club`);
    expect(urls).toContain(`${PROD_URL}/tokushoho`);
    expect(urls).toContain(`${PROD_URL}/contributors`);
    expect(urls).toContain(`${PROD_URL}/news`);
  });

  it("/hyrox を ja/en alternates 付きで含む", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const hyrox = entries.find((e) => e.url === `${PROD_URL}/hyrox`);
    expect(hyrox).toBeDefined();
    expect(hyrox?.alternates?.languages?.en).toBe(`${PROD_URL}/en/hyrox`);
  });

  it("/pbt-club を ja/en alternates 付きで含む", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const pbtClub = entries.find((e) => e.url === `${PROD_URL}/pbt-club`);
    expect(pbtClub).toBeDefined();
    expect(pbtClub?.alternates?.languages?.en).toBe(`${PROD_URL}/en/pbt-club`);
    expect(entries.some((e) => e.url === `${PROD_URL}/en/pbt-club`)).toBe(true);
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

  it("en 版の静的ページとニュース一覧も独立した <url> エントリとして含む", async () => {
    const { default: sitemap } = await import("./sitemap");
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain(`${PROD_URL}/en`);
    expect(urls).toContain(`${PROD_URL}/en/about`);
    expect(urls).toContain(`${PROD_URL}/en/reserve`);
    expect(urls).toContain(`${PROD_URL}/en/first-visit`);
    expect(urls).toContain(`${PROD_URL}/en/hyrox`);
    expect(urls).toContain(`${PROD_URL}/en/contributors`);
    expect(urls).toContain(`${PROD_URL}/en/tokushoho`);
    expect(urls).toContain(`${PROD_URL}/en/news`);
  });

  it("en エントリは ja エントリと同じ alternates・priority・changeFrequency を持つ", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const pairs: [string, string][] = [
      [PROD_URL, `${PROD_URL}/en`],
      [`${PROD_URL}/hyrox`, `${PROD_URL}/en/hyrox`],
      [`${PROD_URL}/news`, `${PROD_URL}/en/news`],
    ];
    for (const [jaUrl, enUrl] of pairs) {
      const ja = entries.find((e) => e.url === jaUrl);
      const en = entries.find((e) => e.url === enUrl);
      expect(en).toBeDefined();
      expect(en?.alternates).toEqual(ja?.alternates);
      expect(en?.priority).toBe(ja?.priority);
      expect(en?.changeFrequency).toBe(ja?.changeFrequency);
    }
  });

  it("同じ URL のエントリを重複させない", async () => {
    const { default: sitemap } = await import("./sitemap");
    const urls = (await sitemap()).map((e) => e.url);

    expect(new Set(urls).size).toBe(urls.length);
  });

  it("lastModified は設定しない", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    for (const entry of entries) {
      expect(entry.lastModified).toBeUndefined();
    }
  });

  it("revalidate=3600 でデプロイを待たず1時間以内に再生成される", async () => {
    // ビルド時の静的生成だけだと、デプロイ後に公開した記事が次のデプロイまで
    // sitemap に載らない (2026-09-25 hyrox-training-start-guide で発生)。
    const { revalidate } = await import("./sitemap");
    expect(revalidate).toBe(3600);
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

describe("columns sitemap entries (flag 連動)", () => {
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
    vi.doUnmock("@/lib/microcms/columnsQueries");
    vi.doUnmock("@/config/featureFlags");
  });

  it("flag OFF では columns URL を出さない", async () => {
    vi.doMock("@/config/featureFlags", () => ({
      isCmsColumnsEnabled: () => false,
    }));
    const getColumnSlugs = vi.fn(async () => []);
    vi.doMock("@/lib/microcms/columnsQueries", () => ({ getColumnSlugs }));
    const { default: sitemap } = await import("./sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes("/columns"))).toBe(false);
    // flag OFF のときは columns の取得すら行わない。
    expect(getColumnSlugs).not.toHaveBeenCalled();
  });

  it("flag ON で columns 一覧と詳細(offset 反復の全 slug)を含む", async () => {
    vi.doMock("@/config/featureFlags", () => ({
      isCmsColumnsEnabled: () => true,
    }));
    vi.doMock("@/lib/microcms/columnsQueries", () => ({
      getColumnSlugs: async () => [
        { locale: "ja", slug: "c1" },
        { locale: "en", slug: "c2" },
      ],
    }));
    const { default: sitemap } = await import("./sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${PROD_URL}/columns`);
    expect(urls).toContain(`${PROD_URL}/en/columns`);
    expect(urls).toContain(`${PROD_URL}/columns/c1`);
    expect(urls).toContain(`${PROD_URL}/en/columns/c2`);
  });

  it("flag ON: en のコラム一覧は ja と同じ alternates を持つ", async () => {
    vi.doMock("@/config/featureFlags", () => ({
      isCmsColumnsEnabled: () => true,
    }));
    vi.doMock("@/lib/microcms/columnsQueries", () => ({
      getColumnSlugs: async () => [],
    }));
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const ja = entries.find((e) => e.url === `${PROD_URL}/columns`);
    const en = entries.find((e) => e.url === `${PROD_URL}/en/columns`);
    expect(en?.alternates).toEqual(ja?.alternates);
    expect(en?.alternates?.languages?.en).toBe(`${PROD_URL}/en/columns`);
  });

  it("flag ON: 両 locale 揃った columns slug は alternates を出力", async () => {
    vi.doMock("@/config/featureFlags", () => ({
      isCmsColumnsEnabled: () => true,
    }));
    vi.doMock("@/lib/microcms/columnsQueries", () => ({
      getColumnSlugs: async () => [
        { locale: "ja", slug: "both" },
        { locale: "en", slug: "both" },
      ],
    }));
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const jaEntry = entries.find((e) => e.url === `${PROD_URL}/columns/both`);
    expect(jaEntry?.alternates?.languages?.en).toBe(
      `${PROD_URL}/en/columns/both`,
    );
  });

  it("flag ON: columns 取得失敗でも news 側は壊さない(防御)", async () => {
    vi.doMock("@/config/featureFlags", () => ({
      isCmsColumnsEnabled: () => true,
    }));
    vi.doMock("@/lib/microcms/columnsQueries", () => ({
      getColumnSlugs: async () => {
        throw new Error("down");
      },
    }));
    const { default: sitemap } = await import("./sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    // 一覧 URL は入るが、詳細は空(取得失敗のフォールバック)。
    expect(urls).toContain(`${PROD_URL}/columns`);
    expect(urls.some((u) => /\/columns\/.+/.test(u))).toBe(false);
  });

  it("flag ON: updatedAt があれば columns 詳細に lastModified を出力する", async () => {
    vi.doMock("@/config/featureFlags", () => ({
      isCmsColumnsEnabled: () => true,
    }));
    vi.doMock("@/lib/microcms/columnsQueries", () => ({
      getColumnSlugs: async () => [
        { locale: "ja", slug: "c1", updatedAt: "2026-09-28T00:15:38.925Z" },
      ],
    }));
    const { default: sitemap } = await import("./sitemap");
    const entry = (await sitemap()).find(
      (e) => e.url === `${PROD_URL}/columns/c1`,
    );
    expect(entry?.lastModified).toBe("2026-09-28T00:15:38.925Z");
  });
});
