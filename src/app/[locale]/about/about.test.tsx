import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import AboutPage from "./AboutContent";
import jaMessages from "../../../../messages/ja.json";
import enMessages from "../../../../messages/en.json";

import type { ReactElement } from "react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
  usePathname: () => "/about",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("embla-carousel-react", () => ({
  default: () => [vi.fn(), null],
}));

// Mock IntersectionObserver for HomeNavigation's useActiveSection
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("AboutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ABOUT USタイトルを表示する", () => {
    renderWithIntl(<AboutPage />);
    const headings = screen.getAllByText("ABOUT US");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("全6セクションのヘッダーを表示する", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("COMPANY")).toBeInTheDocument();
    expect(screen.getByText("FOUNDER")).toBeInTheDocument();
    expect(screen.getByText("OUR PLAYERS")).toBeInTheDocument();
    expect(screen.getByText("OUR CREW")).toBeInTheDocument();
    // NEWS は about ページのセクション見出しと共通ヘッダーリンクの両方に出るため複数一致を許容する
    const newsElements = screen.getAllByText("NEWS");
    expect(newsElements.length).toBeGreaterThanOrEqual(1);
    const contactElements = screen.getAllByText("CONTACT");
    expect(contactElements.length).toBeGreaterThanOrEqual(1);
  });

  it("CONTACTセクションに施設住所が表示される（JP）", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("千葉県市川市八幡2-16-6 八幡ハタビル 6階")).toBeInTheDocument();
  });

  it("CONTACTセクションに施設住所が表示される（EN）", () => {
    renderWithIntl(<AboutPage />, "en");
    expect(screen.getByText("2-16-6 Yawata Hata Bldg. 6F, Yawata, Ichikawa City, Chiba")).toBeInTheDocument();
  });

  it("COMPANYセクションに会社住所が表示される（JP）", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("〒141-0021 東京都品川区上大崎3丁目14番34号プラスワン402")).toBeInTheDocument();
  });

  it("COMPANYセクションに会社住所が表示される（EN）", () => {
    renderWithIntl(<AboutPage />, "en");
    expect(screen.getByText("Plus One 402, 3-14-34 Kamiosaki, Shinagawa-ku, Tokyo 141-0021")).toBeInTheDocument();
  });

  it("RST Agency情報を表示する", () => {
    renderWithIntl(<AboutPage />);
    const rstElements = screen.getAllByText("RST Agency株式会社");
    expect(rstElements.length).toBeGreaterThanOrEqual(1);
  });

  it("西村昭彦の経歴を表示する", () => {
    renderWithIntl(<AboutPage />);
    const nameElements = screen.getAllByText("西村昭彦");
    expect(nameElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/クロスミントンへ転向/)).toBeInTheDocument();
  });

  it("PBT契約選手セクションを表示する", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("PBT契約選手")).toBeInTheDocument();
  });

  it("モバイル用カルーセルとPC用2カラムグリッドの両方が存在する", () => {
    const { container } = renderWithIntl(<AboutPage />);

    const mobileWrap = container.querySelector(
      '.md\\:hidden [aria-roledescription="carousel"]'
    );
    expect(mobileWrap).toBeInTheDocument();

    const pcGrid = container.querySelector(".hidden.md\\:grid.md\\:grid-cols-2");
    expect(pcGrid).toBeInTheDocument();
  });

  it("PBTクルーセクションを表示する", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("PBTクルー")).toBeInTheDocument();
    expect(screen.getByText("勝間田靖子 / Yasuko the Pickleballer")).toBeInTheDocument();
    expect(screen.getByText("おすず / Osuzu")).toBeInTheDocument();
    expect(screen.getByText("つつ / Tsutsu")).toBeInTheDocument();
    const igLink = screen.getByRole("link", {
      name: /@yasuko_the_pickleballer/,
    });
    expect(igLink).toHaveAttribute(
      "href",
      "https://www.instagram.com/yasuko_the_pickleballer/"
    );
  });

  it("ニュースセクションを表示する", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("ニュース")).toBeInTheDocument();
    expect(screen.getByText("クラウドファンディング実施中！")).toBeInTheDocument();
    const campfireLink = screen.getByRole("link", { name: /CAMP-FIRE/ });
    expect(campfireLink).toHaveAttribute(
      "href",
      "https://camp-fire.jp/projects/926247/view?utm_campaign=cp_po_share_c_msg_mypage_projects_show"
    );
    expect(screen.getByText("PR TIMES")).toBeInTheDocument();
  });

  it("コンタクトフォームを表示する", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("SEND MESSAGE")).toBeInTheDocument();
  });

  it("Instagramリンクが設定されている", () => {
    renderWithIntl(<AboutPage />);
    const igLink = screen.getByText("@thepicklebangtheory");
    expect(igLink.closest("a")).toHaveAttribute(
      "href",
      "https://www.instagram.com/thepicklebangtheory"
    );
  });

  it("FOUNDERセクションに西村昭彦のInstagramリンクを表示する", () => {
    renderWithIntl(<AboutPage />);
    const link = screen.getByText("@akihiko.rst").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://www.instagram.com/akihiko.rst/"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link?.querySelector("svg")).toBeInTheDocument();
  });

  it("メールアドレスを表示しない", () => {
    renderWithIntl(<AboutPage />);
    const emailElements = screen.queryAllByText(/hello@rstagency/);
    expect(emailElements).toHaveLength(0);
  });

  it("ハッシュ付きURLではスクロールリセットしない", () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, hash: "#contact" },
      writable: true,
    });
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderWithIntl(<AboutPage />);
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
    Object.defineProperty(window, "location", {
      value: { ...window.location, hash: "" },
      writable: true,
    });
  });

  it("戦績セクション（PICKLEBALL CAREER）を表示する", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("PICKLEBALL CAREER")).toBeInTheDocument();
    expect(screen.getByText("YEAR")).toBeInTheDocument();
    expect(screen.getByText("TOURNAMENT")).toBeInTheDocument();
    expect(screen.getByText("CATEGORY")).toBeInTheDocument();
    expect(screen.getByText("RESULT")).toBeInTheDocument();
  });

  it("戦績データが全件表示される", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText("Pickleball D-Joy Tour 2026")).toBeInTheDocument();
    expect(screen.getByText("PPA World Championship")).toBeInTheDocument();
    expect(screen.getByText("KINTO JAPAN CUP 19+A")).toBeInTheDocument();
    expect(screen.getByText("JPA TOP TOUR T1")).toBeInTheDocument();
    expect(screen.getByText("JPA TOP TOUR T2")).toBeInTheDocument();
  });

  it("戦績の結果ラベルが表示される", () => {
    renderWithIntl(<AboutPage />);
    const goldResults = screen.getAllByText("優勝");
    expect(goldResults.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("JPA日本ランキング上位者として選抜")).toBeInTheDocument();
    expect(screen.getByText("4位")).toBeInTheDocument();
  });

  it("HOMEリンクを表示する", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByText(/© 2026 RST Agency/)).toBeInTheDocument();
  });

  it("フォーム送信成功時にメッセージを表示する", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    renderWithIntl(<AboutPage />);

    fireEvent.change(screen.getByPlaceholderText("お名前 *"), {
      target: { value: "テスト太郎" },
    });
    fireEvent.change(screen.getByPlaceholderText("メールアドレス *"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("お問い合わせ種別"), {
      target: { value: "other" },
    });
    fireEvent.change(screen.getByPlaceholderText("お問い合わせ内容 *"), {
      target: { value: "テストメッセージ" },
    });
    fireEvent.click(screen.getByText("SEND MESSAGE"));

    await waitFor(() => {
      expect(
        screen.getByText("送信しました。ありがとうございます。")
      ).toBeInTheDocument();
    });
  });

  it("フォーム送信失敗時にエラーメッセージを表示する", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    renderWithIntl(<AboutPage />);

    fireEvent.change(screen.getByPlaceholderText("お名前 *"), {
      target: { value: "テスト太郎" },
    });
    fireEvent.change(screen.getByPlaceholderText("メールアドレス *"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("お問い合わせ種別"), {
      target: { value: "other" },
    });
    fireEvent.change(screen.getByPlaceholderText("お問い合わせ内容 *"), {
      target: { value: "テストメッセージ" },
    });
    fireEvent.click(screen.getByText("SEND MESSAGE"));

    await waitFor(() => {
      expect(
        screen.getByText("送信に失敗しました。もう一度お試しください。")
      ).toBeInTheDocument();
    });
  });

  it("ネットワークエラー時にエラーメッセージを表示する", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    renderWithIntl(<AboutPage />);

    fireEvent.change(screen.getByPlaceholderText("お名前 *"), {
      target: { value: "テスト太郎" },
    });
    fireEvent.change(screen.getByPlaceholderText("メールアドレス *"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("お問い合わせ種別"), {
      target: { value: "other" },
    });
    fireEvent.change(screen.getByPlaceholderText("お問い合わせ内容 *"), {
      target: { value: "テストメッセージ" },
    });
    fireEvent.click(screen.getByText("SEND MESSAGE"));

    await waitFor(() => {
      expect(
        screen.getByText("送信に失敗しました。もう一度お試しください。")
      ).toBeInTheDocument();
    });
  });
});

describe("AboutContent 05 NEWS (CMS integration)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("newsItems が渡されると NewsItem 表示 (続きを読む + すべてのニュースを見る)", async () => {
    const { default: AboutContentReloaded } = await import("./AboutContent");
    const items = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`,
      slug: `s${i}`,
      title: `ニュース${i}`,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      publishedAt: "2026-04-01T00:00:00.000Z",
      locale: "ja" as const,
      category: ["notice"] as ("notice" | "media" | "event" | "campaign")[],
      excerpt: `抜粋${i}`,
      displayMode: "html" as const,
      bodyHtml: "<p>本文</p>",
      body: "",
    }));
    renderWithIntl(<AboutContentReloaded newsItems={items} locale="ja" />);
    expect(screen.getByText("ニュース0")).toBeInTheDocument();
    expect(screen.getByText("ニュース2")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /すべてのニュース/ }),
    ).toHaveAttribute("href", "/news");
  });

  it("newsItems=[] (flag OFF / fetch失敗時) は旧ハードコード表示", async () => {
    const { default: AboutContentReloaded } = await import("./AboutContent");
    renderWithIntl(<AboutContentReloaded newsItems={[]} locale="ja" />);
    expect(
      screen.getByText(/クラウドファンディング/),
    ).toBeInTheDocument();
  });

  it("eyecatch がある記事は画像を表示する", async () => {
    const { default: AboutContentReloaded } = await import("./AboutContent");
    const items = [
      {
        id: "n0",
        slug: "s0",
        title: "アイキャッチあり記事",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        publishedAt: "2026-04-01T00:00:00.000Z",
        locale: "ja" as const,
        category: ["notice"] as ("notice" | "media" | "event" | "campaign")[],
        excerpt: "抜粋",
        displayMode: "html" as const,
        bodyHtml: "<p>本文</p>",
        body: "",
        eyecatch: {
          url: "https://images.microcms-assets.io/test.jpg",
          width: 1600,
          height: 900,
        },
      },
    ];
    const { container } = renderWithIntl(
      <AboutContentReloaded newsItems={items} locale="ja" />,
    );
    const imgs = Array.from(container.querySelectorAll("img"));
    const eyecatchImg = imgs.find((el) =>
      (el.getAttribute("src") ?? "").includes("test.jpg"),
    );
    expect(eyecatchImg).toBeDefined();
  });

  it("eyecatch がない記事はプレースホルダーを表示する", async () => {
    const { default: AboutContentReloaded } = await import("./AboutContent");
    const items = [
      {
        id: "n1",
        slug: "s1",
        title: "アイキャッチなし記事",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        publishedAt: "2026-04-01T00:00:00.000Z",
        locale: "ja" as const,
        category: ["notice"] as ("notice" | "media" | "event" | "campaign")[],
        excerpt: "抜粋",
        displayMode: "html" as const,
        bodyHtml: "<p>本文</p>",
        body: "",
      },
    ];
    renderWithIntl(<AboutContentReloaded newsItems={items} locale="ja" />);
    expect(
      screen.getByTestId("about-news-placeholder"),
    ).toBeInTheDocument();
  });

  it("ニュースアイテム全体が記事詳細へのリンクになっている", async () => {
    const { default: AboutContentReloaded } = await import("./AboutContent");
    const items = [
      {
        id: "n2",
        slug: "my-slug",
        title: "クリック可能ニュース",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        publishedAt: "2026-04-01T00:00:00.000Z",
        locale: "ja" as const,
        category: ["notice"] as ("notice" | "media" | "event" | "campaign")[],
        excerpt: "抜粋",
        displayMode: "html" as const,
        bodyHtml: "<p>本文</p>",
        body: "",
      },
    ];
    renderWithIntl(<AboutContentReloaded newsItems={items} locale="ja" />);
    const link = screen.getByRole("link", { name: /クリック可能ニュース/ });
    expect(link).toHaveAttribute("href", "/news/my-slug");
  });
});
