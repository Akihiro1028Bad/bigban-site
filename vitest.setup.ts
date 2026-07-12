import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import {
  createElement,
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

interface MockLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: ReactNode;
}

vi.mock("@/i18n/navigation", () => {
  const Link = forwardRef<HTMLAnchorElement, MockLinkProps>(
    ({ children, href, ...props }, ref) =>
      createElement("a", { ...props, href, ref }, children),
  );
  Link.displayName = "MockIntlLink";

  return {
    Link,
    redirect: vi.fn(),
    usePathname: () => "/",
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    getPathname: ({ href }: { href: string }) => href,
  };
});

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
  // jsdom はスクロールAPIを未実装のため no-op でスタブする。
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

  // jsdom には ResizeObserver が存在しないため no-op モックを定義する。
  // DevicePreview 等がマウント時に生成し、未定義だと passive effect 内で
  // ReferenceError を投げてテストワーカーが連鎖失敗するため、グローバルに補う。
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverMock {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  }
}

// jsdom環境だけデフォルト実装へ戻し、呼び出し履歴をクリアする。
afterEach(() => {
  if (hasWindow) {
    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation(matchMediaImpl);
    (window.scrollTo as ReturnType<typeof vi.fn>).mockClear?.();
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear?.();
  }
});
