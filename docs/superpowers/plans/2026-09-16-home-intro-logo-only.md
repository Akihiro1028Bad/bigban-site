# ホームのイントロをロゴのみに差し替える 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-16-home-intro-logo-only-design.md`

**Goal:** ホーム初回訪問時のイントロから StarfieldWarp の canvas 演出を外し、黒背景にロゴが浮かび上がる約1.3秒の演出だけを残す。

**Architecture:** `HomeIntro` から canvas の進行を待つ phase 管理を取り除き、マウント直後にロゴを出して `LOGO_HOLD_MS` 後に畳む形へ単純化する。イントロ中のスクロール固定を `intro-pending`(ハイドレーション前) と `intro-scroll-lock`(マウント後) の 2 段構えで入れる。`StarfieldWarpIntro` は `/teaser` が使い続けるため一切触らない。

**Tech Stack:** Next.js 16 App Router / TypeScript (strict) / Tailwind CSS v4 / Framer Motion / Vitest + React Testing Library

## Global Constraints

- 作業ディレクトリは worktree `/Users/tsutsumi.akihiro/dev/bigban/.claude/worktrees/disable-home-intro`、ブランチ `fix/disable-home-intro`。元リポジトリ `/Users/tsutsumi.akihiro/dev/bigban` には触れない。
- 各タスクでローカルコミットする。**push と PR 更新は Task 5 でのみ行う**(2026-09-16 オーナー裁定)。
- **`src/components/intro/StarfieldWarpIntro.tsx` とそのテストは変更・削除しない。** `/teaser` (`src/app/[locale]/teaser/TeaserPage.tsx:52`) が使用中。
- `src/components/teaser/types.ts` (`AnimationPhase` 型) も変更しない。`/teaser` が使い続ける。
- `src/components/PreHydrationScripts.tsx` のロジックは変更しない。コメントの「現在 OFF」という記述の修正のみ可。
- ホームのセクション順序・構成・コメントには手を入れない。既存の順序検証テスト (HomeHero → HomeLatestNews → HomeFacility → HomeConcept) がそのまま通ること。
- ロゴレイヤーの JSX (`initial={{ opacity: 0, scale: 0.9 }}` / `animate={{ opacity: 1, scale: 1 }}` / `exit={{ opacity: 0 }}` / `transition={{ duration: 0.5, ease: EASE }}` / `z-[101]` / `bg-black` / `yoko-neon.png` 360×80 `priority`) と黒背景レイヤー (`z-[100]`) は**変更しない**。
- TypeScript `strict: true`。`any` 禁止、`React.FC` 禁止、型専用 import は `import type`。boolean prop は `is` / `has` / `should` / `can` 接頭辞。
- テストカバレッジは 100% (statements / branches / functions / lines) を維持する。CI は `npx tsc --noEmit` → `npm run lint` → `npm run test:coverage` → `npm run build`。
- TDD (Red → Green) を守る。テストを先に書き、失敗を確認してから実装する。
- コミットメッセージは Conventional Commits 形式・日本語・命令形。

---

### Task 1: HomeIntro をロゴのみに作り替える

**Files:**
- Modify: `src/components/home/HomeIntro.tsx`
- Test: `src/components/home/HomeIntro.test.tsx`

**Interfaces:**
- Consumes: `EASE` (`@/constants/motion`)
- Produces: `HomeIntro` は `children` だけを受け取り、マウント直後にロゴを表示して `LOGO_HOLD_MS`(800ms) 後に畳む。`StarfieldWarpIntro` を参照しない。`prefers-reduced-motion: reduce` またはセッション再訪ではイントロを描かず `children` だけ返す。`SESSION_KEY` は `"bigban-intro-played"` のまま。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/home/HomeIntro.test.tsx` を次の内容で置き換える。canvas が無くなるため、イントロの有無はロゴ (`getByAltText("THE PICKLE BANG THEORY")`) で判定する。

```tsx
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run src/components/home/HomeIntro.test.tsx
```

期待: FAIL。現在の `HomeIntro` は `phase === "content"` になるまでロゴを描かないため、「初回アクセス時にマウント直後からロゴを表示する」が `Unable to find an element with the alt text: THE PICKLE BANG THEORY` で落ちる。「ワープ演出の canvas は描画しない」も実物の `StarfieldWarpIntro` が `<canvas>` を出して落ちる (このテストファイルからは `StarfieldWarpIntro` の mock を外している)。

- [ ] **Step 3: 最小限の実装を書く**

`src/components/home/HomeIntro.tsx` を次の内容で置き換える。

```tsx
"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

import { EASE } from "@/constants/motion";

import type { ReactNode } from "react";

const SESSION_KEY = "bigban-intro-played";
/** ハイドレーション前に main を隠す html クラス (introScript が付与する) */
const PENDING_CLASS = "intro-pending";
// ロゴ表示時間 (入場 0.5s + hold 0.3s 相当)。マウントから unmount までの遅延。
// ここから退場フェード 0.5s がかかるので、演出全体は約 1.3 秒。
const LOGO_HOLD_MS = 800;
// フェイルセーフ: hold timer が何らかの理由で畳まなかった場合の保険。
// ロゴのみの構成では hold timer と役割が重なるが、AnimatePresence の exit が
// 発火しない race に備えて残している (2026-09-16 オーナー判断で残置を決定)。
// 演出 1.3s に対し余裕を持たせた 3 秒。
const FALLBACK_UNMOUNT_MS = 3000;

interface HomeIntroProps {
  children: ReactNode;
}

/* istanbul ignore next -- SSR-only snapshot */
const noop = () => () => {};

export default function HomeIntro({ children }: HomeIntroProps) {
  const isMounted = useSyncExternalStore(
    noop,
    () => true,
    /* istanbul ignore next -- SSR-only snapshot */
    () => false
  );
  // イントロを出すかはマウント時に一度だけ決める。
  // reduced-motion の判定は以前 StarfieldWarpIntro が持っていたが、
  // canvas を外したのでここへ移した。
  const [shouldShowIntro] = useState(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return false;
      }
      return sessionStorage.getItem(SESSION_KEY) !== "true";
    } catch {
      return false;
    }
  });
  const [isIntroComplete, setIsIntroComplete] = useState(!shouldShowIntro);
  // hold 用 setTimeout の id。unmount 時に確実に clearTimeout し、
  // 800ms 以内の離脱で unmount 後に setState が呼ばれるのを防ぐ。
  const logoHoldTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove(PENDING_CLASS);
  }, []);

  // ロゴを出したことを記録し、LOGO_HOLD_MS 後に畳む。
  // 記録は shouldShowIntro が true のときだけ: false のときに書くと、
  // セッション途中で reduced-motion を解除したユーザーにイントロが出なくなる。
  useEffect(() => {
    if (!shouldShowIntro) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
      // sessionStorage unavailable
    }
    logoHoldTimerRef.current = window.setTimeout(() => {
      setIsIntroComplete(true);
      logoHoldTimerRef.current = null;
    }, LOGO_HOLD_MS);
    return () => {
      if (logoHoldTimerRef.current !== null) {
        window.clearTimeout(logoHoldTimerRef.current);
        logoHoldTimerRef.current = null;
      }
    };
  }, [shouldShowIntro]);

  // フェイルセーフ: 何があっても FALLBACK_UNMOUNT_MS で intro を畳む。
  useEffect(() => {
    if (!shouldShowIntro) return;
    const id = window.setTimeout(() => {
      setIsIntroComplete(true);
    }, FALLBACK_UNMOUNT_MS);
    return () => window.clearTimeout(id);
  }, [shouldShowIntro]);

  if (!isMounted || !shouldShowIntro) {
    return <>{children}</>;
  }

  return (
    <>
      {/* 黒背景: isIntroComplete まで表示。fade-out で抜ける。 */}
      <AnimatePresence>
        {!isIntroComplete && (
          <motion.div
            key="intro-bg"
            className="fixed inset-0 z-[100] bg-black pointer-events-none"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        )}
      </AnimatePresence>

      {/* ロゴ: マウントから isIntroComplete まで。自身も bg-black を持ち、
          黒背景の exit と同時に exit しても背景の黒が引き継がれる。 */}
      <AnimatePresence>
        {!isIntroComplete && (
          <motion.div
            key="intro-logo"
            className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none bg-black"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <Image
              src="/logos/yoko-neon.png"
              alt="THE PICKLE BANG THEORY"
              width={360}
              height={80}
              priority
            />
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </>
  );
}
```

**import 順について**: 現在の `HomeIntro.tsx` は `import type` が `@/constants/motion` より前に並んでいるが、これは CLAUDE.md の規定 (1 React → 2 サードパーティ → 3 `@/` エイリアス → 6 `import type`、各グループ間に空行) と逆。全面的に書き直す機会なので、上のコードでは**規約どおりの順に直している**。ESLint は検出しないため、既存の並びへ戻さないこと。

- [ ] **Step 4: テストとカバレッジを確認する**

```bash
npx vitest run src/components/home/HomeIntro.test.tsx
npx tsc --noEmit
```

期待: 全 PASS、型エラーなし。カバレッジが 100% に満たない場合は、足りない分岐を洗い出してテストを足す (実装を削って帳尻を合わせない)。

- [ ] **Step 5: コミットする**

```bash
git add src/components/home/HomeIntro.tsx src/components/home/HomeIntro.test.tsx
git commit -m "feat: ホームのイントロをロゴのみの演出に作り替える" -m "StarfieldWarp の canvas とその進行を待つ phase 管理を外し、マウント直後にロゴを出して LOGO_HOLD_MS 後に畳む形へ単純化する。canvas が持っていた prefers-reduced-motion の判定は HomeIntro 自身へ移した。StarfieldWarpIntro は /teaser が使い続けるため変更していない。" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: イントロ中のスクロールを固定する

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/home/HomeIntro.tsx`
- Test: `src/components/home/HomeIntro.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `HomeIntro` (`shouldShowIntro` / `isIntroComplete` の 2 つの state)
- Produces: イントロ再生中は `<html>` に `intro-scroll-lock` クラスが付き、`isIntroComplete` または unmount で必ず外れる

- [ ] **Step 1: 失敗するテストを書く**

`src/components/home/HomeIntro.test.tsx` の `describe` の末尾に次の 4 ケースを足す。

```tsx
  it("イントロ再生中は intro-scroll-lock クラスを付ける", () => {
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(
      document.documentElement.classList.contains("intro-scroll-lock")
    ).toBe(true);
  });

  it("イントロ完了で intro-scroll-lock クラスを外す", () => {
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(
      document.documentElement.classList.contains("intro-scroll-lock")
    ).toBe(false);
  });

  it("イントロ再生中に unmount しても intro-scroll-lock クラスが残らない", () => {
    const { unmount } = render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    unmount();
    expect(
      document.documentElement.classList.contains("intro-scroll-lock")
    ).toBe(false);
  });

  it("イントロをスキップするときは intro-scroll-lock クラスを付けない", () => {
    mockSessionStorage["bigban-intro-played"] = "true";
    render(
      <HomeIntro>
        <div data-testid="home-content">Home</div>
      </HomeIntro>
    );
    expect(
      document.documentElement.classList.contains("intro-scroll-lock")
    ).toBe(false);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run src/components/home/HomeIntro.test.tsx
```

期待: FAIL。「イントロ再生中は intro-scroll-lock クラスを付ける」が `expected false to be true` で落ちる (まだ誰もクラスを付けていない)。

- [ ] **Step 3: HomeIntro にクラス管理を足す**

`src/components/home/HomeIntro.tsx` の定数宣言に 1 行足す。

```tsx
/** マウント後にイントロ中のスクロールを固定する html クラス */
const SCROLL_LOCK_CLASS = "intro-scroll-lock";
```

`intro-pending` を外す `useEffect` の直後に、次の `useEffect` を足す。

```tsx
  // イントロ再生中はスクロールを固定する。
  // ハイドレーション前は intro-pending が担い、マウント後はこのクラスが
  // isIntroComplete まで引き継ぐ。両者は同一コミットで入れ替わるため、
  // ロックが途切れる瞬間はない。
  useEffect(() => {
    const root = document.documentElement;
    if (!shouldShowIntro || isIntroComplete) {
      root.classList.remove(SCROLL_LOCK_CLASS);
      return;
    }
    root.classList.add(SCROLL_LOCK_CLASS);
    return () => {
      root.classList.remove(SCROLL_LOCK_CLASS);
    };
  }, [shouldShowIntro, isIntroComplete]);
```

- [ ] **Step 4: globals.css にスクロール固定を足す**

`src/app/globals.css` の既存の `html.intro-pending main { visibility: hidden; }` ブロックの直後に次を足す。既存ブロックは変更しない。

```css
  /* イントロ再生中はスクロールを固定する。
     intro-pending     : ハイドレーション前 (PreHydrationScripts の introScript)
     intro-scroll-lock : ハイドレーション後 (HomeIntro が isIntroComplete まで維持)
     どちらもフェイルセーフで必ず剥がれるため、ロックが残り続けることはない。

     既知のトレードオフ: クラシックスクロールバー環境 (Windows/Linux) では
     解除時にスクロールバーが復帰して幅が ~15px 変わる。解除は黒背景の
     フェードアウトと同時なのでほぼ目立たない。 */
  html.intro-pending,
  html.intro-scroll-lock,
  html.intro-pending body,
  html.intro-scroll-lock body {
    overflow: hidden;
    /* Android Chrome の pull-to-refresh でイントロ中にリロードされるのを防ぐ */
    overscroll-behavior: none;
  }
```

- [ ] **Step 5: テストを実行して通ることを確認する**

```bash
npx vitest run src/components/home/HomeIntro.test.tsx
npx tsc --noEmit
npm run lint
```

期待: 全 PASS、エラーなし。

- [ ] **Step 6: コミットする**

```bash
git add src/app/globals.css src/components/home/HomeIntro.tsx src/components/home/HomeIntro.test.tsx
git commit -m "feat: イントロ再生中のスクロールを固定する" -m "visibility:hidden はレイアウトを保つため main が見えない間もスクロールでき、イントロが明けたときページ途中から始まりうる。ハイドレーション前は intro-pending、マウント後は intro-scroll-lock がロックを引き継ぐ。" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: layout.tsx と page.tsx を配線する

この 2 ファイルは**必ず同じコミットで**変更する。`layout.tsx` だけ先に入れると `intro-pending` を誰も剥がさず `main` が 6 秒間隠れ、`page.tsx` だけ先に入れるとイントロの裏でヒーローが先に見える。

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/[locale]/page.tsx`
- Test: `src/app/[locale]/layout.test.tsx`
- Test: `src/app/[locale]/page.test.tsx`

**Interfaces:**
- Consumes: Task 1・2 の `HomeIntro`、PR #481 で導入済みの `PreHydrationScripts` の `shouldPlayIntro?: boolean` prop (既定 `false`)
- Produces: ホーム (`/`・`/en`) でイントロが再生される状態

- [ ] **Step 1: 失敗するテストを書く (layout)**

`src/app/[locale]/layout.test.tsx` の `PreHydrationScripts` の mock は現在 props を捨てている。渡された props を記録する形へ変える。

```tsx
const preHydrationProps: { shouldPlayIntro?: boolean }[] = [];

vi.mock("@/components/PreHydrationScripts", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/PreHydrationScripts")
  >("@/components/PreHydrationScripts");
  return {
    ...actual,
    default: (props: { shouldPlayIntro?: boolean }) => {
      preHydrationProps.push(props);
      return null;
    },
  };
});
```

`vi.mock` は巻き上げられるため、vitest が `preHydrationProps` の初期化順で警告・エラーを出す場合は `vi.hoisted()` で包む。

```tsx
const preHydrationProps = vi.hoisted(
  () => [] as { shouldPlayIntro?: boolean }[]
);
```

(同じファイル内の既存 mock と `src/components/home/HomeIntro.test.tsx` は素の `const` / `let` で動いているため、まずはそのまま試してよい。)

そのうえで `describe` の中に次のケースを足す。

```tsx
  it("PreHydrationScripts に shouldPlayIntro を渡してイントロを有効にする", async () => {
    preHydrationProps.length = 0;
    const { default: LocaleLayout } = await import("./layout");

    render(
      await LocaleLayout({
        children: <p>test content</p>,
        params: Promise.resolve({ locale: "ja" }),
      })
    );

    expect(preHydrationProps.at(0)?.shouldPlayIntro).toBe(true);
  });
```

- [ ] **Step 2: 失敗するテストを書く (page)**

`src/app/[locale]/page.test.tsx` から、PR #481 で追加した次のケースを削除する。

```tsx
  it("イントロ演出 (StarfieldWarp の canvas) を描画しない", async () => {
    const { default: Home } = await import("./page");
    const element = await Home({ params: Promise.resolve({ locale: "ja" }) });
    const { container } = render(element);

    expect(container.querySelector("canvas")).toBeNull();
  });
```

代わりに、mock 定義の並びへ `HomeIntro` の passthrough mock を戻し、

```tsx
vi.mock("@/components/home/HomeIntro", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="home-intro">{children}</div>
  ),
}));
```

`describe("Home Page", ...)` に次のケースを足す。

```tsx
  it("ページ全体を HomeIntro で包む", async () => {
    const { default: Home } = await import("./page");
    const element = await Home({ params: Promise.resolve({ locale: "ja" }) });
    render(element);

    const intro = screen.getByTestId("home-intro");
    expect(intro).toContainElement(screen.getByTestId("home-hero"));
  });
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
npx vitest run "src/app/[locale]/layout.test.tsx" "src/app/[locale]/page.test.tsx"
```

期待: FAIL。layout 側は `expected undefined to be true` (まだ prop を渡していない)、page 側は `Unable to find an element by: [data-testid="home-intro"]` (まだ囲んでいない)。

- [ ] **Step 4: 実装を書く**

`src/app/[locale]/layout.tsx` の 137 行目を変更する。

```tsx
        <PreHydrationScripts shouldPlayIntro />
```

`src/app/[locale]/page.tsx` に import を戻す。他の `@/components/home/*` の import と同じ並びに置く。

```tsx
import HomeIntro from "@/components/home/HomeIntro";
```

`return (` 直前の「イントロは一旦 OFF」コメント 3 行を次の 1 行に差し替え、`<>` / `</>` を `<HomeIntro>` / `</HomeIntro>` に戻す。

```tsx
  // 初回訪問時はロゴのイントロ演出を挟む (約 1.3 秒、1 セッション 1 回)。
  return (
    <HomeIntro>
      <StructuredData data={buildServices()} />
      <main>
```

末尾:

```tsx
      </main>
    </HomeIntro>
  );
```

- [ ] **Step 5: PreHydrationScripts のコメントを現状に合わせる**

`src/components/PreHydrationScripts.tsx` の冒頭 3 行のコメントは「現在どこからも出力されない」と書いてあるが、`layout.tsx` が `shouldPlayIntro` を渡すようになったため事実と合わない。次に差し替える (ロジックは変更しない)。

```tsx
// ホーム初回訪問時のイントロ演出中だけ main を隠すためのスクリプト。
// layout.tsx が shouldPlayIntro を渡しているときに出力される。
```

- [ ] **Step 6: テストを実行して通ることを確認する**

```bash
npx vitest run "src/app/[locale]/layout.test.tsx" "src/app/[locale]/page.test.tsx" src/components/PreHydrationScripts.test.tsx
```

期待: 全 PASS。ホームの順序検証テスト (HomeHero → HomeLatestNews → HomeFacility → HomeConcept) も引き続き PASS すること。

- [ ] **Step 7: コミットする**

```bash
git add "src/app/[locale]/layout.tsx" "src/app/[locale]/layout.test.tsx" "src/app/[locale]/page.tsx" "src/app/[locale]/page.test.tsx" src/components/PreHydrationScripts.tsx
git commit -m "feat: ホームでロゴのイントロを再生する" -m "layout.tsx で shouldPlayIntro を渡し、page.tsx を HomeIntro で囲み直す。片方だけだと main が 6 秒間 visibility:hidden のまま残るか、イントロの裏でヒーローが先に見えるため、2 か所を同一コミットで変更している。" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: CI 相当の全チェックを通す

**Files:**
- Modify: なし (落ちた場合のみ Task 1〜3 の対象ファイルを直す)

**Interfaces:**
- Consumes: Task 1〜3 の変更
- Produces: CI と同じ 4 チェックが green である状態

- [ ] **Step 1: 型チェック**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

- [ ] **Step 3: テスト + カバレッジ 100%**

```bash
npm run test:coverage
```

期待: 全 PASS、statements / branches / functions / lines すべて 100%。`StarfieldWarpIntro.test.tsx` も引き続き PASS すること (`/teaser` が使用中のため残している)。

- [ ] **Step 4: プロダクションビルド**

```bash
npm run build
```

- [ ] **Step 5: 差分が想定どおりか確認する**

```bash
git status --porcelain
git diff --stat origin/develop..HEAD -- src/
```

期待: `src/` の変更は `HomeIntro.tsx` / `HomeIntro.test.tsx` / `globals.css` / `layout.tsx` / `layout.test.tsx` / `page.tsx` / `page.test.tsx` / `PreHydrationScripts.tsx` / `PreHydrationScripts.test.tsx` に収まっている。`StarfieldWarpIntro` 系と `teaser/types.ts` に変更がないこと。

`next-env.d.ts` が変更されていたら `git checkout next-env.d.ts` で戻す (dev サーバー起動で書き換わる自動生成物)。

---

### Task 5: PR #481 を差し替え内容に更新し、オーナー確認を受ける

**Files:**
- Modify: なし

**Interfaces:**
- Consumes: Task 4 で green になったブランチ
- Produces: 更新された PR #481 とプレビュー URL

- [ ] **Step 1: 設計書と実装計画をコミットする**

```bash
git add docs/superpowers/specs/2026-09-16-home-intro-logo-only-design.md docs/superpowers/plans/2026-09-16-home-intro-logo-only.md
git commit -m "docs: ロゴのみのイントロの設計書と実装計画を追加する" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: push アカウントを確認して push する**

`gh auth switch` が定着しないため、トークンを明示する。

```bash
gh auth status
```

期待: `ttmakhr1028ai-art` がログイン済み。

```bash
GH_TOKEN="$(gh auth token -u ttmakhr1028ai-art)" && git -c credential.helper= -c "credential.https://github.com.helper=!f() { echo username=ttmakhr1028ai-art; echo password=$GH_TOKEN; }; f" push origin fix/disable-home-intro
```

- [ ] **Step 3: PR のタイトルと説明を差し替える**

PR の意図が「イントロを消す」から「ワープをやめてロゴだけのイントロに差し替える」に変わるため、両方を書き直す。説明にはコード差分とドキュメント差分の内訳を明記する (CLAUDE.md の 400 行規約を超えるため)。

まずスクラッチディレクトリに説明文を書く (`<scratch>` はセッションのスクラッチディレクトリ)。本文は次のとおり。`<コード行数>` / `<ドキュメント行数>` は Task 4 Step 5 の `git diff --stat` の実測値で置き換える。

```markdown
## 変更内容

ホーム (`/`・`/en`) 初回訪問時のイントロから、StarfieldWarp のワープ演出 (星 → 加速 → フラッシュ → 衝撃波、4.7 秒) を外し、**黒背景にロゴが浮かび上がる演出だけ**を残します。

- `src/components/home/HomeIntro.tsx`: canvas とその進行を待つ phase 管理を削除。マウント直後にロゴを出し、800ms 後に畳む。canvas が持っていた `prefers-reduced-motion` の判定をここへ移動
- `src/app/globals.css` / `HomeIntro`: イントロ再生中のスクロール固定を追加 (`intro-pending` → `intro-scroll-lock` の 2 段構え)
- `src/app/[locale]/layout.tsx`: `<PreHydrationScripts shouldPlayIntro />`
- `src/app/[locale]/page.tsx`: `<HomeIntro>` で囲み直す

ロゴの動き (`opacity 0→1` + `scale 0.9→1`、0.5 秒) と画像は**一切変えていません**。演出全体は約 6 秒 → **約 1.3 秒**になります。

## なぜ

ワープ演出は不要だが、その最後に出るロゴは残したい、というオーナーの意向のため。

`layout.tsx` と `page.tsx` は同一コミットで変更しています。片方だけだと `intro-pending` を誰も剥がさず `main` が 6 秒間 `visibility:hidden` になるか、逆にイントロの裏でヒーローが先に見えるためです。

## `StarfieldWarpIntro` を残している理由

`/teaser` (`src/app/[locale]/teaser/TeaserPage.tsx`) が引き続き使用しています。ティザーページのワープ演出は現状のままです。

## 戻し方

この PR を revert すれば develop の「ワープ + ロゴ」に戻ります。イントロなしにしたい場合の手順は設計書の §8 を参照してください。

## テスト

- [x] `npx tsc --noEmit`
- [x] `npm run lint`
- [x] `npm run test:coverage` (カバレッジ 100%)
- [x] `npm run build`
- [ ] プレビューで `/`・`/en` の初回表示、スクロール固定、reduced-motion、`/teaser` のワープをオーナーが確認
- [ ] Lighthouse (モバイル) でホームの LCP < 2.5s を確認

## 差分の内訳

CLAUDE.md の「PR は 400 行以内」を超えていますが、大半は設計書と実装計画です。

- コード: 約 `<コード行数>` 行
- ドキュメント: 約 `<ドキュメント行数>` 行

## 設計書

`docs/superpowers/specs/2026-09-16-home-intro-logo-only-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

書いたら反映する。

```bash
GH_TOKEN="$(gh auth token -u ttmakhr1028ai-art)" gh pr edit 481 --repo Akihiro1028Bad/bigban-site --title "feat: ホームのイントロをワープからロゴのみに差し替える" --body-file <scratch>/pr-481-body.md
```

- [ ] **Step 4: CI と Vercel プレビューを確認する**

```bash
GH_TOKEN="$(gh auth token -u ttmakhr1028ai-art)" gh pr view 481 --repo Akihiro1028Bad/bigban-site --json statusCheckRollup --jq '.statusCheckRollup[] | {name: (.name // .context), status: (.status // "-"), conclusion: (.conclusion // .state // "-")}'
```

プレビュー URL は Vercel bot の PR コメントから取得する。

```bash
GH_TOKEN="$(gh auth token -u ttmakhr1028ai-art)" gh pr view 481 --repo Akihiro1028Bad/bigban-site --json comments --jq '.comments[] | select(.author.login == "vercel") | .body' | grep -o 'https://[^)]*vercel.app'
```

- [ ] **Step 5: オーナーへ動作確認を依頼する**

ブラウザ確認はオーナーが行う。プレビュー URL を渡し、次の観点を伝える。

1. `/` を初回表示 (プライベートウィンドウ) → 星もフラッシュも出ず、黒画面にロゴが浮かび上がって約 1.3 秒で本編に入る
2. `/en` も同じ
3. リロードでは再生されない
4. イントロ中はスクロールできず、明けた直後はページ先頭から始まる
5. OS の「視差効果を減らす」ON ではイントロが出ず即ヒーロー
6. `/teaser` のワープ演出が従来どおり動く
7. Lighthouse (モバイル) でホームの LCP を実測し 2.5s 未満であること。超えた場合は表示時間短縮か取り下げをオーナーと再検討する

マージはオーナーが判断する。こちらからマージはしない。
