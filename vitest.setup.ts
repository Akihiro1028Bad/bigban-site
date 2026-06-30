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

  // jsdom は HTMLElement.offsetParent を常に null 返すため、接続済み要素を
  // 可視扱いにする最小 polyfill（focus-trap の focusables() がブラウザ同様に動くように）。
  // グローバル適用なのは、useDialog を使う複数のモーダル(ShortcutOverlay 等)の
  // focus-trap テストが横断的にこれを必要とするため(個別テストスコープでは不足)。
  // ⚠️ 現状 src 全体で offsetParent を読むのは useDialog のみ(grep 確認済み)。
  // 将来 offsetParent 依存のライブラリ/コンポーネントを追加する場合は、本 polyfill が
  // それらを「可視」と誤判定しうるため、その時点で挙動を要再検討。
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(): Element | null {
      return (this as HTMLElement).parentElement;
    },
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
