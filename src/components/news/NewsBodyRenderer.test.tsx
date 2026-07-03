import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { NewsBodyRenderer } from "./NewsBodyRenderer";

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
