import { describe, expect, it } from "vitest";

import { CTA_EVENTS, ctaEventParams, formEntryLabel } from "./events";

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
