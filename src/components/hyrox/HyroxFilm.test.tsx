import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxFilm from "./HyroxFilm";

let observerCallback: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

function fireIntersection(isIntersecting: boolean) {
  observerCallback(
    [{ isIntersecting } as IntersectionObserverEntry],
    {} as IntersectionObserver
  );
}

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi
    .fn()
    .mockResolvedValue(undefined as unknown as void);
  HTMLMediaElement.prototype.pause = vi.fn();
  observe.mockClear();
  disconnect.mockClear();
  global.IntersectionObserver = vi.fn(function (
    this: IntersectionObserver,
    cb: IntersectionObserverCallback
  ) {
    observerCallback = cb;
    this.observe = observe;
    this.disconnect = disconnect;
    this.unobserve = vi.fn();
    this.takeRecords = vi.fn();
    return this;
  }) as unknown as typeof IntersectionObserver;
});

describe("HyroxFilm", () => {
  it("アイブロウのみ表示し、タイトル表記は出さない", () => {
    renderWithIntl(<HyroxFilm />);
    expect(screen.getByText(/OFFICIAL FILM/)).toBeInTheDocument();
    expect(screen.queryByText("INSIDE THE ARENA")).not.toBeInTheDocument();
    expect(screen.queryByText("大会のリアルを、映像で。")).not.toBeInTheDocument();
  });

  it("動画はミュート・ループ・コントロール非表示で、自動再生属性は付けない", () => {
    const { container } = renderWithIntl(<HyroxFilm />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.muted).toBe(true);
    expect(video!.loop).toBe(true);
    expect(video!.controls).toBe(false);
    expect(video!.autoplay).toBe(false);
    expect(video!.preload).toBe("none");
  });

  it("ビューポートに入ると再生し、外れると停止する", () => {
    const { container } = renderWithIntl(<HyroxFilm />);
    expect(observe).toHaveBeenCalledWith(container.querySelector("video"));

    fireIntersection(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    fireIntersection(false);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("prefers-reduced-motion では自動再生せず監視も行わない", () => {
    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation(
      (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })
    );
    renderWithIntl(<HyroxFilm />);
    expect(observe).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
