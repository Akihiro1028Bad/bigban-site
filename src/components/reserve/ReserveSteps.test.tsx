import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveSteps from "./ReserveSteps";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

const mockScrollTo = vi.fn();
const mockSelectedScrollSnap = vi.fn(() => 0);
const mockOn = vi.fn();
const mockOff = vi.fn();

const mockEmblaApi = {
  scrollTo: mockScrollTo,
  selectedScrollSnap: mockSelectedScrollSnap,
  on: mockOn,
  off: mockOff,
};

let returnApi: typeof mockEmblaApi | null = mockEmblaApi;

vi.mock("embla-carousel-react", () => ({
  default: () => [vi.fn(), returnApi],
}));

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ReserveSteps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedScrollSnap.mockReturnValue(0);
    returnApi = mockEmblaApi;
  });

  it("3つのステップを順序付きリストで表示する", () => {
    renderWithIntl(<ReserveSteps />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(screen.getByText("日時を選ぶ")).toBeInTheDocument();
    expect(screen.getByText("予約内容を入力")).toBeInTheDocument();
    expect(screen.getByText("予約完了（決済）")).toBeInTheDocument();
  });

  it("ステップ一覧（ol）に予約の流れを示す aria-label を付与する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(screen.getByRole("list", { name: "予約の流れ" })).toBeInTheDocument();
  });

  it("各ステップに連番（01・02・03）を表示する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("ステップ01は操作デモ動画を表示する", () => {
    const { container } = renderWithIntl(<ReserveSteps />);
    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute(
      "aria-label",
      "予約カレンダーで日時を選ぶ操作画面",
    );
  });

  it("ステップ02・03はスクリーンショット画像を alt 付きで表示する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(screen.getByAltText("ご予約内容の確認画面")).toBeInTheDocument();
    expect(screen.getByAltText("予約完了の画面")).toBeInTheDocument();
  });

  it("モバイル用のスワイプ誘導とドット（3つ）を表示する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(screen.getByText("← スワイプで確認 →")).toBeInTheDocument();
    const dots = screen.getAllByRole("button", { name: /ステップ/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-current", "true");
    expect(dots[1]).toHaveAttribute("aria-current", "false");
  });

  it("ドットクリックで該当ステップへ scrollTo する", () => {
    renderWithIntl(<ReserveSteps />);
    const dots = screen.getAllByRole("button", { name: /ステップ/ });
    fireEvent.click(dots[2]);
    expect(mockScrollTo).toHaveBeenCalledWith(2);
  });

  it("select イベントを登録し、コールバックでアクティブドットを更新する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(mockOn).toHaveBeenCalledWith("select", expect.any(Function));
    const cb = mockOn.mock.calls.find((c) => c[0] === "select")?.[1] as
      | (() => void)
      | undefined;
    expect(cb).toBeDefined();
    mockSelectedScrollSnap.mockReturnValue(1);
    act(() => cb!());
    const dots = screen.getAllByRole("button", { name: /ステップ/ });
    expect(dots[1]).toHaveAttribute("aria-current", "true");
  });

  it("emblaApi が null の時は scrollTo も select 登録も行わない", () => {
    returnApi = null;
    renderWithIntl(<ReserveSteps />);
    const dots = screen.getAllByRole("button", { name: /ステップ/ });
    fireEvent.click(dots[1]);
    expect(mockScrollTo).not.toHaveBeenCalled();
    expect(mockOn).not.toHaveBeenCalled();
  });
});
