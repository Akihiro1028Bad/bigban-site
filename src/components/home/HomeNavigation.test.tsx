import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import HomeNavigation from "./HomeNavigation";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

let mockPathname = "/";
const mockPush = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, onClick, ...props }: Record<string, unknown>) => (
    <a href={href as string} onClick={onClick as React.MouseEventHandler} {...props}>{children as React.ReactNode}</a>
  ),
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/hooks/useActiveSection", () => ({
  useActiveSection: () => "concept",
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...rest}
        data-fill={fill ? "true" : undefined}
        data-priority={priority ? "true" : undefined}
      />
    );
  },
}));

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const NAV_ITEMS = [
  { label: "CONCEPT", href: "/#concept" },
  { label: "FACILITY", href: "/#facility" },
  { label: "SERVICES", href: "/#services" },
  { label: "HYROX", href: "/hyrox" },
  { label: "PRICING", href: "/#pricing" },
  { label: "NEWS", href: "/news" },
  { label: "ABOUT", href: "/about" },
  { label: "ACCESS", href: "/#access" },
];

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("HomeNavigation", () => {
  beforeEach(() => {
    // デフォルトでポップアップを非表示にし、既存テストとの競合を防ぐ
    sessionStorage.setItem("bigban-crowdfunding-dismissed", "true");
    trackCtaClick.mockClear();
  });

  it("ロゴ画像を表示する", () => {
    renderWithIntl(<HomeNavigation />);
    const logo = screen.getByAltText("THE PICKLE BANG THEORY");
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/logos/yoko-neon.png");
  });

  it("ロゴが1つだけ表示される", () => {
    renderWithIntl(<HomeNavigation />);
    const logos = screen.getAllByAltText("THE PICKLE BANG THEORY");
    expect(logos).toHaveLength(1);
  });

  it("8つのデスクトップナビリンクと正しいhrefを表示する", () => {
    renderWithIntl(<HomeNavigation />);
    const nav = screen.getByRole("navigation", { name: "メインナビゲーション" });
    for (const item of NAV_ITEMS) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", item.href);
      expect(nav).toContainElement(link);
    }
  });

  it("NEWSリンクがPRICINGとABOUTの間に配置される", () => {
    renderWithIntl(<HomeNavigation />);
    const nav = screen.getByRole("navigation", { name: "メインナビゲーション" });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    const pricingIdx = hrefs.indexOf("/#pricing");
    const newsIdx = hrefs.indexOf("/news");
    const aboutIdx = hrefs.indexOf("/about");
    expect(pricingIdx).toBeGreaterThanOrEqual(0);
    expect(newsIdx).toBe(pricingIdx + 1);
    expect(aboutIdx).toBe(newsIdx + 1);
  });

  it("ナビに HYROX ページリンクがある", () => {
    renderWithIntl(<HomeNavigation />);
    const links = screen.getAllByRole("link", { name: "HYROX" });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "/hyrox");
  });

  it("HYROXリンクがSERVICESとPRICINGの間に配置される", () => {
    renderWithIntl(<HomeNavigation />);
    const nav = screen.getByRole("navigation", { name: "メインナビゲーション" });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    const servicesIdx = hrefs.indexOf("/#services");
    const hyroxIdx = hrefs.indexOf("/hyrox");
    const pricingIdx = hrefs.indexOf("/#pricing");
    expect(servicesIdx).toBeGreaterThanOrEqual(0);
    expect(hyroxIdx).toBe(servicesIdx + 1);
    expect(pricingIdx).toBe(hyroxIdx + 1);
  });

  it("モバイルメニュー内にもNEWSリンクが含まれる", () => {
    renderWithIntl(<HomeNavigation />);
    fireEvent.click(screen.getByLabelText("メニューを開く"));
    const dialog = screen.getByRole("dialog");
    const newsLink = dialog.querySelector("a[href='/news']");
    expect(newsLink).toBeInTheDocument();
    expect(newsLink?.textContent).toContain("NEWS");
  });

  it("既定(showColumns 未指定)ではCOLUMNリンクを出さない (USE_CMS_COLUMNS=false と同時デプロイ前)", () => {
    renderWithIntl(<HomeNavigation />);
    expect(screen.queryByRole("link", { name: "コラム" })).not.toBeInTheDocument();
  });

  it("showColumns=true でNEWS直後のヘッダーとモバイルメニューにCOLUMN／コラムを表示する", () => {
    renderWithIntl(<HomeNavigation showColumns />);
    const nav = screen.getByRole("navigation", { name: "メインナビゲーション" });
    const columnLink = within(nav).getByRole("link", { name: "COLUMN" });
    expect(columnLink).toHaveAttribute("href", "/columns");
    expect(columnLink).toHaveTextContent("コラム");
    expect(nav).toContainElement(columnLink);
    const links = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    const newsIndex = links.findIndex((text) => text?.includes("NEWS"));
    const columnsIndex = links.findIndex((text) => text?.includes("COLUMN"));
    expect(columnsIndex).toBe(newsIndex + 1);

    fireEvent.click(screen.getByLabelText("メニューを開く"));
    const dialog = screen.getByRole("dialog");
    const mobileColumnLink = within(dialog).getByRole("link", {
      name: "COLUMN",
    });
    expect(mobileColumnLink).toHaveAttribute("href", "/columns");
    expect(mobileColumnLink).toHaveTextContent("コラム");
  });

  it("COLUMN表示時もタブレット幅ではモバイル導線を維持し、xlからデスクトップナビを表示する", () => {
    renderWithIntl(<HomeNavigation showColumns />);

    const nav = screen.getByRole("navigation", {
      name: "メインナビゲーション",
    });
    expect(nav.className).toContain("hidden");
    expect(nav.className).toContain("xl:flex");
    expect(nav.className).not.toContain("md:flex");

    const reserveLinks = screen.getAllByRole("link", { name: /RESERVE/ });
    const mobileReserve = reserveLinks.find((link) =>
      link.className.includes("xl:hidden"),
    );
    expect(mobileReserve).toBeDefined();

    const desktopReserve = reserveLinks.find((link) =>
      link.parentElement?.className.includes("xl:flex"),
    );
    expect(desktopReserve).toBeDefined();

    const menuToggle = screen.getByLabelText("メニューを開く");
    expect(menuToggle.className).toContain("xl:hidden");
  });

  it("英語ロケールでは COLUMN ラベル", () => {
    renderWithIntl(<HomeNavigation showColumns />, "en");
    const columnLink = screen.getByRole("link", { name: "COLUMN" });
    expect(columnLink).toHaveAttribute("href", "/columns");
  });

  it("アクティブセクション(concept)をハイライトする", () => {
    renderWithIntl(<HomeNavigation />);
    const conceptLink = screen.getByRole("link", { name: "CONCEPT" });
    expect(conceptLink.className).toContain("text-accent");

    const facilityLink = screen.getByRole("link", { name: "FACILITY" });
    expect(facilityLink.className).not.toContain("text-accent");
  });

  it("ENクリックでrouter.pushが呼ばれる", () => {
    mockPush.mockClear();
    renderWithIntl(<HomeNavigation />);
    const enButtons = screen.getAllByRole("button", { name: "EN" });

    fireEvent.click(enButtons[0]);

    expect(mockPush).toHaveBeenCalledWith("/", { locale: "en" });
  });

  it("JPクリック（既にja）ではrouter.pushは呼ばれない", () => {
    mockPush.mockClear();
    renderWithIntl(<HomeNavigation />);
    const jpButtons = screen.getAllByRole("button", { name: "JP" });

    fireEvent.click(jpButtons[0]);

    expect(mockPush).not.toHaveBeenCalled();
  });

  // JSDOMではCSSホバー状態をシミュレートできないため、className直接チェックで代替
  it("非選択の言語ボタンに hover:text-accent と cursor-pointer が適用されている", () => {
    renderWithIntl(<HomeNavigation />);
    const enButtons = screen.getAllByRole("button", { name: "EN" });
    expect(enButtons[0].className).toContain("hover:text-accent");
    expect(enButtons[0].className).toContain("motion-safe:transition-colors");
    expect(enButtons[0].className).toContain("cursor-pointer");
  });

  it("選択中の言語ボタンに hover:text-accent が適用されず cursor-default である", () => {
    renderWithIntl(<HomeNavigation />);
    const jpButtons = screen.getAllByRole("button", { name: "JP" });
    expect(jpButtons[0].className).not.toContain("hover:text-accent");
    expect(jpButtons[0].className).toContain("cursor-default");
  });

  // EN選択時の逆パターン
  it("ENが選択中のとき、JPボタンに hover:text-accent と cursor-pointer が適用される", () => {
    renderWithIntl(<HomeNavigation />, "en");
    const jpButtons = screen.getAllByRole("button", { name: "JP" });
    expect(jpButtons[0].className).toContain("hover:text-accent");
    expect(jpButtons[0].className).toContain("cursor-pointer");

    const enButtons = screen.getAllByRole("button", { name: "EN" });
    expect(enButtons[0].className).not.toContain("hover:text-accent");
    expect(enButtons[0].className).toContain("cursor-default");
  });

  it("RESERVEボタンを表示する（予約案内ページ /reserve）", () => {
    renderWithIntl(<HomeNavigation />);
    const reserveLinks = screen.getAllByRole("link", { name: /RESERVE/ });
    expect(reserveLinks.length).toBeGreaterThanOrEqual(1);
    expect(reserveLinks[0]).toHaveAttribute("href", "/reserve");
    expect(reserveLinks[0]).not.toHaveAttribute("target", "_blank");
  });

  it("/hyrox でも RESERVE は予約案内ページ(/reserve)へ向く", () => {
    mockPathname = "/hyrox";
    renderWithIntl(<HomeNavigation />);
    const reserveLinks = screen.getAllByRole("link", { name: /RESERVE/ });
    expect(reserveLinks[0]).toHaveAttribute("href", "/reserve");
    mockPathname = "/";
  });

  it("モバイルヘッダーに常時表示の予約ボタンがある（メニュー未展開時）", () => {
    renderWithIntl(<HomeNavigation />);
    // メニュー未展開でもデスクトップ／モバイル両方の予約導線が存在する
    const reserveLinks = screen.getAllByRole("link", { name: /RESERVE/ });
    expect(reserveLinks.length).toBeGreaterThanOrEqual(2);
    const mobileReserve = reserveLinks.find((link) =>
      link.className.includes("xl:hidden")
    );
    expect(mobileReserve).toBeDefined();
    expect(mobileReserve).toHaveAttribute("href", "/reserve");
  });

  it("予約ボタンクリックを配置別に reserve_entry_click として計測する", () => {
    renderWithIntl(<HomeNavigation />);
    const reserveLinks = screen.getAllByRole("link", { name: /RESERVE/ });
    const [mobileReserve, desktopReserve] = reserveLinks;

    fireEvent.click(mobileReserve);
    fireEvent.click(desktopReserve);

    expect(trackCtaClick).toHaveBeenNthCalledWith(
      1,
      "reserveEntry",
      "home_nav_mobile",
      "予約",
    );
    expect(trackCtaClick).toHaveBeenNthCalledWith(
      2,
      "reserveEntry",
      "home_nav_desktop",
      "予約",
    );
  });

  it("ハンバーガーメニューの開閉", () => {
    renderWithIntl(<HomeNavigation />);

    const openButton = screen.getByLabelText("メニューを開く");
    expect(openButton).toBeInTheDocument();
    fireEvent.click(openButton);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const closeButton = screen.getByLabelText("メニューを閉じる");
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("背景（オーバーレイ）クリックでモバイルメニューが閉じる", () => {
    renderWithIntl(<HomeNavigation />);
    fireEvent.click(screen.getByLabelText("メニューを開く"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("HYROXページではメニュートグルが上部(top-2.5)に配置される", () => {
    mockPathname = "/hyrox";
    renderWithIntl(<HomeNavigation />);
    const toggle = screen.getByLabelText("メニューを開く");
    expect(toggle.className).toContain("top-2.5");
    mockPathname = "/";
  });

  it("HYROXページでスクロールダウンするとヘッダーが隠れる", () => {
    mockPathname = "/hyrox";
    renderWithIntl(<HomeNavigation />);
    const header = screen.getByRole("banner");
    Object.defineProperty(window, "scrollY", { value: 200, writable: true });
    fireEvent.scroll(window);
    expect(header.className).toContain("xl:-translate-y-full");
    mockPathname = "/";
  });

  it("モバイルメニューのナビリンククリックで自動クローズ", () => {
    renderWithIntl(<HomeNavigation />);

    fireEvent.click(screen.getByLabelText("メニューを開く"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    const mobileLinks = dialog.querySelectorAll("a");
    expect(mobileLinks.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(mobileLinks[0]);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("固定配置である", () => {
    renderWithIntl(<HomeNavigation />);
    const header = screen.getByRole("banner");
    expect(header).toBeInTheDocument();
    expect(header.className).toContain("fixed");
  });

  it("スクロールダウンでナビが非表示になる", () => {
    renderWithIntl(<HomeNavigation />);
    const header = screen.getByRole("banner");

    expect(header.className).toContain("translate-y-0");

    Object.defineProperty(window, "scrollY", { value: 200, writable: true });
    fireEvent.scroll(window);
    expect(header.className).toMatch(/xl:-translate-y-\[calc\(100%\+var\(--promo-banner-h\)\)\]/);
  });

  it("スクロールアップでナビが再表示される", () => {
    renderWithIntl(<HomeNavigation />);
    const header = screen.getByRole("banner");

    Object.defineProperty(window, "scrollY", { value: 200, writable: true });
    fireEvent.scroll(window);
    expect(header.className).toMatch(/xl:-translate-y-\[calc\(100%\+var\(--promo-banner-h\)\)\]/);

    Object.defineProperty(window, "scrollY", { value: 100, writable: true });
    fireEvent.scroll(window);
    expect(header.className).toContain("translate-y-0");
  });

  it("スクロール位置が100px未満ではナビが表示される", () => {
    renderWithIntl(<HomeNavigation />);
    const header = screen.getByRole("banner");

    Object.defineProperty(window, "scrollY", { value: 50, writable: true });
    fireEvent.scroll(window);
    expect(header.className).toContain("translate-y-0");
  });

  it("スクロールダウン時もモバイルでは常にtranslate-y-0を保持する (iOS Safari バグ回避)", () => {
    renderWithIntl(<HomeNavigation />);
    const header = screen.getByRole("banner");

    Object.defineProperty(window, "scrollY", { value: 200, writable: true });
    fireEvent.scroll(window);

    expect(header.className).toContain("translate-y-0");
    expect(header.className).toMatch(/xl:-translate-y-\[calc\(100%\+var\(--promo-banner-h\)\)\]/);
    expect(header.className).not.toMatch(/(?<!xl:)(?<!:)-translate-y-\[/);
  });

  it("ホームでロゴクリックするとページ最上部にスクロールする", () => {
    mockPathname = "/";
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderWithIntl(<HomeNavigation />);
    const logo = screen.getByAltText("THE PICKLE BANG THEORY");
    fireEvent.click(logo);
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    scrollSpy.mockRestore();
  });

  it("他ページでロゴクリックしてもscrollToは呼ばれない", () => {
    mockPathname = "/about";
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderWithIntl(<HomeNavigation />);
    const logo = screen.getByAltText("THE PICKLE BANG THEORY");
    fireEvent.click(logo);
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
    mockPathname = "/";
  });

  it("モバイルメニュー内にRESERVEボタンがある", () => {
    renderWithIntl(<HomeNavigation />);
    fireEvent.click(screen.getByLabelText("メニューを開く"));
    const dialog = screen.getByRole("dialog");
    const reserveInDialog = dialog.querySelector(
      "a[href='/reserve']",
    );
    expect(reserveInDialog).toBeInTheDocument();
    expect(reserveInDialog?.textContent).toContain("RESERVE");
  });

  it("英語ロケールでaria-labelが英語になる", () => {
    renderWithIntl(<HomeNavigation />, "en");
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    expect(nav).toBeInTheDocument();
  });

  it("sessionStorage未設定時でもスクロール前はポップアップが非表示", () => {
    sessionStorage.removeItem("bigban-crowdfunding-dismissed");
    renderWithIntl(<HomeNavigation />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
