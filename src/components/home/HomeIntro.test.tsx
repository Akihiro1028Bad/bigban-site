import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import HomeIntro from "./HomeIntro";

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

const LOGO_ALT = "THE PICKLE BANG THEORY";
const mockSessionStorage: Record<string, string> = {};

function setReducedMotion(matches: boolean) {
  (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation(
    (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.documentElement.className = "";
  Object.keys(mockSessionStorage).forEach(
    (key) => delete mockSessionStorage[key]
  );
  Object.defineProperty(window, "sessionStorage", {
    value: {
      getItem: (key: string) => mockSessionStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockSessionStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockSessionStorage[key];
      },
    },
    writable: true,
  });
});

describe("HomeIntro", () => {
  it("初回アクセス時にマウント直後からロゴを表示する", () => {
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(screen.getByAltText(LOGO_ALT)).toBeInTheDocument();
    expect(screen.getByTestId("home-content")).toBeInTheDocument();
  });

  it("ワープ演出の canvas は描画しない", () => {
    const { container } = render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("sessionStorageにフラグがある場合はイントロをスキップする", () => {
    mockSessionStorage["bigban-intro-played"] = "true";
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(screen.queryByAltText(LOGO_ALT)).not.toBeInTheDocument();
    expect(screen.getByTestId("home-content")).toBeInTheDocument();
  });

  it("prefers-reduced-motion: reduce ではイントロを表示しない", () => {
    setReducedMotion(true);
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(screen.queryByAltText(LOGO_ALT)).not.toBeInTheDocument();
    expect(screen.getByTestId("home-content")).toBeInTheDocument();
  });

  it("マウント時にsessionStorageへフラグを保存する", () => {
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(mockSessionStorage["bigban-intro-played"]).toBe("true");
  });

  it("イントロをスキップするときはsessionStorageへ書き込まない", () => {
    // セッション途中で reduced-motion を解除したユーザーに
    // イントロが出なくなるのを防ぐ。
    setReducedMotion(true);
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(mockSessionStorage["bigban-intro-played"]).toBeUndefined();
  });

  it("LOGO_HOLD_MS (800ms) 経過でイントロが unmount される", () => {
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.queryByAltText(LOGO_ALT)).not.toBeInTheDocument();
    expect(screen.getByTestId("home-content")).toBeInTheDocument();
  });

  it("FALLBACK_UNMOUNT_MS (3000ms) を過ぎてもイントロは畳まれたままになる", () => {
    // hold timer と重複する保険。二重に isIntroComplete を立てても
    // 表示が戻らないことを確認する。
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByAltText(LOGO_ALT)).not.toBeInTheDocument();
  });

  it("イントロ再生中に unmount すると hold timer を片付ける (cleanup 分岐のカバレッジ)", () => {
    // 主目的は cleanup 分岐を通してカバレッジ 100% を保つこと。
    // clearTimeout の呼び出しは「cleanup が実際に走った」ことの smoke check で、
    // リークしないこと自体を証明するものではない (unmount 後の setState は
    // React 18 以降そもそも警告を出さないため、挙動として観測できない)。
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    clearSpy.mockClear();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("childrenを常に表示する", () => {
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(screen.getByTestId("home-content")).toBeInTheDocument();
  });

  it("マウント時にintro-pendingクラスを解除する", () => {
    document.documentElement.classList.add("intro-pending");
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(
      document.documentElement.classList.contains("intro-pending")
    ).toBe(false);
  });

  it("sessionStorageアクセスエラー時はイントロをスキップする", () => {
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(screen.queryByAltText(LOGO_ALT)).not.toBeInTheDocument();
    expect(screen.getByTestId("home-content")).toBeInTheDocument();
  });
});
