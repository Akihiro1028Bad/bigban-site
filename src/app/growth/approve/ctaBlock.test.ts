// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseCta } from "@/lib/growth/ctaBlock";

describe("parseCta", () => {
  it("一次CTA(<a class=\"cta\">)を構造化する", () => {
    expect(parseCta('<a class="cta" href="https://reserva.be/tpbt">今すぐ予約する</a>')).toEqual({
      label: "今すぐ予約する",
      href: "https://reserva.be/tpbt",
      variant: "primary",
    });
  });
  it("二次CTA(cta--ghost)は variant=ghost", () => {
    expect(parseCta('<a href="/#contact" class="cta cta--ghost">お問い合わせ</a>')).toEqual({
      label: "お問い合わせ",
      href: "/#contact",
      variant: "ghost",
    });
  });
  it("p でラップされていても中の a.cta を拾う", () => {
    expect(parseCta('<p><a class="cta" href="https://x">予約</a></p>')?.href).toBe("https://x");
  });
  it("旧 div.cta ラッパも吸収する(後方互換)", () => {
    expect(parseCta('<div class="cta"><a href="https://y">予約</a></div>')?.href).toBe("https://y");
  });
  it("CTAでないHTMLは null", () => {
    expect(parseCta("<p>本文</p>")).toBeNull();
  });
  it("シングルクォートの href も拾う", () => {
    expect(parseCta("<a class='cta' href='https://z'>予約</a>")).toEqual({
      label: "予約",
      href: "https://z",
      variant: "primary",
    });
  });
  it("class に cta を含まない <a> は null(div ラッパも無い場合)", () => {
    expect(parseCta('<a class="button" href="https://a">リンク</a>')).toBeNull();
  });
  it("cta を含まない div ラッパは null", () => {
    expect(parseCta('<div class="wrapper"><a href="https://b">x</a></div>')).toBeNull();
  });
  it("div.cta ラッパ内に <a> が無ければ null", () => {
    expect(parseCta('<div class="cta">リンクなし</div>')).toBeNull();
  });
  it("href 属性が無い場合は空文字になる", () => {
    expect(parseCta('<a class="cta">href無し</a>')).toEqual({
      label: "href無し",
      href: "",
      variant: "primary",
    });
  });
});
