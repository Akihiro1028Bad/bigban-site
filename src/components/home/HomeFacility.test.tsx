import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { setMockUseInView } from "../../../__mocks__/framer-motion";
import jaMessages from "../../../messages/ja.json";
import HomeFacility from "./HomeFacility";

import type React from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

const { mockAutoplay } = vi.hoisted(() => ({ mockAutoplay: vi.fn() }));

const mockScrollTo = vi.fn();
const mockScrollPrev = vi.fn();
const mockScrollNext = vi.fn();
const mockSelectedScrollSnap = vi.fn(() => 0);
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockPlay = vi.fn();
const mockStop = vi.fn();

const mockEmblaApi = {
  scrollTo: mockScrollTo,
  scrollPrev: mockScrollPrev,
  scrollNext: mockScrollNext,
  selectedScrollSnap: mockSelectedScrollSnap,
  on: mockOn,
  off: mockOff,
  plugins: () => ({
    autoplay: { play: mockPlay, stop: mockStop },
  }),
};

let returnApi: typeof mockEmblaApi | null = mockEmblaApi;

vi.mock("embla-carousel-react", () => ({
  default: () => [vi.fn(), returnApi],
}));

vi.mock("embla-carousel-autoplay", () => ({
  default: (opts: unknown) => {
    mockAutoplay(opts);
    return { name: "autoplay" };
  },
}));

describe("HomeFacility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedScrollSnap.mockReturnValue(0);
    returnApi = mockEmblaApi;
    setMockUseInView(false);
  });

  it('セクションID "facility" を持つ', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("facility");
    expect(section).toBeInTheDocument();
  });

  it("キーナンバーを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("COURTS")).toBeInTheDocument();
    expect(screen.getByText("6:00–23:00")).toBeInTheDocument();
    expect(screen.getByText("HOURS")).toBeInTheDocument();
    expect(screen.getByText("1 min")).toBeInTheDocument();
    expect(screen.getByText("FROM STATION")).toBeInTheDocument();
  });

  it("Primary Specsを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("SURFACE")).toBeInTheDocument();
    expect(screen.getByText("ハードコート DecoTurf（デコターフ）")).toBeInTheDocument();
    expect(screen.getByText("TYPE")).toBeInTheDocument();
    expect(screen.getByText("全天候型インドア")).toBeInTheDocument();
  });

  it("DecoTurf説明文を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(/DecoTurf（デコターフ）は、世界最大級のピックルボール大会/)
    ).toBeInTheDocument();
  });

  it("全設備項目を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("トレーニングエリア")).toBeInTheDocument();
    expect(screen.getByText("ラウンジスペース")).toBeInTheDocument();
    expect(screen.getByText("男女別更衣室")).toBeInTheDocument();
    expect(screen.getByText("空調完備")).toBeInTheDocument();
    expect(screen.getByText("自動販売機")).toBeInTheDocument();
    expect(screen.getByText("レンタル用具あり")).toBeInTheDocument();
    expect(screen.getByText("無人チェックイン対応")).toBeInTheDocument();
    expect(screen.getByText("ショーコート1面に変更可能")).toBeInTheDocument();
  });

  it("ラウンジスペースに準備中の注記を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const notes = screen.getAllByText("準備中");
    expect(notes).toHaveLength(1);
  });

  it("trainingArea 機能が /hyrox へリンクしている", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const link = screen.getByRole("link", { name: /トレーニングエリア/ });
    expect(link).toHaveAttribute("href", "/hyrox");
  });

  it("trainingArea リンククリックを content_click として計測する", () => {
    trackCtaClick.mockClear();
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole("link", { name: /トレーニングエリア/ }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_facility_hyrox",
      "hyrox",
    );
  });

  it("カルーセルにプレースホルダー画像を使わない", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const srcs = Array.from(document.querySelectorAll("img")).map(
      (img) => img.getAttribute("src") ?? ""
    );
    expect(srcs.some((src) => src.includes("comingsoon"))).toBe(false);
  });

  it("コート全景と加工済みトレーニング全景の2枚を表示する", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByAltText("プロ仕様DecoTurfピックルボールコート")
    ).toHaveAttribute("src", expect.stringContaining("rental.webp"));
    expect(
      screen.getByAltText("ピックルボールコートに併設されたトレーニングエリア")
    ).toHaveAttribute(
      "src",
      expect.stringContaining("facility-1-enhanced.webp")
    );
    expect(
      container.querySelectorAll('[aria-roledescription="slide"]')
    ).toHaveLength(2);
  });

  it("FACILITY タイトルを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("FACILITY")).toBeInTheDocument();
  });

  it("日本語サブタイトル「施設・設備」を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("施設・設備")).toBeInTheDocument();
  });

  it("bg-deep-black 背景クラスを持つ", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("facility");
    expect(section?.className).toContain("bg-deep-black");
  });

  it("カルーセルのドットインジケーターを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const dots = screen.getAllByRole("button", { name: /画像.*を表示/ });
    expect(dots).toHaveLength(2);
  });

  it("全施設画像をレンダリングする", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const images = screen.getAllByRole("img");
    expect(images.length).toBeGreaterThanOrEqual(2);
  });

  it("ドットクリックでscrollToが呼ばれる", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const dots = screen.getAllByRole("button", { name: /画像.*を表示/ });
    fireEvent.click(dots[1]);
    expect(mockScrollTo).toHaveBeenCalledWith(1);
  });

  it("emblaApiのselectイベントを登録する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(mockOn).toHaveBeenCalledWith("select", expect.any(Function));
  });

  it("selectコールバックでselectedScrollSnapを呼ぶ", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const selectCall = mockOn.mock.calls.find(
      (call) => call[0] === "select"
    );
    const selectCallback = selectCall?.[1] as (() => void) | undefined;
    expect(selectCallback).toBeDefined();
    mockSelectedScrollSnap.mockReturnValue(2);
    act(() => {
      selectCallback!();
    });
    expect(mockSelectedScrollSnap).toHaveBeenCalled();
  });

  it("前の画像ボタンでscrollPrevが呼ばれる", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const prevBtn = screen.getByRole("button", { name: "前の画像" });
    fireEvent.click(prevBtn);
    expect(mockScrollPrev).toHaveBeenCalled();
  });

  it("次の画像ボタンでscrollNextが呼ばれる", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const nextBtn = screen.getByRole("button", { name: "次の画像" });
    fireEvent.click(nextBtn);
    expect(mockScrollNext).toHaveBeenCalled();
  });

  it("emblaApiがnullの時にscrollToが何もしない", () => {
    returnApi = null;
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    const dots = screen.getAllByRole("button", { name: /画像.*を表示/ });
    fireEvent.click(dots[1]);
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("emblaApiがnullの時に矢印ボタンが何もしない", () => {
    returnApi = null;
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "前の画像" }));
    fireEvent.click(screen.getByRole("button", { name: "次の画像" }));
    expect(mockScrollPrev).not.toHaveBeenCalled();
    expect(mockScrollNext).not.toHaveBeenCalled();
  });

  it("emblaApiがnullの時にイベント登録しない", () => {
    returnApi = null;
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(mockOn).not.toHaveBeenCalled();
  });

  it("AutoplayにplayOnInit: falseを渡す", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(mockAutoplay).toHaveBeenCalledWith(
      expect.objectContaining({ playOnInit: false })
    );
  });

  it("ビューポートに入った時にautoplay.play()を呼ぶ", () => {
    setMockUseInView(false);
    const { rerender } = render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(mockPlay).not.toHaveBeenCalled();

    setMockUseInView(true);
    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(mockPlay).toHaveBeenCalled();
  });

  it("ビューポートから出た時にautoplay.stop()を呼ぶ", () => {
    setMockUseInView(true);
    const { rerender } = render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    mockStop.mockClear();

    setMockUseInView(false);
    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(mockStop).toHaveBeenCalled();
  });

  it("emblaApiがnullの時はautoplayを操作しない", () => {
    returnApi = null;
    setMockUseInView(false);
    const { rerender } = render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    setMockUseInView(true);
    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFacility />
      </NextIntlClientProvider>
    );
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });
});
