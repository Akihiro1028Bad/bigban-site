import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import jaMessages from "../../../messages/ja.json";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxNextRace from "./HyroxNextRace";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

const jst = (iso: string): number => new Date(`${iso}+09:00`).getTime();
const OCT_1 = jst("2026-10-01T09:00:00");

describe("HyroxNextRace", () => {
  beforeEach(() => {
    trackCtaClick.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(OCT_1);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("見出し・大会名・開催地・日程・残り日数・本文を表示する", () => {
    renderWithIntl(<HyroxNextRace initialNowMs={OCT_1} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "NEXT RACE 次のHYROX大会" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BYD HYROX Osaka")).toBeInTheDocument();
    expect(screen.getByText("大阪・インテックス大阪")).toBeInTheDocument();
    expect(screen.getByText("2027年1月21日(木)～25日(月)")).toBeInTheDocument();
    expect(screen.getByText("開催まで あと 112 日")).toBeInTheDocument();
    expect(screen.getByText(/HYROX公式8種目に対応した/)).toBeInTheDocument();
  });

  it("販売状況の注記だけを載せ、チケット状況は断定しない", () => {
    renderWithIntl(<HyroxNextRace initialNowMs={OCT_1} />);
    expect(
      screen.getByText("日程・販売状況は HYROX 公式サイトの発表をご確認ください。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/完売|SOLD OUT|購入可/)).not.toBeInTheDocument();
  });

  it("ボタンは同ページの料金セクション(#program)へ誘導し、クリックを計測する", async () => {
    vi.useRealTimers();
    renderWithIntl(<HyroxNextRace initialNowMs={OCT_1} />);
    const cta = screen.getByRole("link", { name: "練習エリアの料金を見る" });
    expect(cta).toHaveAttribute("href", "#program");
    await userEvent.click(cta);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_next_race",
      "program",
    );
  });

  it("公式ページへの外部リンクは別タブ・noopener で開く", () => {
    renderWithIntl(<HyroxNextRace initialNowMs={OCT_1} />);
    const link = screen.getByRole("link", { name: "大会の公式ページ(HYROX)" });
    expect(link).toHaveAttribute(
      "href",
      "https://hyrox.com/event/byd-hyrox-osaka/",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("開催中は「開催中」を表示する", () => {
    const during = jst("2027-01-22T10:00:00");
    vi.setSystemTime(during);
    renderWithIntl(<HyroxNextRace initialNowMs={during} />);
    expect(screen.getByText("開催中")).toBeInTheDocument();
    expect(screen.queryByText(/あと/)).not.toBeInTheDocument();
  });

  it("全大会が終わったら何も描画しない", () => {
    const after = jst("2027-05-01T10:00:00");
    vi.setSystemTime(after);
    const { container } = renderWithIntl(<HyroxNextRace initialNowMs={after} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("マウント後に現在時刻へ更新する(静的 HTML の古い時刻を直す)", () => {
    // サーバーが渡した時刻は大阪の前、実際の「いま」は大阪終了後 → 名古屋に切り替わる
    vi.setSystemTime(jst("2027-02-01T10:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={OCT_1} />);
    expect(screen.queryByText("BYD HYROX Osaka")).not.toBeInTheDocument();
    expect(screen.getByText("HYROX Nagoya")).toBeInTheDocument();
    expect(screen.getByText("名古屋・ポートメッセなごや")).toBeInTheDocument();
  });

  it("en: 英語の日程・残り日数・ボタンを表示する", () => {
    renderWithIntl(<HyroxNextRace initialNowMs={OCT_1} />, { locale: "en" });
    expect(
      screen.getByText("Thu, Jan 21 – Mon, Jan 25, 2027"),
    ).toBeInTheDocument();
    expect(screen.getByText("112 days to go")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See area rental rates" }),
    ).toBeInTheDocument();
  });

  it("en: 残り1日は単数形で表示する", () => {
    const eve = jst("2027-01-20T10:00:00");
    vi.setSystemTime(eve);
    renderWithIntl(<HyroxNextRace initialNowMs={eve} />, { locale: "en" });
    expect(screen.getByText("1 day to go")).toBeInTheDocument();
  });

  it("サーバー描画(静的 HTML)は渡された initialNowMs で大会を選ぶ", () => {
    // ブラウザの「いま」が名古屋の時期でも、サーバー描画は渡された時刻(大阪の前)に従う
    vi.setSystemTime(jst("2027-02-01T10:00:00"));
    const html = renderToString(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HyroxNextRace initialNowMs={OCT_1} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("BYD HYROX Osaka");
    expect(html).not.toContain("HYROX Nagoya");
  });
});
