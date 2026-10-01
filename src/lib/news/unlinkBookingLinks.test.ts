import { describe, expect, it } from "vitest";

import { isBookingUrl, unlinkBookingLinks } from "./unlinkBookingLinks";

describe("isBookingUrl", () => {
  it.each([
    "https://yoyaku.labola.jp/r/shop/3473/",
    "https://labola.jp/",
    "https://www.tennisbear.net/events/123",
    "https://tennisbear.net/",
  ])("予約先: %s", (url) => {
    expect(isBookingUrl(url)).toBe(true);
  });

  it.each([
    "https://www.thepicklebang.com/reserve",
    "https://www.instagram.com/p/abc/",
    "https://evil-labola.jp.example.com/",
    "https://notlabola.jp/",
    "not a url",
    "/reserve",
  ])("予約先ではない: %s", (url) => {
    expect(isBookingUrl(url)).toBe(false);
  });
});

describe("unlinkBookingLinks", () => {
  it("予約先宛ての <a> はテキストだけ残す", () => {
    const html =
      '<p><a href="https://yoyaku.labola.jp/r/shop/3473/" target="_blank" rel="noopener">予約はこちら</a></p>';
    expect(unlinkBookingLinks(html)).toBe("<p>予約はこちら</p>");
  });

  it("テニスベア宛てもテキストだけ残す", () => {
    expect(
      unlinkBookingLinks(
        '<a href="https://www.tennisbear.net/events/1">申込</a>',
      ),
    ).toBe("申込");
  });

  it("中の装飾タグは保持する", () => {
    expect(
      unlinkBookingLinks(
        '<a href="https://labola.jp/x"><strong>今すぐ</strong>予約</a>',
      ),
    ).toBe("<strong>今すぐ</strong>予約");
  });

  it("サイト内リンク・SNS・その他の外部リンクは変更しない", () => {
    const html =
      '<a href="https://www.thepicklebang.com/reserve">予約</a><a href="https://www.instagram.com/x/">IG</a>';
    expect(unlinkBookingLinks(html)).toBe(html);
  });

  it("href の無い <a> は変更しない", () => {
    const html = '<a class="note">注</a>';
    expect(unlinkBookingLinks(html)).toBe(html);
  });

  it("複数のリンクを個別に判定する", () => {
    const html =
      '<a href="https://labola.jp/a">A</a>と<a href="https://www.thepicklebang.com/news">B</a>と<a href="https://www.tennisbear.net/c">C</a>';
    expect(unlinkBookingLinks(html)).toBe(
      'Aと<a href="https://www.thepicklebang.com/news">B</a>とC',
    );
  });

  it("リンクの無い HTML はそのまま返す", () => {
    expect(unlinkBookingLinks("<p>本文</p>")).toBe("<p>本文</p>");
  });
});
