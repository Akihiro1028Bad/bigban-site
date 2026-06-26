import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";

// jsdom には window.matchMedia が存在しないためデフォルトモックを定義
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom は scrollTo / scrollIntoView を未実装で「Not implemented」警告を出すため no-op でスタブ
Object.defineProperty(window, "scrollTo", {
  writable: true,
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(Element.prototype, "scrollIntoView", {
  writable: true,
  configurable: true,
  value: vi.fn(),
});

// 各テスト後に window.matchMedia をデフォルト実装にリセットし、スクロール系スタブの呼び出し履歴をクリア
afterEach(() => {
  (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  (window.scrollTo as ReturnType<typeof vi.fn>).mockClear?.();
  (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear?.();
});
