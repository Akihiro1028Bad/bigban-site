import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";
import HomeServices from "./HomeServices";

import type React from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

function renderJa() {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <HomeServices />
    </NextIntlClientProvider>
  );
}

describe("HomeServices", () => {
  it('セクションID "services" を持つ', () => {
    renderJa();
    expect(document.getElementById("services")).toBeInTheDocument();
  });

  it("SERVICESタイトルと日本語サブタイトルを表示する", () => {
    renderJa();
    expect(screen.getByText("SERVICES")).toBeInTheDocument();
    expect(screen.getByText("サービス・プラン")).toBeInTheDocument();
  });

  it("ピックルボール / HYROX の2グループ見出しを表示する", () => {
    renderJa();
    expect(screen.getByText("PICKLEBALL")).toBeInTheDocument();
    expect(screen.getByText("ピックルボール")).toBeInTheDocument();
    expect(screen.getByText("HYROX")).toBeInTheDocument();
    expect(screen.getByText("ハイロックス")).toBeInTheDocument();
  });

  it("予約できる4商品をカードとして表示する", () => {
    renderJa();
    const titles = [
      jaMessages.HomeServices.courtRental.titleJa,
      jaMessages.HomeServices.pickleEvent.titleJa,
      jaMessages.HomeServices.hyroxArea.titleJa,
      jaMessages.HomeServices.hyroxClass.titleJa,
    ];
    for (const title of titles) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // 4枚ちょうど。増減したらグリッドの対称性が崩れるため固定する。
    expect(document.querySelectorAll("[data-service-card]")).toHaveLength(4);
  });

  it("英語ロケールでも4商品を表示する", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    const titles = [
      enMessages.HomeServices.courtRental.titleJa,
      enMessages.HomeServices.pickleEvent.titleJa,
      enMessages.HomeServices.hyroxArea.titleJa,
      enMessages.HomeServices.hyroxClass.titleJa,
    ];
    for (const title of titles) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("全カードのCTAが予約案内ページ(/reserve)への内部リンクである", () => {
    renderJa();
    const ctas = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("[data-service-cta]")
    );
    expect(ctas).toHaveLength(4);
    for (const cta of ctas) {
      expect(cta.getAttribute("href")).toMatch(/^\/reserve(\?|$)/);
      // 予約導線は /reserve に集約する。外部予約システムへ直リンクしない。
      expect(cta).not.toHaveAttribute("target", "_blank");
    }
  });

  it("枠貸しの2カードは予約カレンダーの初期タブを指定する", () => {
    renderJa();
    const hrefOf = (title: string) =>
      screen
        .getByRole("heading", { name: title })
        .closest("[data-service-card]")
        ?.querySelector("[data-service-cta]")
        ?.getAttribute("href");

    expect(hrefOf(jaMessages.HomeServices.courtRental.titleJa)).toBe(
      "/reserve?tab=pickleball"
    );
    expect(hrefOf(jaMessages.HomeServices.hyroxArea.titleJa)).toBe(
      "/reserve?tab=hyrox"
    );
  });

  it("CTAクリックを商品別に reserveEntry として計測する", async () => {
    trackCtaClick.mockClear();
    renderJa();

    const clickCta = async (title: string) => {
      const cta = screen
        .getByRole("heading", { name: title })
        .closest("[data-service-card]")
        ?.querySelector("[data-service-cta]");
      cta?.addEventListener("click", (event) => event.preventDefault());
      await userEvent.click(cta as Element);
    };

    const m = jaMessages.HomeServices;
    await clickCta(m.courtRental.titleJa);
    await clickCta(m.pickleEvent.titleJa);
    await clickCta(m.hyroxArea.titleJa);
    await clickCta(m.hyroxClass.titleJa);

    // location は GA4 の集計軸。既存の home_services_court は継続性のため改名しない。
    expect(trackCtaClick.mock.calls).toEqual([
      ["reserveEntry", "home_services_court", m.courtRental.cta],
      ["reserveEntry", "home_services_pickle_event", m.pickleEvent.cta],
      ["reserveEntry", "home_services_hyrox_area", m.hyroxArea.cta],
      ["reserveEntry", "home_services_hyrox_lesson", m.hyroxClass.cta],
    ]);
  });

  it("カード見出しを語中で分断させない", () => {
    renderJa();
    // jsdom はレイアウトを持たないため、折り返し制御の指定自体を担保する。
    // 実測（320〜1440px）では「オープンプレー・/練習会・体験会・大会」と
    // 中黒で折り返し、2行の長さも揃う。
    for (const heading of document.querySelectorAll("[data-service-card] h4")) {
      expect(heading.className).toContain("break-keep");
      expect(heading.className).toContain("text-balance");
    }
  });

  it("グループごとに導入文を表示する", () => {
    renderJa();
    // 未経験者が「まず何をすればいいか」を、カードを読む前に掴めるようにする。
    expect(
      screen.getByText(jaMessages.HomeServices.pickleballLead)
    ).toBeInTheDocument();
    expect(
      screen.getByText(jaMessages.HomeServices.hyroxLead)
    ).toBeInTheDocument();
  });

  it("導入文に break-keep を付けない（モバイルで横スクロールが出る）", () => {
    renderJa();
    const leads = Array.from(
      document.querySelectorAll<HTMLElement>("#services p.text-balance")
    );
    expect(leads.length).toBeGreaterThan(0);
    for (const lead of leads) {
      // 句読点のない長い文節（「ランと8種目の…フィットネスレース。」＝実測385px）が
      // 折り返せず、390px 未満で文書幅がビューポートを超える。
      // 短い見出し（中黒区切り）とは違い、散文に break-keep は使えない。
      expect(lead.className).not.toContain("break-keep");
    }
  });

  it("ピックルの導入文で初心者の入口が体験会・練習会だと示す", () => {
    renderJa();
    const lead = jaMessages.HomeServices.pickleballLead;
    // 一人でコートを借りても相手がいない。最初の一歩を取り違えさせない。
    expect(lead).toContain("はじめて");
    expect(lead).toContain("体験会");
  });

  it("HYROXの導入文でHYROXが何かを説明する", () => {
    renderJa();
    // 撤去した HomeHyroxPromo が担っていた未認知層への説明を引き継ぐ。
    expect(jaMessages.HomeServices.hyroxLead).toContain("フィットネスレース");
  });

  it("解説ボタンをHYROXカード2枚より後ろに置く", () => {
    renderJa();
    const link = screen.getByRole("link", {
      name: jaMessages.HomeServices.hyroxAbout,
    });
    const cards = document.querySelectorAll("[data-service-card]");
    const lastHyroxCard = cards[cards.length - 1];
    expect(
      lastHyroxCard.compareDocumentPosition(link) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("HYROXグループの見出しから /hyrox への解説リンクを出す", () => {
    renderJa();
    const link = screen.getByRole("link", {
      name: jaMessages.HomeServices.hyroxAbout,
    });
    expect(link).toHaveAttribute("href", "/hyrox");
    expect(link).not.toHaveAttribute("target", "_blank");
  });

  it("解説リンクのクリックを home_hyrox_promo として計測する", async () => {
    trackCtaClick.mockClear();
    renderJa();
    const link = screen.getByRole("link", {
      name: jaMessages.HomeServices.hyroxAbout,
    });
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    // 撤去した HomeHyroxPromo の location を引き継ぎ、GA4 の系列を切らずに
    // 「フルワイドカード → 一行リンク」の効果を比較できるようにする。
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_hyrox_promo",
      "hyrox"
    );
  });

  it("解説リンクは枠線ボタンで、予約CTAのベタ塗りとは階層を分ける", () => {
    renderJa();
    const link = screen.getByRole("link", {
      name: jaMessages.HomeServices.hyroxAbout,
    });
    const classes = link.className.split(/\s+/);
    // 枠線+アクセント文字。ベタ塗り(bg-accent)は予約CTA専用に温存し、
    // 「知る」導線が「予約する」導線と同じ重みに見えないようにする。
    expect(classes).toContain("border-accent");
    expect(classes).toContain("text-accent");
    expect(classes).not.toContain("bg-accent");
  });

  it("解説リンクはHYROXグループにだけ置く", () => {
    renderJa();
    // ピックル側は予約導線のみ。/hyrox への内部リンクは1本だけに保つ。
    expect(document.querySelectorAll('#services a[href="/hyrox"]')).toHaveLength(
      1
    );
  });

  it("持ち物の注記を表示し、「手ぶら」とは案内しない", () => {
    renderJa();
    const section = document.getElementById("services");
    // レンタルシューズが無いため「手ぶらでOK」は事実に反する。
    expect(section?.textContent).not.toContain("手ぶら");
    expect(screen.getByText(/レンタルパドル 1本 ¥500/)).toBeInTheDocument();
    expect(screen.getByText(/ノーマーキングソール/)).toBeInTheDocument();
  });

  it("一人でも参加できることを明示する", () => {
    renderJa();
    expect(document.getElementById("services")?.textContent).toContain(
      "一人"
    );
  });

  it("提供していない商品を掲載しない", () => {
    renderJa();
    const text = document.getElementById("services")?.textContent ?? "";
    // 「強化プログラム」は予約可能な商品として存在せず、大会は開催実績がない。
    for (const removed of ["強化プログラム", "大会 & リーグ", "賞金付き"]) {
      expect(text).not.toContain(removed);
    }
  });

  it("セクション全体を一枚の帯として描画する", () => {
    renderJa();
    const section = document.getElementById("services");
    // off-white トークンの実体は #0a0a1a。純黒の前後セクションからわずかに浮かせて
    // 章の切れ目を作るための帯であり、行ごとの明暗交互には戻さない。
    expect(section?.className).toContain("bg-off-white");
    expect(section?.className).toContain("text-text-light");
    expect(document.querySelectorAll("[data-service-row]")).toHaveLength(0);
  });
});
