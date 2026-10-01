import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import ReserveCardActions from "./ReserveCardActions";

const trackCtaClick = vi.fn();
const trackLabolaEntry = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
  trackLabolaEntry: (...args: unknown[]) => trackLabolaEntry(...args),
}));

const mockNow = vi.hoisted(() => ({ value: null as Date | null }));
vi.mock("./useMountedNow", () => ({ useMountedNow: () => mockNow.value }));

const FALLBACK =
  "https://yoyaku.labola.jp/r/shop/3473/calendar_week/?&tab_name=x";
const TAB = "ピックルボールコート";
const DAY_BASE = "https://yoyaku.labola.jp/r/shop/3473/calendar";
// 2026-10-01 木曜 12:00 JST
const THURSDAY = new Date("2026-10-01T03:00:00Z");

beforeEach(() => {
  trackCtaClick.mockClear();
  trackLabolaEntry.mockClear();
  mockNow.value = null;
});

function renderCourt(locale: "ja" | "en" = "ja") {
  return renderWithIntl(
    <ReserveCardActions
      ctaLabel={locale === "ja" ? "コートの予約" : "Book a court"}
      fallbackHref={FALLBACK}
      location="reserve_choice_august"
      labolaEntryKind="rental"
      tabName={TAB}
    />,
    { locale },
  );
}

describe("ReserveCardActions", () => {
  it("マウント前は従来の URL を使い、日付ボタンは出さない", () => {
    renderCourt();
    expect(
      screen.getByRole("link", { name: /コートの予約/ }),
    ).toHaveAttribute("href", FALLBACK);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("マウント後はメインボタンが今日の1日表示になり、日付ボタンが並ぶ", () => {
    mockNow.value = THURSDAY;
    renderCourt();
    const tab = encodeURIComponent(TAB);
    expect(
      screen.getByRole("link", { name: /コートの予約/ }),
    ).toHaveAttribute("href", `${DAY_BASE}/2026/10/1/?tab_name=${tab}`);
    expect(screen.getByRole("link", { name: "今日 10/1(木)" })).toHaveAttribute(
      "href",
      `${DAY_BASE}/2026/10/1/?tab_name=${tab}`,
    );
    expect(screen.getByRole("link", { name: "明日 10/2(金)" })).toHaveAttribute(
      "href",
      `${DAY_BASE}/2026/10/2/?tab_name=${tab}`,
    );
    expect(screen.getByRole("link", { name: "土曜 10/3(土)" })).toHaveAttribute(
      "href",
      `${DAY_BASE}/2026/10/3/?tab_name=${tab}`,
    );
    expect(screen.getByRole("link", { name: "日曜 10/4(日)" })).toHaveAttribute(
      "href",
      `${DAY_BASE}/2026/10/4/?tab_name=${tab}`,
    );
    expect(
      screen.getByRole("group", { name: "日付を選んで空き状況を見る" }),
    ).toBeInTheDocument();
  });

  it("すべてのボタンが別タブで開く外部リンク(クロスドメイン計測の対象)", () => {
    mockNow.value = THURSDAY;
    renderCourt();
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("メインボタンのクリックは従来どおりの2イベントだけを送る", async () => {
    mockNow.value = THURSDAY;
    renderCourt();
    await userEvent.click(screen.getByRole("link", { name: /コートの予約/ }));
    expect(trackCtaClick).toHaveBeenCalledTimes(1);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reservation",
      "reserve_choice_august",
      "コートの予約",
    );
    expect(trackLabolaEntry).toHaveBeenCalledTimes(1);
    expect(trackLabolaEntry).toHaveBeenCalledWith("rental");
  });

  it("日付ボタンのクリックは location に日付種別を足して同じ2イベントを送る", async () => {
    mockNow.value = THURSDAY;
    renderCourt();
    await userEvent.click(screen.getByRole("link", { name: "明日 10/2(金)" }));
    expect(trackCtaClick).toHaveBeenCalledTimes(1);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reservation",
      "reserve_choice_august_date_tomorrow",
      "コートの予約",
    );
    expect(trackLabolaEntry).toHaveBeenCalledTimes(1);
    expect(trackLabolaEntry).toHaveBeenCalledWith("rental");
  });

  it("LaBOLA へ進むカードにはビジター予約の注記を出す", () => {
    renderCourt();
    expect(screen.getByText(/会員登録なしで予約できます/)).toBeInTheDocument();
  });

  it("日付指定のないカード(レッスン)は日付ボタンを出さず、1日表示にも差し替えない", () => {
    mockNow.value = THURSDAY;
    renderWithIntl(
      <ReserveCardActions
        ctaLabel="レッスンの予約"
        fallbackHref="https://example.test/school/"
        location="reserve_choice_hyrox_lesson"
        labolaEntryKind="program"
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: /レッスンの予約/ }),
    ).toHaveAttribute("href", "https://example.test/school/");
    expect(screen.getByText(/会員登録なしで予約できます/)).toBeInTheDocument();
  });

  it("LaBOLA 以外へ進むカード(イベント)は注記も日付ボタンも出さず流入イベントも送らない", async () => {
    mockNow.value = THURSDAY;
    renderWithIntl(
      <ReserveCardActions
        ctaLabel="イベントの申込"
        fallbackHref="https://example.test/events"
        location="reserve_choice_pickle_event"
      />,
    );
    expect(
      screen.queryByText(/会員登録なしで予約できます/),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /イベントの申込/ }));
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reservation",
      "reserve_choice_pickle_event",
      "イベントの申込",
    );
    expect(trackLabolaEntry).not.toHaveBeenCalled();
  });

  it("英語では日付ボタンの文言と注記が英語になる", () => {
    mockNow.value = THURSDAY;
    renderCourt("en");
    expect(screen.getByRole("link", { name: "Today 10/1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sat 10/3" })).toBeInTheDocument();
    expect(screen.getByText(/No membership needed/)).toBeInTheDocument();
  });
});
