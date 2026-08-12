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

describe("HomeServices の縦リズム", () => {
  it("内側コンテナが章の縦リズム py-16 lg:py-24 を持つ（主要セクション共通）", () => {
    renderJa();
    const inner = document
      .getElementById("services")
      ?.querySelector(".max-w-7xl");
    expect(inner?.className).toContain("py-16");
    expect(inner?.className).toContain("lg:py-24");
  });
});

/** 折り返し制御タグ（nb）を除いた、実際に描画される文字列を得る。 */
function plainText(message: string): string {
  return message.replace(/<\/?nb>/g, "");
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
    // グループ見出しは h3、商品名は h4。カード見出しにも "HYROX" の文字列が
    // 現れるため、レベルで特定する。
    expect(
      screen.getByRole("heading", { level: 3, name: "PICKLEBALL" })
    ).toBeInTheDocument();
    expect(screen.getByText("ピックルボール")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "HYROX" })
    ).toBeInTheDocument();
    expect(screen.getByText("ハイロックス")).toBeInTheDocument();
  });

  it("予約できる4商品をカードとして表示する", () => {
    renderJa();
    const titles = [
      plainText(jaMessages.HomeServices.courtRental.titleJa),
      plainText(jaMessages.HomeServices.pickleEvent.titleJa),
      plainText(jaMessages.HomeServices.hyroxArea.titleJa),
      plainText(jaMessages.HomeServices.hyroxClass.titleJa),
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
      plainText(enMessages.HomeServices.courtRental.titleJa),
      plainText(enMessages.HomeServices.pickleEvent.titleJa),
      plainText(enMessages.HomeServices.hyroxArea.titleJa),
      plainText(enMessages.HomeServices.hyroxClass.titleJa),
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

    expect(hrefOf(plainText(jaMessages.HomeServices.courtRental.titleJa))).toBe(
      "/reserve?tab=pickleball"
    );
    expect(hrefOf(plainText(jaMessages.HomeServices.hyroxArea.titleJa))).toBe(
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
    await clickCta(plainText(m.courtRental.titleJa));
    await clickCta(plainText(m.pickleEvent.titleJa));
    await clickCta(plainText(m.hyroxArea.titleJa));
    await clickCta(plainText(m.hyroxClass.titleJa));

    // location は GA4 の集計軸。既存の home_services_court は継続性のため改名しない。
    expect(trackCtaClick.mock.calls).toEqual([
      ["reserveEntry", "home_services_court", m.courtRental.cta],
      ["reserveEntry", "home_services_pickle_event", m.pickleEvent.cta],
      ["reserveEntry", "home_services_hyrox_area", m.hyroxArea.cta],
      ["reserveEntry", "home_services_hyrox_lesson", m.hyroxClass.cta],
    ]);
  });

  it("カード見出しに break-keep を付けない（iOS Safari で見出しが切れる）", () => {
    renderJa();
    // iOS Safari は word-break: keep-all のとき「・」で改行しない。
    // 「オープンプレー・練習会・体験会・大会」が 1 行のまま 329px に伸び、
    // カードの overflow-hidden に切り取られて「大会」が欠けた（本番で発生）。
    // 折り返し位置は nb（whitespace-nowrap）で制御し、break-keep には頼らない。
    for (const heading of document.querySelectorAll("[data-service-card] h4")) {
      expect(heading.className).not.toContain("break-keep");
    }
  });

  it("カード見出しの語をnbで囲み、語中での分断を防ぐ", () => {
    const { container } = renderJa();
    const nowrapTexts = Array.from(
      container.querySelectorAll("[data-service-card] h4 span.whitespace-nowrap")
    ).map((span) => span.textContent);

    // 中黒は span の外に置き、そこだけが改行機会になる。
    // 最長の nb は「オープンプレー」(7文字) で、320px でも 1 行に収まる。
    for (const phrase of ["オープンプレー", "練習会", "体験会", "大会"]) {
      expect(nowrapTexts).toContain(phrase);
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

/** issue #404: 320px で見出しが枠(272px)を超えないよう、sm 未満だけ流体サイズにする。 */
const FLUID_SECTION_HEADING = "text-[clamp(2rem,22vw_-_34.5px,3rem)]";

describe("HomeServices の見出し級数", () => {
  it("sm 未満は固定の text-5xl ではなく下限付きの流体サイズを使う", () => {
    renderJa();
    const heading = screen.getByRole("heading", { level: 2, name: "SERVICES" });
    const classes = heading.className.split(/\s+/);

    expect(classes).not.toContain("text-5xl");
    expect(classes).toContain(FLUID_SECTION_HEADING);
    expect(classes).toContain("leading-none");
    expect(classes).toContain("sm:text-6xl");
    expect(classes).toContain("lg:text-7xl");
  });
});
