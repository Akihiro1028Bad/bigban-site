import { describe, expect, it } from "vitest";

import {
  CTA_EVENTS,
  articleBodyCtaKey,
  ctaEventParams,
  formEntryLabel,
} from "./events";
import { CTA_EVENTS as GROWTH_CTA_EVENTS } from "@/lib/growth/ctaEvents";

describe("CTA_EVENTS", () => {
  it("公開導線の key イベント名を持つ(GA4 キーイベント化対象)", () => {
    expect(CTA_EVENTS).toEqual({
      instagram: "instagram_click",
      line: "line_click",
      reservation: "reservation_click",
      reserveEntry: "reserve_entry_click",
      contactSubmit: "contact_submit",
      newsletterSignup: "newsletter_signup",
      externalLink: "external_link_click",
      contentClick: "content_click",
      access: "access_click",
      price: "price_click",
      newsCta: "news_cta_click",
    });
  });

  it("グロース集計の正典と同じ定義を参照する", () => {
    expect(CTA_EVENTS).toBe(GROWTH_CTA_EVENTS);
  });
});

describe("ctaEventParams", () => {
  it("location のみ(label 無し)", () => {
    expect(ctaEventParams("home_about")).toEqual({ location: "home_about" });
  });

  it("location と label", () => {
    expect(ctaEventParams("news_body", "本八幡 体験予約")).toEqual({
      location: "news_body",
      label: "本八幡 体験予約",
    });
  });

  it("label が空文字なら付けない", () => {
    expect(ctaEventParams("footer", "")).toEqual({ location: "footer" });
  });

  it("記事slugをPIIを含まない専用パラメータとして追加する", () => {
    expect(
      ctaEventParams("article_body_cta", undefined, {
        articleSlug: "fresh-pickleball-guide",
      }),
    ).toEqual({
      location: "article_body_cta",
      article_slug: "fresh-pickleball-guide",
    });
  });

  it("不正な記事slugは送信パラメータへ含めない", () => {
    expect(
      ctaEventParams("article_body_cta", undefined, {
        articleSlug: "user@example.com",
      }),
    ).toEqual({ location: "article_body_cta" });
  });
});

describe("articleBodyCtaKey", () => {
  const origin = "https://www.thepicklebang.com";

  it.each([
    "https://www.thepicklebang.com/reserve",
    "https://www.thepicklebang.com/en/reserve",
    "/reserve",
    "/en/reserve",
  ])("公式予約案内ページ %s は reserveEntry", (href) => {
    expect(articleBodyCtaKey(href, origin)).toBe("reserveEntry");
  });

  it.each([
    "https://reserva.be/tpbt",
    "https://yoyaku.labola.jp/r/shop/3473/calendar_week/2026/7/27/?tab_name=x",
    "https://yoyaku.labola.jp/r/shop/3473/event/school/",
  ])("外部予約サービス %s は reservation", (href) => {
    expect(articleBodyCtaKey(href, origin)).toBe("reservation");
  });

  it("その他の外部httpsリンクは externalLink", () => {
    expect(articleBodyCtaKey("https://example.com/info", origin)).toBe(
      "externalLink",
    );
  });

  it.each([
    "https://www.thepicklebang.com/about",
    "mailto:user@example.com",
    "tel:09012345678",
    "#section",
  ])("予約以外の内部リンク・PIIを含み得るscheme %s は送信しない", (href) => {
    expect(articleBodyCtaKey(href, origin)).toBeNull();
  });

  it("URLとして解釈できないoriginは安全側で送信しない", () => {
    expect(articleBodyCtaKey("/reserve", "invalid-origin")).toBeNull();
  });
});

describe("formEntryLabel", () => {
  it("文字列はそのまま", () => {
    expect(formEntryLabel("court")).toBe("court");
  });
  it("空文字は undefined", () => {
    expect(formEntryLabel("")).toBeUndefined();
  });
  it("非文字列(File等)は undefined", () => {
    expect(formEntryLabel(new File([], "x.png"))).toBeUndefined();
    expect(formEntryLabel(undefined)).toBeUndefined();
  });
});
