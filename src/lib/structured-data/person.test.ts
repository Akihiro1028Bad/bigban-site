import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const PROD_URL = "https://www.thepicklebang.com";
const INSTAGRAM = "https://www.instagram.com/yuta_yoshida_pickleball";

describe("buildPersonNishimura", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("@contextとPerson、@idを含む", async () => {
    const { buildPersonNishimura } = await import("./person");
    const schema = buildPersonNishimura();

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Person");
    expect(schema["@id"]).toBe(`${PROD_URL}/#person-nishimura`);
  });

  it("nameに西村昭彦、alternateNameに英名・カナを含む", async () => {
    const { buildPersonNishimura } = await import("./person");
    const schema = buildPersonNishimura();

    expect(schema.name).toBe("西村昭彦");
    expect(schema.alternateName).toContain("Akihiko Nishimura");
    expect(schema.alternateName).toContain("ニシムラアキヒコ");
  });

  it("jobTitleと役職説明を含む", async () => {
    const { buildPersonNishimura } = await import("./person");
    const schema = buildPersonNishimura();

    expect(schema.jobTitle).toBeTruthy();
    expect(schema.description).toContain("クロスミントン");
  });

  it("worksForでOrganizationと連結する", async () => {
    const { buildPersonNishimura } = await import("./person");
    const schema = buildPersonNishimura();

    expect(schema.worksFor).toEqual({
      "@id": `${PROD_URL}/#organization`,
    });
  });

  it("sameAsにInstagramプロフィールURLを含む", async () => {
    const { buildPersonNishimura } = await import("./person");
    const schema = buildPersonNishimura();

    expect(schema.sameAs.some((u) => u.includes("instagram.com"))).toBe(true);
  });

  it("knowsAboutにラケットスポーツ領域を含む", async () => {
    const { buildPersonNishimura } = await import("./person");
    const schema = buildPersonNishimura();

    expect(schema.knowsAbout).toContain("Pickleball");
    expect(schema.knowsAbout).toContain("Crossminton");
  });
});

describe("buildPersonYoshida", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("@contextとPerson、@idを含む", async () => {
    const { buildPersonYoshida } = await import("./person");
    const schema = buildPersonYoshida();

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Person");
    expect(schema["@id"]).toBe(`${PROD_URL}/#person-yoshida`);
  });

  it("nameとalternateNameに表記ゆれを含む", async () => {
    const { buildPersonYoshida } = await import("./person");
    const schema = buildPersonYoshida();

    expect(schema.name).toBe("吉田 祐太");
    expect(schema.alternateName).toContain("吉田祐太");
    expect(schema.alternateName).toContain("Yuta Yoshida");
    expect(schema.alternateName).toContain("ヨシダユウタ");
  });

  it("jobTitleにPBT契約選手を含む", async () => {
    const { buildPersonYoshida } = await import("./person");
    const schema = buildPersonYoshida();

    expect(schema.jobTitle).toContain("PBT契約選手");
  });

  it("descriptionにPickleball X優勝実績を含む", async () => {
    const { buildPersonYoshida } = await import("./person");
    const schema = buildPersonYoshida();

    expect(schema.description).toContain("Pickleball X");
  });

  it("sameAsにInstagramプロフィールURLを含む", async () => {
    const { buildPersonYoshida } = await import("./person");
    const schema = buildPersonYoshida();

    expect(schema.sameAs).toContain(INSTAGRAM);
  });

  it("knowsAboutにピックルボールを含む", async () => {
    const { buildPersonYoshida } = await import("./person");
    const schema = buildPersonYoshida();

    expect(schema.knowsAbout).toContain("Pickleball");
  });
});

describe("buildPersonSekiyoshi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PROD_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("@id が /#person-sekiyoshi で、ExerciseGym の employee 参照と一致する", async () => {
    const { buildPersonSekiyoshi } = await import("./person");
    const { buildExerciseGym } = await import("./exerciseGym");
    const schema = buildPersonSekiyoshi("ja");

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Person");
    expect(schema["@id"]).toBe(`${PROD_URL}/#person-sekiyoshi`);
    expect(buildExerciseGym("ja").employee).toEqual({ "@id": schema["@id"] });
  });

  it("name に関吉大亮、alternateName に英名・かなを含む", async () => {
    const { buildPersonSekiyoshi } = await import("./person");
    const schema = buildPersonSekiyoshi("ja");

    expect(schema.name).toBe("関吉大亮");
    expect(schema.alternateName).toEqual(["Daisuke Sekiyoshi", "せきよしだいすけ"]);
  });

  it("ja の jobTitle は HYROX日本代表 / メインコーチ", async () => {
    const { buildPersonSekiyoshi } = await import("./person");
    const schema = buildPersonSekiyoshi("ja");

    expect(schema.jobTitle).toBe(
      "HYROX日本代表 / THE PICKLE BANG THEORY メインコーチ",
    );
    expect(schema.description).toContain("HYROX");
  });

  it("en の jobTitle・description は英語", async () => {
    const { buildPersonSekiyoshi } = await import("./person");
    const schema = buildPersonSekiyoshi("en");

    expect(schema.jobTitle).toContain("Head Coach");
    expect(schema.description).toContain("HYROX Japan");
  });

  it("sameAs に Instagram(tac_monk)、knowsAbout に HYROX、worksFor に組織を含む", async () => {
    const { buildPersonSekiyoshi } = await import("./person");
    const schema = buildPersonSekiyoshi("ja");

    expect(schema.sameAs).toEqual(["https://www.instagram.com/tac_monk/"]);
    expect(schema.knowsAbout).toContain("HYROX");
    expect(schema.worksFor).toEqual({ "@id": `${PROD_URL}/#organization` });
  });
});
