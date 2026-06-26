import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  setMockUseInView,
  setMockReducedMotion,
} from "../../../__mocks__/framer-motion";
import jaMessages from "../../../messages/ja.json";
import HyroxFacility from "./HyroxFacility";

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
  plugins: () => ({ autoplay: { play: mockPlay, stop: mockStop } }),
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

function renderFacility() {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <HyroxFacility />
    </NextIntlClientProvider>
  );
}

describe("HyroxFacility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedScrollSnap.mockReturnValue(0);
    returnApi = mockEmblaApi;
    setMockUseInView(false);
    setMockReducedMotion(false);
  });

  it("FACILITY 見出しを表示する", () => {
    renderFacility();
    expect(
      screen.getByRole("heading", { name: "FACILITY" })
    ).toBeInTheDocument();
  });

  it("photos が配列でない場合も見出しを描画する（alt フォールバック）", () => {
    const brokenMessages = structuredClone(jaMessages);
    (
      brokenMessages.HyroxPage.facility as unknown as { photos: unknown }
    ).photos = "not-an-array";
    render(
      <NextIntlClientProvider locale="ja" messages={brokenMessages}>
        <HyroxFacility />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByRole("heading", { name: "FACILITY" })
    ).toBeInTheDocument();
  });

  it("施設写真3枚とドット3つを表示する", () => {
    renderFacility();
    const dots = screen.getAllByRole("button", { name: /施設写真を表示/ });
    expect(dots).toHaveLength(3);
    expect(
      screen.getByAltText(
        "スキーエルゴとローイングマシンが並ぶHYROXトレーニングエリアの走行レーン"
      )
    ).toBeInTheDocument();
  });

  it("各器具に公式ブランドバッジ（Concept2/Centr 公式）を表示する", () => {
    renderFacility();
    expect(screen.getAllByText("Concept2 公式")).toHaveLength(2);
    expect(screen.getAllByText("Centr 公式")).toHaveLength(4);
  });

  it("設置器具6点の名称・仕様・台数を一覧表示する", () => {
    renderFacility();
    expect(
      screen.getByRole("heading", { name: "設置器具" })
    ).toBeInTheDocument();
    expect(screen.getByText("スキーエルゴ")).toBeInTheDocument();
    expect(screen.getByText("ローイングマシン")).toBeInTheDocument();
    expect(screen.getByText("スレッド")).toBeInTheDocument();
    expect(screen.getByText("ケトルベル")).toBeInTheDocument();
    expect(screen.getByText("ウォールボール")).toBeInTheDocument();
    expect(screen.getByText("サンドバッグ")).toBeInTheDocument();
    // 仕様（メーカー/重量）
    expect(screen.getByText("Concept2 SkiErg")).toBeInTheDocument();
    expect(
      screen.getByText("16 / 24 / 32kg（HYROX全クラス対応）"),
    ).toBeInTheDocument();
    // 台数: ×2 が3点、一式が3点
    expect(screen.getAllByText("× 2")).toHaveLength(3);
    expect(screen.getAllByText("一式")).toHaveLength(3);
  });

  it("ドットクリックで scrollTo が呼ばれる", () => {
    renderFacility();
    const dots = screen.getAllByRole("button", { name: /施設写真を表示/ });
    fireEvent.click(dots[2]);
    expect(mockScrollTo).toHaveBeenCalledWith(2);
  });

  it("前へ/次へボタンで scrollPrev/scrollNext が呼ばれる", () => {
    renderFacility();
    fireEvent.click(screen.getByRole("button", { name: "前の写真" }));
    fireEvent.click(screen.getByRole("button", { name: "次の写真" }));
    expect(mockScrollPrev).toHaveBeenCalled();
    expect(mockScrollNext).toHaveBeenCalled();
  });

  it("select イベントを登録し、コールバックで selectedScrollSnap を呼ぶ", () => {
    renderFacility();
    expect(mockOn).toHaveBeenCalledWith("select", expect.any(Function));
    const cb = mockOn.mock.calls.find((c) => c[0] === "select")?.[1] as
      | (() => void)
      | undefined;
    expect(cb).toBeDefined();
    mockSelectedScrollSnap.mockReturnValue(1);
    act(() => cb!());
    expect(mockSelectedScrollSnap).toHaveBeenCalled();
  });

  it("Autoplay に playOnInit: false を渡す", () => {
    renderFacility();
    expect(mockAutoplay).toHaveBeenCalledWith(
      expect.objectContaining({ playOnInit: false })
    );
  });

  it("ビューポート内で autoplay.play、外で autoplay.stop を呼ぶ", () => {
    setMockUseInView(false);
    const { rerender } = renderFacility();
    expect(mockPlay).not.toHaveBeenCalled();

    setMockUseInView(true);
    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HyroxFacility />
      </NextIntlClientProvider>
    );
    expect(mockPlay).toHaveBeenCalled();

    setMockUseInView(false);
    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HyroxFacility />
      </NextIntlClientProvider>
    );
    expect(mockStop).toHaveBeenCalled();
  });

  it("prefers-reduced-motion ではビューポート内でも自動送りしない", () => {
    setMockReducedMotion(true);
    setMockUseInView(true);
    renderFacility();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalled();
  });

  it("emblaApi が null の時は各操作・登録を行わない", () => {
    returnApi = null;
    setMockUseInView(false);
    const { rerender } = renderFacility();

    const dots = screen.getAllByRole("button", { name: /施設写真を表示/ });
    fireEvent.click(dots[1]);
    fireEvent.click(screen.getByRole("button", { name: "前の写真" }));
    fireEvent.click(screen.getByRole("button", { name: "次の写真" }));

    setMockUseInView(true);
    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HyroxFacility />
      </NextIntlClientProvider>
    );

    expect(mockScrollTo).not.toHaveBeenCalled();
    expect(mockScrollPrev).not.toHaveBeenCalled();
    expect(mockScrollNext).not.toHaveBeenCalled();
    expect(mockOn).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });
});
