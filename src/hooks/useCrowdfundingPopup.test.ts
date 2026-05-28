import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCrowdfundingPopup } from "./useCrowdfundingPopup";
import * as promoSchedule from "@/lib/promoSchedule";

const SESSION_KEY = "bigban-crowdfunding-dismissed";

let observerCallback: IntersectionObserverCallback;
let mockObserve: ReturnType<typeof vi.fn>;
let mockDisconnect: ReturnType<typeof vi.fn>;

function setupIntersectionObserver() {
  mockObserve = vi.fn();
  mockDisconnect = vi.fn();

  class MockIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
    observe = mockObserve;
    unobserve = vi.fn();
    disconnect = mockDisconnect;
    root = null;
    rootMargin = "";
    thresholds = [] as number[];
    takeRecords = vi.fn();
  }

  global.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

function triggerServicesVisible() {
  observerCallback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

describe("useCrowdfundingPopup", () => {
  let mockStorage: Record<string, string>;
  let servicesSection: HTMLElement;

  beforeEach(() => {
    mockStorage = {};
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
      },
      writable: true,
    });
    setupIntersectionObserver();
    // 既定は6月前 (クラファン実施中) を想定。各テストで必要に応じて上書きする。
    vi.spyOn(promoSchedule, "isJunePromoActive").mockReturnValue(false);

    servicesSection = document.createElement("section");
    servicesSection.id = "services";
    document.body.appendChild(servicesSection);
  });

  afterEach(() => {
    servicesSection.remove();
    vi.restoreAllMocks();
  });

  it("初回訪問時でも SERVICES セクション到達前は isOpen が false", () => {
    const { result } = renderHook(() => useCrowdfundingPopup());
    expect(result.current.isOpen).toBe(false);
  });

  it("SERVICES セクションが画面に入った瞬間に isOpen が true になる", () => {
    const { result } = renderHook(() => useCrowdfundingPopup());
    expect(result.current.isOpen).toBe(false);

    act(() => {
      triggerServicesVisible();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("SERVICES がまだ画面外 (isIntersecting=false) なら isOpen は false のまま", () => {
    const { result } = renderHook(() => useCrowdfundingPopup());
    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(result.current.isOpen).toBe(false);
  });

  it("一度トリガーされると observer は disconnect され二度発火しない", () => {
    const { result } = renderHook(() => useCrowdfundingPopup());

    act(() => {
      triggerServicesVisible();
    });
    expect(result.current.isOpen).toBe(true);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("sessionStorage 設定済みの場合は observer を仕掛けない", () => {
    mockStorage[SESSION_KEY] = "true";
    renderHook(() => useCrowdfundingPopup());
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it("closePopup で isOpen が false になり sessionStorage に書き込む", () => {
    const { result } = renderHook(() => useCrowdfundingPopup());

    act(() => {
      triggerServicesVisible();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.closePopup();
    });

    expect(result.current.isOpen).toBe(false);
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      SESSION_KEY,
      "true",
    );
  });

  it("sessionStorage アクセスエラー時でも SERVICES 到達で表示される", () => {
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: vi.fn(() => {
          throw new Error("Access denied");
        }),
        setItem: vi.fn(() => {
          throw new Error("Access denied");
        }),
      },
      writable: true,
    });

    const { result } = renderHook(() => useCrowdfundingPopup());
    expect(result.current.isOpen).toBe(false);

    act(() => {
      triggerServicesVisible();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("sessionStorage 書き込みエラー時も closePopup が正常に動作する", () => {
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error("Access denied");
        }),
      },
      writable: true,
    });

    const { result } = renderHook(() => useCrowdfundingPopup());

    act(() => {
      triggerServicesVisible();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.closePopup();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it("SERVICES セクションが存在しない場合もエラーにならない", () => {
    servicesSection.remove();
    const { result } = renderHook(() => useCrowdfundingPopup());
    expect(result.current.isOpen).toBe(false);
  });

  it("JST 6/1以降 (クラファン終了後) は SERVICES 到達でも observer を仕掛けず isOpen は false のまま", () => {
    vi.spyOn(promoSchedule, "isJunePromoActive").mockReturnValue(true);

    const { result } = renderHook(() => useCrowdfundingPopup());
    expect(mockObserve).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });
});
