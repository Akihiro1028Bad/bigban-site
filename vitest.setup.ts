import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";

// node 環境テスト(scripts 配下など)では window が存在しないため、
// jsdom 環境のときだけ matchMedia のモックを設定する。
const hasWindow = typeof window !== "undefined";

const matchMediaImpl = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

if (hasWindow) {
  // jsdom には window.matchMedia が存在しないためデフォルトモックを定義
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(matchMediaImpl),
  });
}

// 各テスト後に window.matchMedia をデフォルト実装にリセット
afterEach(() => {
  if (hasWindow) {
    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation(
      matchMediaImpl
    );
  }
});
