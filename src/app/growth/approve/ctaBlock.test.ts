// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CTA_DESTINATIONS, parseCta, serializeCta, validateCta } from "@/lib/growth/ctaBlock";

import { sanitizeDraftHtml } from "./draftEditorContent";

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

describe("serializeCta", () => {
  it("一次CTAを正準HTMLにする", () => {
    expect(serializeCta({ label: "予約する", href: "https://reserva.be/tpbt", variant: "primary" }))
      .toBe('<a class="cta" href="https://reserva.be/tpbt">予約する</a>');
  });
  it("二次CTAは cta--ghost を付ける", () => {
    expect(serializeCta({ label: "問い合わせ", href: "/#contact", variant: "ghost" }))
      .toBe('<a class="cta cta--ghost" href="/#contact">問い合わせ</a>');
  });
  it("HTML特殊文字をエスケープする", () => {
    expect(serializeCta({ label: "A & B <x>", href: 'https://x?q="1"', variant: "primary" }))
      .toBe('<a class="cta" href="https://x?q=&quot;1&quot;">A &amp; B &lt;x&gt;</a>');
  });
  it("サニタイザ往復で class/href が残る(parse⇔serialize安定)", () => {
    const cta = { label: "予約", href: "https://reserva.be/tpbt", variant: "ghost" as const };
    const round = parseCta(sanitizeDraftHtml(serializeCta(cta)));
    expect(round).toEqual(cta);
  });
});

describe("CTA_DESTINATIONS", () => {
  it("予約は内部/reserveページ(RESERVA→labola切替を吸収)", () => {
    const reserve = CTA_DESTINATIONS.find((d) => d.key === "reserve");
    expect(reserve?.url).toBe("https://www.thepicklebang.com/reserve");
  });
  it("5宛先(予約/Instagram/アクセス/問い合わせ/トップ)を持つ", () => {
    expect(CTA_DESTINATIONS.map((d) => d.key).sort())
      .toEqual(["access", "contact", "instagram", "reserve", "top"]);
  });
});

describe("validateCta", () => {
  it("文言必須・href形式OKなら ok", () => {
    expect(validateCta({ label: "予約", href: "https://www.thepicklebang.com/reserve", variant: "primary" }))
      .toEqual({ ok: true, errors: [] });
  });
  it("文言が空なら error", () => {
    expect(validateCta({ label: "  ", href: "https://x", variant: "primary" }).ok).toBe(false);
  });
  it("相対パス(/reserve・/#contact)は保存時サニタイザで href が除去されるため error", () => {
    // サニタイザ(ALLOWED_HREF_PROTOCOLS)は https:/mailto:/tel:/# 以外を落とすため、
    // validateCta もそれ以上に寛容にしない(バリデーション通過=保存で残る、を保証)。
    expect(validateCta({ label: "問い合わせ", href: "/#contact", variant: "ghost" }).ok).toBe(false);
    expect(validateCta({ label: "予約", href: "/reserve", variant: "primary" }).ok).toBe(false);
  });
  it("不正な href(javascript:)は error", () => {
    const r = validateCta({ label: "x", href: "javascript:alert(1)", variant: "primary" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("リンク先の形式が不正です");
  });
  it("全宛先プリセットの url が validateCta を通る(サニタイザ整合)", () => {
    for (const dest of CTA_DESTINATIONS) {
      expect(validateCta({ label: dest.label, href: dest.url, variant: "primary" }).ok).toBe(true);
    }
  });
});
