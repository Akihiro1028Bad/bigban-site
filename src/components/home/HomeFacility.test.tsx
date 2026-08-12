import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";
import HomeFacility from "./HomeFacility";

import type React from "react";
import type { ReactElement } from "react";

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

function renderJa(ui: ReactElement = <HomeFacility />) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

/** メッセージのリッチテキストタグ（strong / nb）を除いた、描画される本文を得る。 */
function plainText(message: string): string {
  return message.replace(/<\/?(?:strong|nb)>/g, "");
}

describe("HomeFacility", () => {
  describe("セクションの器", () => {
    it('セクションID "facility" を持つ（ナビのアンカーを継承する）', () => {
      renderJa();
      expect(document.getElementById("facility")).toBeInTheDocument();
    });

    it("bg-deep-black 背景クラスを持つ", () => {
      renderJa();
      expect(document.getElementById("facility")?.className).toContain(
        "bg-deep-black"
      );
    });

    it("章の縦リズム py-16 lg:py-24 を持つ（主要セクション共通）", () => {
      renderJa();
      const className = document.getElementById("facility")?.className ?? "";
      expect(className).toContain("py-16");
      expect(className).toContain("lg:py-24");
    });

    it("大見出し FACILITY / 施設・設備 は描画しない", () => {
      renderJa();
      // このセクションの冒頭は自己紹介文（「THE PICKLE BANG THEORY は…」）。
      // その直前に施設名を名乗る大見出しを置くと同じことを二度言うことになり、
      // ヒーロー直後に巨大タイポが二連発する。章の始まりは静かな印で示す。
      expect(screen.queryByText("FACILITY")).not.toBeInTheDocument();
      expect(screen.queryByText("施設・設備")).not.toBeInTheDocument();
    });
  });

  describe("静かな章開き", () => {
    it("章ラベル「施設について」を唯一の h2 として置く", () => {
      const { container } = renderJa();
      const headings2 = Array.from(container.querySelectorAll("h2"));
      expect(headings2).toHaveLength(1);
      expect(headings2[0]?.textContent).toBe("施設について");
    });

    it("章ラベルは極小のトーンで、大見出しの級数は使わない", () => {
      const { container } = renderJa();
      const label = container.querySelector("h2");
      const classes = label?.className.split(/\s+/) ?? [];
      // 施設概要の英字キッカーと同じ極小トーン。和文なのでトラッキングは一段緩める。
      expect(classes).toContain("text-[10px]");
      expect(classes).toContain("tracking-[0.2em]");
      expect(classes).toContain("text-text-gray");
      // 旧・大見出しのセリフ体巨大タイポは持ち込まない。
      expect(label?.className).not.toContain("font-serif");
      expect(label?.className).not.toContain("text-5xl");
    });

    it("章ラベルの直後に短いヘアラインを置く", () => {
      const { container } = renderJa();
      const hairline = container.querySelector("h2 + div");
      const classes = hairline?.className.split(/\s+/) ?? [];
      expect(classes).toContain("h-px");
      expect(classes).toContain("w-10");
    });

    it("章開きに黄色のアクセントバーを置かない", () => {
      const { container } = renderJa();
      // bg-accent の帯は大見出しの付属物だった意匠。静かな章開きには持ち込まない。
      const filled = Array.from(container.querySelectorAll("div")).filter(
        (el) => el.className.split(/\s+/).includes("bg-accent")
      );
      expect(filled).toHaveLength(0);
    });

    it("章ラベル(h2)配下にゾーン・施設概要の h3 が続く", () => {
      const { container } = renderJa();
      const headings = Array.from(container.querySelectorAll("h2, h3"));
      expect(headings[0]?.tagName).toBe("H2");
      expect(headings.slice(1).map((h) => h.tagName)).toEqual([
        "H3",
        "H3",
        "H3",
      ]);
    });
  });

  // #380 の検索スニペット対策で入れたリード文を、統合後もそのまま本文として残す。
  describe("リード文プローズ（旧 HomeLead）", () => {
    it("施設を説明するデッキ（第1文）を本文として表示する", () => {
      renderJa();
      const section = document.getElementById("facility");
      expect(section?.textContent).toContain(
        plainText(jaMessages.HomeLead.deck)
      );
    });

    it("meta description を裏付ける確定情報を含む", () => {
      renderJa();
      const body = plainText(
        `${jaMessages.HomeLead.deck}${jaMessages.HomeLead.body}${jaMessages.HomeLead.bodyHyrox}`
      );
      // 検索スニペット対策として、description と同じ事実が本文側にあることを担保する。
      for (const fact of [
        "本八幡駅",
        "徒歩1分",
        "DecoTurf",
        "6:00",
        "23:00",
        "HYROX",
      ]) {
        expect(body).toContain(fact);
      }
      const section = document.getElementById("facility");
      expect(section?.textContent).toContain(body);
    });

    it("ブランド名を strong 要素で強調する", () => {
      renderJa();
      const strong = document.querySelector("#facility strong");
      expect(strong?.textContent).toContain("THE PICKLE BANG THEORY");
    });

    it("デッキ・本文・HYROX の説明をそれぞれ別の段落で表示する", () => {
      const { container } = renderJa();
      const paragraphs = Array.from(container.querySelectorAll("p"));
      const deckParagraph = paragraphs.find((p) =>
        p.textContent?.includes(plainText(jaMessages.HomeLead.deck))
      );
      const bodyParagraph = paragraphs.find((p) =>
        p.textContent?.includes(plainText(jaMessages.HomeLead.body))
      );
      const hyroxParagraph = paragraphs.find((p) =>
        p.textContent?.includes(plainText(jaMessages.HomeLead.bodyHyrox))
      );
      expect(deckParagraph).toBeDefined();
      expect(bodyParagraph).toBeDefined();
      expect(hyroxParagraph).toBeDefined();
      expect(deckParagraph).not.toBe(bodyParagraph);
      expect(bodyParagraph).not.toBe(hyroxParagraph);
    });

    it("縦書きスパインは描画しない（章ラベルが役目を引き継いだため）", () => {
      renderJa();
      // 単独セクションだった頃の縦書きスパイン「施設について」は、
      // 章開きの水平ラベル(h2)+ヘアラインに置き換わった。縦書きは残さない。
      expect(
        document.querySelector('#facility [style*="vertical-rl"]')
      ).toBeNull();
    });

    it("本文・HYROX 段落の nb タグを折り返し禁止スパンとして描画する", () => {
      const { container } = renderJa();
      const nowrapTexts = Array.from(
        container.querySelectorAll("span.whitespace-nowrap")
      ).map((span) => span.textContent);

      // 実測で語中分断が起きた語だけを nb で守っている（表示テキストは変えない）。
      // 統合でスパインが外れて本文幅が広がったため、旧レイアウト向けの粒度から
      // 組み直した（「千葉県/市川市」「ハードコート3/面」「天気や季/節」が割れていた）。
      for (const phrase of [
        "ザ ピックルバン セオリー",
        "千葉県市川市",
        "ハードコート3面を、",
        "早朝6:00から",
        "天気や季節に",
        "プレーできます。",
        "トレーニングエリア",
      ]) {
        expect(nowrapTexts).toContain(phrase);
      }
    });

    it("隠しテキストにしない（読める本文として描画する）", () => {
      renderJa();
      const section = document.getElementById("facility");
      expect(section?.className).not.toContain("hidden");
      expect(section?.className).not.toContain("sr-only");
    });

    it("キッカーは描画しない（セクション見出し FACILITY と重複するため）", () => {
      renderJa();
      expect(
        screen.queryByText(jaMessages.HomeLead.kicker)
      ).not.toBeInTheDocument();
    });

    it("デモ案Lのリード1文は重複するので描画しない", () => {
      renderJa();
      expect(
        screen.queryByText(/世界基準のピックルボールコートと、HYROX対応/)
      ).not.toBeInTheDocument();
    });
  });

  describe("ツインゾーン", () => {
    it("コートとトレーニングエリアを同レベルの見出しで並べる", () => {
      renderJa();
      expect(screen.getByText("PICKLEBALL COURT")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: "ピックルボールコート" })
      ).toBeInTheDocument();
      expect(screen.getByText("HYROX TRAINING AREA")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", {
          level: 3,
          name: "HYROXトレーニングエリア",
        })
      ).toBeInTheDocument();
    });

    it("各ゾーンの説明文を表示する", () => {
      const { container } = renderJa();
      // nb タグで囲った語が span に分かれるため、テキスト全体で突き合わせる。
      const text = container.textContent ?? "";
      expect(text).toContain(
        plainText(jaMessages.HomeFacility.zones.court.description)
      );
      expect(text).toContain(
        plainText(jaMessages.HomeFacility.zones.training.description)
      );
    });

    it("ゾーン説明の nb タグを折り返し禁止スパンとして描画する", () => {
      const { container } = renderJa();
      const nowrapTexts = Array.from(
        container.querySelectorAll("span.whitespace-nowrap")
      ).map((span) => span.textContent);

      // 実測(360〜1440px)で語中分断が起きた語だけを守っている。
      for (const phrase of [
        "ピックルボール大会",
        "グランドスラム",
        "DecoTurf(デコターフ)",
        "ショーコート",
        "トレーニングエリア",
        "コンディショニング",
      ]) {
        expect(nowrapTexts).toContain(phrase);
      }
    });

    it("コート全景とトレーニングエリアの実写を1枚ずつ表示する", () => {
      renderJa();
      expect(
        screen.getByAltText(jaMessages.HomeFacility.zones.court.imageAlt)
      ).toHaveAttribute("src", expect.stringContaining("facility.webp"));
      expect(
        screen.getByAltText(jaMessages.HomeFacility.zones.training.imageAlt)
      ).toHaveAttribute("src", expect.stringContaining("facility-4.jpg"));
    });

    it("プレースホルダー画像を使わない", () => {
      renderJa();
      const srcs = Array.from(document.querySelectorAll("img")).map(
        (img) => img.getAttribute("src") ?? ""
      );
      expect(srcs.some((src) => src.includes("comingsoon"))).toBe(false);
    });

    it("HYROX ゾーンから /hyrox へリンクする", () => {
      renderJa();
      const link = screen.getByRole("link", {
        name: /HYROXエリアについて詳しく見る/,
      });
      expect(link).toHaveAttribute("href", "/hyrox");
    });

    it("HYROX リンククリックを content_click として計測する", () => {
      trackCtaClick.mockClear();
      renderJa();

      fireEvent.click(
        screen.getByRole("link", { name: /HYROXエリアについて詳しく見る/ })
      );

      expect(trackCtaClick).toHaveBeenCalledWith(
        "contentClick",
        "home_facility_hyrox",
        "hyrox"
      );
    });
  });

  describe("施設概要表", () => {
    it("見出しと6行の項目を表示する", () => {
      const { container } = renderJa();
      expect(screen.getByText("INFORMATION")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: "施設概要" })
      ).toBeInTheDocument();

      const rows = container.querySelectorAll("dl > div");
      expect(rows).toHaveLength(6);
    });

    it("確定済みの施設情報だけを並べる", () => {
      const { container } = renderJa();
      const pairs = Array.from(container.querySelectorAll("dl > div")).map(
        (row) => [
          row.querySelector("dt")?.textContent,
          row.querySelector("dd")?.textContent,
        ]
      );

      expect(pairs).toEqual([
        ["営業時間", "6:00–23:00"],
        ["アクセス", "本八幡駅 徒歩1分"],
        ["環境", "全天候型インドア・空調完備"],
        ["設備", "ラウンジスペース / 男女別更衣室 / 自動販売機"],
        [
          "レンタル",
          "パドル 1本 ¥500(1コートにつき6本まで)。シューズの貸出はありません。",
        ],
        ["チェックイン", "無人対応"],
      ]);
    });
  });

  describe("予約導線", () => {
    it("セクション末尾に予約導線を表示する", () => {
      renderJa();
      const link = screen.getByRole("link", { name: /コートを予約する/ });
      expect(link).toHaveAttribute("href", "/reserve?tab=pickleball");
    });

    it("予約導線は枠線ボタンで、主要CTAのベタ塗りとは階層を分ける", () => {
      renderJa();
      const classes = screen
        .getByRole("link", { name: /コートを予約する/ })
        .className.split(/\s+/);
      // ヒーロー・ナビ・SERVICES・PRICING のベタ塗りは主要CTA専用に温存し、
      // ここは枠線でその一段下に置く。テキストリンクでは弱すぎた
      // （統合でこのセクションがヒーロー直後の最初の章になったため）。
      expect(classes).toContain("border-accent");
      expect(classes).toContain("text-accent");
      expect(classes).not.toContain("bg-accent");
    });

    it("予約リンククリックを reserve_entry として計測する", () => {
      trackCtaClick.mockClear();
      renderJa();

      fireEvent.click(screen.getByRole("link", { name: /コートを予約する/ }));

      expect(trackCtaClick).toHaveBeenCalledWith(
        "reserveEntry",
        "home_facility_reserve",
        "コートを予約する"
      );
    });
  });

  describe("英語ロケール", () => {
    it("英語メッセージで描画する", () => {
      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <HomeFacility />
        </NextIntlClientProvider>
      );

      const section = document.getElementById("facility");
      expect(section?.textContent).toContain(
        plainText(enMessages.HomeLead.deck)
      );
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: enMessages.HomeFacility.sectionLabel,
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", {
          level: 3,
          name: enMessages.HomeFacility.zones.court.titleJa,
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", {
          level: 3,
          name: enMessages.HomeFacility.info.heading,
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: new RegExp(enMessages.HomeFacility.reserveCta),
        })
      ).toBeInTheDocument();
    });
  });
});
