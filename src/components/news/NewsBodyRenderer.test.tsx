import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { NewsBodyRenderer } from "./NewsBodyRenderer";

const trackCtaClickMock = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClickMock(...args),
}));

const messages = {
  News: {
    embed: {
      youtube: {
        iframeTitle: "YouTube プレイヤー",
      },
      instagram: {
        iframeTitle: "Instagram 投稿",
      },
      fallbackLabel: "外部サイトで開く",
    },
  },
};

function withIntl(ui: React.ReactNode, locale: "ja" | "en" = "ja") {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("NewsBodyRenderer", () => {
  it("displayMode=html で bodyHtml を STRICT サニタイズ後に表示", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml="<p>html-mode-body</p>"
        body="<p>rich-body</p>"
      />,
    );
    expect(container.querySelector("p")?.textContent).toBe("html-mode-body");
  });

  it("displayMode=rich で body をリッチサニタイズ後に表示", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="rich"
        bodyHtml="<p>html-mode-body</p>"
        body="<h2>rich-title</h2><p>rich-body</p>"
      />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("rich-title");
  });

  it("displayMode=html で <script> 除去", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml="<p>ok</p><script>alert(1)</script>"
        body=""
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("ok");
  });

  it("body/bodyHtml 共に空かつ displayMode=html → 空状態フォールバック", () => {
    render(
      <NewsBodyRenderer displayMode="html" bodyHtml="" body="" />,
    );
    expect(
      screen.getByTestId("news-body-empty").textContent,
    ).toBeTruthy();
  });

  it("prose クラスを適用", () => {
    render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml="<p>x</p>"
        body=""
      />,
    );
    expect(screen.getByTestId("news-body").className).toContain("prose");
  });

  it("prose-invert + ブランドオーバーライド (リンク色 / blockquote / focus) が付与される", () => {
    render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml="<p>x</p>"
        body=""
      />,
    );
    const cls = screen.getByTestId("news-body").className;
    expect(cls).toContain("prose-invert");
    expect(cls).toContain("prose-a:text-accent");
    expect(cls).toContain("prose-blockquote:border-accent/40");
    expect(cls).toContain("prose-a:focus-visible:outline");
    expect(cls).toContain("prose-img:rounded-none");
  });

  it("<table> は news-table-scroll ラッパー (role=region + tabindex=0) で自動的に包まれる", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml='<table><tr><th scope="col">A</th></tr></table>'
        body=""
      />,
    );
    const wrapper = container.querySelector("figure.news-table-scroll");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("role")).toBe("region");
    expect(wrapper?.getAttribute("tabindex")).toBe("0");
    expect(wrapper?.getAttribute("aria-label")).toBe("表");
    expect(wrapper?.querySelector("table")).not.toBeNull();
  });

  it("microCMS 画像に画像 API パラメータが自動付与される (?w=1200&fm=webp&q=80)", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml='<img src="https://images.microcms-assets.io/foo/bar.jpg" alt="x" width="800" height="450">'
        body=""
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("w=1200");
    expect(img?.getAttribute("src")).toContain("fm=webp");
    expect(img?.getAttribute("src")).toContain("q=80");
  });

  it("画像 API パラメータが既に付いている場合は二重付与しない", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml='<img src="https://images.microcms-assets.io/foo/bar.jpg?w=600" alt="x" width="600" height="338">'
        body=""
      />,
    );
    const src = container.querySelector("img")?.getAttribute("src") ?? "";
    expect(src).toContain("?w=600");
    expect(src.match(/w=/g)?.length).toBe(1); // w= は 1 回だけ
  });

  it("badge / note / mark / aside がサニタイズ後に保持される", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml={
          '<p><span class="badge">中級</span> <mark>強調</mark></p>' +
          '<aside class="note">注意</aside>' +
          '<aside class="caution">警告</aside>'
        }
        body=""
      />,
    );
    expect(
      container.querySelector('span.badge')?.textContent,
    ).toBe("中級");
    expect(container.querySelector("mark")?.textContent).toBe("強調");
    expect(
      container.querySelector('aside.note')?.textContent,
    ).toBe("注意");
    expect(
      container.querySelector('aside.caution')?.textContent,
    ).toBe("警告");
  });

  it("isFirstImageLcp=true で先頭 img に fetchpriority=high", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml='<img src="https://images.microcms-assets.io/a.jpg" alt="x" width="10" height="10">'
        body=""
        isFirstImageLcp
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("fetchpriority")).toBe("high");
  });

  it("displayMode=html の本文に href の <a> があると target/rel が付く", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml='<a href="https://example.com">x</a>'
        body=""
      />,
    );
    const a = container.querySelector("a");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  describe("記事本文CTA計測", () => {
    it.each([
      { locale: "ja" as const, label: "今すぐ予約する" },
      { locale: "en" as const, label: "Book now" },
    ])("$locale の公式予約リンクを記事slug付きで1回送信する", async ({ locale, label }) => {
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml={`<p><a href="https://www.thepicklebang.com/${locale === "en" ? "en/" : ""}reserve" class="cta"><strong>${label}</strong></a></p>`}
          body=""
          locale={locale}
          articleSlug="fresh-pickleball-guide"
        />,
      );

      await userEvent.click(screen.getByRole("link", { name: label }));

      expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
      expect(trackCtaClickMock).toHaveBeenCalledWith(
        "reserveEntry",
        "article_body_cta",
        undefined,
        { articleSlug: "fresh-pickleball-guide" },
      );
    });

    it("外部予約サービス直リンクを reservation として送信する", async () => {
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml='<a href="https://yoyaku.labola.jp/r/shop/3473/event/school/">予約する</a>'
          body=""
          articleSlug="lesson-guide"
        />,
      );

      await userEvent.click(screen.getByRole("link", { name: "予約する" }));

      expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
      expect(trackCtaClickMock).toHaveBeenCalledWith(
        "reservation",
        "article_body_cta",
        undefined,
        { articleSlug: "lesson-guide" },
      );
    });

    it("その他の外部リンクを externalLink として送信する", async () => {
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml='<a href="https://example.com/info">外部情報</a>'
          body=""
          articleSlug="external-guide"
        />,
      );

      await userEvent.click(screen.getByRole("link", { name: "外部情報" }));

      expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
      expect(trackCtaClickMock).toHaveBeenCalledWith(
        "externalLink",
        "article_body_cta",
        undefined,
        { articleSlug: "external-guide" },
      );
    });

    it("キーボードのEnterによるネイティブクリックも1回だけ送信する", async () => {
      const user = userEvent.setup();
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml='<a href="https://www.thepicklebang.com/reserve">予約する</a>'
          body=""
          articleSlug="keyboard-guide"
        />,
      );
      const link = screen.getByRole("link", { name: "予約する" });
      link.focus();

      await user.keyboard("{Enter}");

      expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
    });

    it("リンク内の子要素をクリックしても二重発火しない", async () => {
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml='<a href="https://www.thepicklebang.com/reserve"><strong>予約する</strong></a>'
          body=""
          articleSlug="nested-guide"
        />,
      );

      await userEvent.click(screen.getByText("予約する"));

      expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
    });

    it("リンク文言・URLに含まれる個人情報を送信しない", async () => {
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml='<a href="https://example.com/?email=user@example.com">user@example.com / 090-1234-5678</a>'
          body=""
          articleSlug="privacy-guide"
        />,
      );

      await userEvent.click(
        screen.getByRole("link", { name: /user@example\.com/ }),
      );

      expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(trackCtaClickMock.mock.calls)).not.toContain(
        "user@example.com",
      );
      expect(JSON.stringify(trackCtaClickMock.mock.calls)).not.toContain(
        "090-1234-5678",
      );
    });

    it("slug未指定のプレビューでは送信しない", async () => {
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml='<a href="https://www.thepicklebang.com/reserve">予約する</a>'
          body=""
        />,
      );

      await userEvent.click(screen.getByRole("link", { name: "予約する" }));

      expect(trackCtaClickMock).not.toHaveBeenCalled();
    });

    it.each([
      { html: "<p>本文だけ</p>", name: "本文だけ" },
      { html: "<a>リンク先なし</a>", name: "リンク先なし" },
      {
        html: '<a href="https://www.thepicklebang.com/about">施設情報</a>',
        name: "施設情報",
      },
    ])("計測対象外の本文要素 $name では送信しない", async ({ html, name }) => {
      trackCtaClickMock.mockClear();
      render(
        <NewsBodyRenderer
          displayMode="html"
          bodyHtml={html}
          body=""
          articleSlug="ignored-guide"
        />,
      );

      await userEvent.click(screen.getByText(name));

      expect(trackCtaClickMock).not.toHaveBeenCalled();
    });
  });

  it("displayMode=html フォールバック: bodyHtml 空でも body があれば rich で表示", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml=""
        body="<p>rich-fallback</p>"
      />,
    );
    expect(container.querySelector("p")?.textContent).toBe("rich-fallback");
    warnSpy.mockRestore();
  });

  it("displayMode=rich フォールバック: body 空でも bodyHtml があれば STRICT で表示", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="rich"
        bodyHtml="<p>html-fallback</p>"
        body=""
      />,
    );
    expect(container.querySelector("p")?.textContent).toBe("html-fallback");
  });

  it("displayMode=rich で body / bodyHtml 共に空 → 空状態フォールバック", () => {
    const { container } = render(
      <NewsBodyRenderer displayMode="rich" bodyHtml="" body="" />,
    );
    expect(container.textContent).toContain("本文がありません");
  });

  it("locale=en + body/bodyHtml 共に空 → 英語の空状態メッセージ", () => {
    const { container } = render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml=""
        body=""
        locale="en"
      />,
    );
    expect(container.textContent).toContain("No content available.");
  });

  describe("SNS 埋め込みトークン → React Component 置換", () => {
    it("YouTube 埋め込みトークン (top-level) を YouTubeEmbed として描画", () => {
      const html = `<p>動画はこちら。</p><a class="embed" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ">YouTube で見る</a><p>続きの本文。</p>`;
      const { container } = render(
        withIntl(
          <NewsBodyRenderer
            displayMode="html"
            bodyHtml={html}
            body=""
          />,
        ),
      );
      // YouTubeEmbed の特徴: テストID embed-shell が存在し、iframe が即時描画される
      expect(container.querySelector('[data-testid="embed-shell"]')).toBeInTheDocument();
      // 周辺の <p> は維持
      expect(screen.getByText("動画はこちら。")).toBeInTheDocument();
      expect(screen.getByText("続きの本文。")).toBeInTheDocument();
    });

    it("埋め込みフォールバックは既存の計測だけが1回発火する", async () => {
      trackCtaClickMock.mockClear();
      const user = userEvent.setup();
      const html = `<a class="embed" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ">YouTube で見る</a>`;
      render(
        withIntl(
          <NewsBodyRenderer
            displayMode="html"
            bodyHtml={html}
            body=""
            articleSlug="video-guide"
          />,
        ),
      );

      await user.click(screen.getByTestId("embed-fallback-link"));

      expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
      expect(trackCtaClickMock).toHaveBeenCalledWith(
        "externalLink",
        "embed_fallback",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
    });

    it("属性順序が逆 (data-embed-id が先) でも置換される", () => {
      const html = `<a data-embed-id="dQw4w9WgXcQ" data-embed-provider="youtube" class="embed">x</a>`;
      const { container } = render(
        withIntl(
          <NewsBodyRenderer
            displayMode="html"
            bodyHtml={html}
            body=""
          />,
        ),
      );
      expect(container.querySelector('[data-testid="embed-shell"]')).toBeInTheDocument();
    });

    it("Instagram 埋め込みトークンも InstagramEmbed として描画 (dispatcher 分岐検証)", () => {
      const html = `<a class="embed" data-embed-provider="instagram" data-embed-id="C12abcXYZ_-">Instagram で見る</a>`;
      const { container } = render(
        withIntl(
          <NewsBodyRenderer
            displayMode="html"
            bodyHtml={html}
            body=""
          />,
        ),
      );
      const shell = container.querySelector('[data-testid="embed-shell"]') as HTMLElement;
      expect(shell).toBeInTheDocument();
      // Instagram の特徴: max-width 540px (YouTube は無し) で識別
      expect(shell.style.maxWidth).toBe("540px");
    });

    it("未登録プロバイダ (vimeo) はサニタイザーで data-embed-provider が落ち、素のリンクとして残る", () => {
      const html = `<a class="embed" data-embed-provider="vimeo" data-embed-id="123">Vimeo で見る</a>`;
      const { container } = render(
        withIntl(
          <NewsBodyRenderer
            displayMode="html"
            bodyHtml={html}
            body=""
          />,
        ),
      );
      // EmbedShell は描画されない
      expect(container.querySelector('[data-testid="embed-shell"]')).toBeNull();
      // テキストはそのまま残る (サニタイザー通過後の <a> として)
      expect(container.textContent).toContain("Vimeo で見る");
    });

    it("複数の埋め込みトークンを順番に描画", () => {
      const html = `<p>1本目</p><a class="embed" data-embed-provider="youtube" data-embed-id="aaaaaaaaaaa">x</a><p>2本目</p><a class="embed" data-embed-provider="youtube" data-embed-id="bbbbbbbbbbb">y</a>`;
      const { container } = render(
        withIntl(
          <NewsBodyRenderer
            displayMode="html"
            bodyHtml={html}
            body=""
          />,
        ),
      );
      const shells = container.querySelectorAll('[data-testid="embed-shell"]');
      expect(shells.length).toBe(2);
    });

    it("埋め込みなしの記事は従来通り素直に表示", () => {
      const html = `<h2>見出し</h2><p>本文</p>`;
      const { container } = render(
        withIntl(
          <NewsBodyRenderer
            displayMode="html"
            bodyHtml={html}
            body=""
          />,
        ),
      );
      expect(container.querySelector("h2")?.textContent).toBe("見出し");
      expect(container.querySelector("p")?.textContent).toBe("本文");
      expect(container.querySelector('[data-testid="embed-shell"]')).toBeNull();
    });
  });
});
