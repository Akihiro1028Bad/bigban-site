import { describe, it, expect } from "vitest";
import { routing } from "./routing";

describe("i18n routing configuration", () => {
  it("supports ja and en locales", () => {
    expect(routing.locales).toEqual(["ja", "en"]);
  });

  it("defaults to ja locale", () => {
    expect(routing.defaultLocale).toBe("ja");
  });

  it("uses as-needed locale prefix strategy", () => {
    expect(routing.localePrefix).toBe("as-needed");
  });

  // 記事は ja のみ存在するものが多い。middleware が全ページに en の hreflang を
  // Link ヘッダーで自動付与すると、存在しない /en/... を Google に案内してしまう。
  // hreflang はページの metadata と sitemap で実在確認のうえ出す。
  it("disables middleware hreflang Link headers", () => {
    expect(routing.alternateLinks).toBe(false);
  });
});
