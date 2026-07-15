# ティザーページ シネマティックイントロ 実装計画

**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ティザーページに「宇宙→爆発→ロゴ惑星登場」のシネマティックイントロを追加する。Canvas 2D / WebGL の2エンジン、爆発3パターン、尺3パターンを切り替えて比較可能にする。

**Architecture:** 既存の `page.tsx` を分解し、演出エンジン（BigBangCanvas / BigBangWebGL）と既存コンテンツ（TeaserContent）を分離。`useAnimationPhase` フックがフェーズ状態を管理し、エンジンが `onPhaseChange` コールバックでフェーズ遷移を通知する。切り替えUI（EngineSwitch）で全パラメータを動的に変更可能。

**Tech Stack:** Next.js 16, TypeScript (strict), Tailwind CSS v4, Framer Motion, Canvas 2D API, React Three Fiber + drei (WebGL版, dynamic import), Vitest + React Testing Library, Playwright

**設計スペック:** `docs/superpowers/specs/2026-03-27-bigbang-cinematic-intro-design.md`

---

## ファイル構成

| 操作 | パス | 責務 |
|------|------|------|
| Create | `src/hooks/useCountdown.ts` | カウントダウンフック（page.tsxから抽出） |
| Create | `src/hooks/useCountdown.test.ts` | useCountdown テスト |
| Create | `src/hooks/useAnimationPhase.ts` | フェーズ状態管理（dark→converge→explode→logo→content） |
| Create | `src/hooks/useAnimationPhase.test.ts` | useAnimationPhase テスト |
| Create | `src/components/teaser/TeaserContent.tsx` | 既存ティザーUI（カウントダウン、メール登録、キーファクト、フッター） |
| Create | `src/components/teaser/TeaserContent.test.tsx` | TeaserContent テスト |
| Create | `src/components/teaser/EmailSignup.tsx` | メール登録フォーム（page.tsxから抽出） |
| Create | `src/components/teaser/EmailSignup.test.tsx` | EmailSignup テスト |
| Create | `src/components/teaser/BigBangCanvas.tsx` | Canvas 2D版エンジン |
| Create | `src/components/teaser/BigBangCanvas.test.tsx` | BigBangCanvas テスト |
| Create | `src/components/teaser/BigBangWebGL.tsx` | WebGL (R3F)版エンジン |
| Create | `src/components/teaser/BigBangWebGL.test.tsx` | BigBangWebGL テスト |
| Create | `src/components/teaser/EngineSwitch.tsx` | エンジン/パターン/尺の切り替えUI |
| Create | `src/components/teaser/EngineSwitch.test.tsx` | EngineSwitch テスト |
| Create | `src/components/teaser/types.ts` | 共通型定義 |
| Modify | `src/app/teaser/page.tsx` | オーケストレーターとして書き換え |
| Create | `src/app/teaser/page.test.tsx` | page テスト |
| Create | `vitest.config.ts` | Vitest 設定 |
| Create | `vitest.setup.ts` | テスト用セットアップ |
| Modify | `package.json` | devDependencies追加、testスクリプト追加 |

---

## Task 1: テスト基盤のセットアップ

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json`

- [ ] **Step 1: devDependencies をインストール**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react jsdom
```

- [ ] **Step 2: vitest.config.ts を作成**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: vitest.setup.ts を作成**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: package.json に test スクリプトを追加**

`package.json` の `scripts` セクションに追加:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

- [ ] **Step 5: テストが実行できることを確認**

```bash
npx vitest run
```

Expected: テストファイルが0件で正常終了（エラーなし）

- [ ] **Step 6: コミット**

```bash
git add vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "chore: Vitest + React Testing Library のテスト基盤をセットアップ"
```

---

## Task 2: 共通型定義

**Files:**
- Create: `src/components/teaser/types.ts`

- [ ] **Step 1: types.ts を作成**

```typescript
export type AnimationPhase = "dark" | "converge" | "explode" | "logo" | "content";

export type ExplosionStyle = "physics" | "neon" | "minimal";

export type Duration = "short" | "medium" | "long";

export interface BigBangConfig {
  explosionStyle: ExplosionStyle;
  duration: Duration;
}

export interface BigBangEngineProps {
  config: BigBangConfig;
  onPhaseChange: (phase: AnimationPhase) => void;
  logoSrc: string;
}

export const DURATION_MS: Record<Duration, { dark: number; converge: number; explode: number; logo: number }> = {
  short: { dark: 800, converge: 800, explode: 600, logo: 800 },
  medium: { dark: 1500, converge: 1500, explode: 1000, logo: 1500 },
  long: { dark: 2500, converge: 2500, explode: 1500, logo: 2500 },
};
```

- [ ] **Step 2: コミット**

```bash
git add src/components/teaser/types.ts
git commit -m "feat(teaser): シネマティックイントロの共通型定義を追加"
```

---

## Task 3: useCountdown フック（抽出）

**Files:**
- Create: `src/hooks/useCountdown.ts`
- Create: `src/hooks/useCountdown.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("残り時間を正しく計算する", () => {
    const now = new Date("2026-03-27T00:00:00+09:00");
    vi.setSystemTime(now);

    const target = new Date("2026-04-18T00:00:00+09:00");
    const { result } = renderHook(() => useCountdown(target));

    expect(result.current.days).toBe(22);
    expect(result.current.hours).toBe(0);
    expect(result.current.minutes).toBe(0);
    expect(result.current.seconds).toBe(0);
  });

  it("1秒ごとに更新される", () => {
    const now = new Date("2026-04-17T23:59:58+09:00");
    vi.setSystemTime(now);

    const target = new Date("2026-04-18T00:00:00+09:00");
    const { result } = renderHook(() => useCountdown(target));

    expect(result.current.seconds).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.seconds).toBe(1);
  });

  it("目標日時を過ぎたらすべて0になる", () => {
    const now = new Date("2026-04-19T00:00:00+09:00");
    vi.setSystemTime(now);

    const target = new Date("2026-04-18T00:00:00+09:00");
    const { result } = renderHook(() => useCountdown(target));

    expect(result.current.days).toBe(0);
    expect(result.current.hours).toBe(0);
    expect(result.current.minutes).toBe(0);
    expect(result.current.seconds).toBe(0);
  });

  it("アンマウント時にインターバルがクリアされる", () => {
    const now = new Date("2026-03-27T00:00:00+09:00");
    vi.setSystemTime(now);

    const target = new Date("2026-04-18T00:00:00+09:00");
    const { unmount } = renderHook(() => useCountdown(target));

    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/hooks/useCountdown.test.ts
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: useCountdown.ts を実装**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

interface CountdownValues {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function useCountdown(targetDate: Date): CountdownValues {
  const calc = useCallback((): CountdownValues => {
    const diff = Math.max(0, targetDate.getTime() - Date.now());
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }, [targetDate]);

  const [time, setTime] = useState<CountdownValues>(calc);

  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  }, [calc]);

  return time;
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/hooks/useCountdown.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useCountdown.ts src/hooks/useCountdown.test.ts
git commit -m "refactor(teaser): useCountdown フックを page.tsx から抽出"
```

---

## Task 4: useAnimationPhase フック

**Files:**
- Create: `src/hooks/useAnimationPhase.ts`
- Create: `src/hooks/useAnimationPhase.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAnimationPhase } from "./useAnimationPhase";
import type { BigBangConfig } from "@/components/teaser/types";

describe("useAnimationPhase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultConfig: BigBangConfig = {
    explosionStyle: "physics",
    duration: "medium",
  };

  it("初期フェーズは dark", () => {
    const { result } = renderHook(() => useAnimationPhase(defaultConfig));
    expect(result.current.phase).toBe("dark");
  });

  it("setPhase でフェーズを変更できる", () => {
    const { result } = renderHook(() => useAnimationPhase(defaultConfig));

    act(() => {
      result.current.setPhase("converge");
    });

    expect(result.current.phase).toBe("converge");
  });

  it("reset で dark に戻る", () => {
    const { result } = renderHook(() => useAnimationPhase(defaultConfig));

    act(() => {
      result.current.setPhase("content");
    });
    expect(result.current.phase).toBe("content");

    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe("dark");
  });

  it("isComplete は content フェーズで true", () => {
    const { result } = renderHook(() => useAnimationPhase(defaultConfig));

    expect(result.current.isComplete).toBe(false);

    act(() => {
      result.current.setPhase("content");
    });

    expect(result.current.isComplete).toBe(true);
  });

  it("config を返す", () => {
    const { result } = renderHook(() => useAnimationPhase(defaultConfig));
    expect(result.current.config).toEqual(defaultConfig);
  });

  it("config 変更時に状態が更新される", () => {
    const { result, rerender } = renderHook(
      ({ config }) => useAnimationPhase(config),
      { initialProps: { config: defaultConfig } }
    );

    const newConfig: BigBangConfig = { explosionStyle: "neon", duration: "short" };
    rerender({ config: newConfig });

    expect(result.current.config).toEqual(newConfig);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/hooks/useAnimationPhase.test.ts
```

Expected: FAIL

- [ ] **Step 3: useAnimationPhase.ts を実装**

```typescript
"use client";

import { useState, useCallback } from "react";
import type { AnimationPhase, BigBangConfig } from "@/components/teaser/types";

interface UseAnimationPhaseReturn {
  phase: AnimationPhase;
  setPhase: (phase: AnimationPhase) => void;
  reset: () => void;
  isComplete: boolean;
  config: BigBangConfig;
}

export function useAnimationPhase(config: BigBangConfig): UseAnimationPhaseReturn {
  const [phase, setPhase] = useState<AnimationPhase>("dark");

  const reset = useCallback(() => {
    setPhase("dark");
  }, []);

  return {
    phase,
    setPhase,
    reset,
    isComplete: phase === "content",
    config,
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/hooks/useAnimationPhase.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useAnimationPhase.ts src/hooks/useAnimationPhase.test.ts
git commit -m "feat(teaser): useAnimationPhase フェーズ管理フックを追加"
```

---

## Task 5: EmailSignup コンポーネント（抽出）

**Files:**
- Create: `src/components/teaser/EmailSignup.tsx`
- Create: `src/components/teaser/EmailSignup.test.tsx`

- [ ] **Step 1: テストを作成**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { EmailSignup } from "./EmailSignup";

describe("EmailSignup", () => {
  it("メール入力フィールドと送信ボタンが表示される", () => {
    render(<EmailSignup />);

    expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /notify me/i })).toBeInTheDocument();
  });

  it("メール送信後に確認メッセージが表示される", async () => {
    const user = userEvent.setup();
    render(<EmailSignup />);

    const input = screen.getByPlaceholderText("your@email.com");
    const button = screen.getByRole("button", { name: /notify me/i });

    await user.type(input, "test@example.com");
    await user.click(button);

    expect(screen.getByText(/registered/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("your@email.com")).not.toBeInTheDocument();
  });

  it("空メールでは送信されない", async () => {
    const user = userEvent.setup();
    render(<EmailSignup />);

    const button = screen.getByRole("button", { name: /notify me/i });
    await user.click(button);

    expect(screen.queryByText(/registered/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/teaser/EmailSignup.test.tsx
```

Expected: FAIL

- [ ] **Step 3: EmailSignup.tsx を実装**

既存の `page.tsx` 内の `EmailSignup` 関数をそのまま抽出。`motion` と `AnimatePresence` を使用。

```typescript
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function EmailSignup() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex gap-0"
          >
            <label htmlFor="email-signup" className="sr-only">
              メールアドレス
            </label>
            <input
              id="email-signup"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 bg-transparent border border-[#E6E6E6]/20 border-r-0 px-5 py-4 text-[13px] text-[#E6E6E6] tracking-wide placeholder:text-[#8A8A8A]/50 focus:outline-none focus:border-[#E6E6E6]/40 transition-colors font-[var(--font-inter)] rounded-l-sm"
            />
            <button
              type="submit"
              className="bg-[#F6FF54] text-[#0A0A0A] px-6 py-4 text-[11px] tracking-[0.2em] uppercase font-semibold hover:bg-[#F6FF54]/90 transition-colors shrink-0 font-[var(--font-inter)] rounded-r-sm"
            >
              NOTIFY ME
            </button>
          </motion.form>
        ) : (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="text-[#F6FF54] text-[13px] tracking-[0.15em] font-[var(--font-inter)]">
              REGISTERED — WE&apos;LL BE IN TOUCH.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/teaser/EmailSignup.test.tsx
```

Expected: 3 tests PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/teaser/EmailSignup.tsx src/components/teaser/EmailSignup.test.tsx
git commit -m "refactor(teaser): EmailSignup コンポーネントを page.tsx から抽出"
```

---

## Task 6: TeaserContent コンポーネント（抽出）

**Files:**
- Create: `src/components/teaser/TeaserContent.tsx`
- Create: `src/components/teaser/TeaserContent.test.tsx`

- [ ] **Step 1: テストを作成**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TeaserContent } from "./TeaserContent";

describe("TeaserContent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T00:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ロゴ画像が表示される", () => {
    render(<TeaserContent logoSrc="/logos/tate-neon-hybrid.svg" />);

    const logo = screen.getByAltText("THE PICKLE BANG THEORY");
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/logos/tate-neon-hybrid.svg");
  });

  it("開業日が表示される", () => {
    render(<TeaserContent logoSrc="/logos/tate-neon-hybrid.svg" />);
    expect(screen.getByText("2026.4.18 OPEN")).toBeInTheDocument();
  });

  it("カウントダウンが表示される", () => {
    render(<TeaserContent logoSrc="/logos/tate-neon-hybrid.svg" />);

    expect(screen.getByText("DAYS")).toBeInTheDocument();
    expect(screen.getByText("HOURS")).toBeInTheDocument();
    expect(screen.getByText("MIN")).toBeInTheDocument();
    expect(screen.getByText("SEC")).toBeInTheDocument();
  });

  it("タグラインが表示される", () => {
    render(<TeaserContent logoSrc="/logos/tate-neon-hybrid.svg" />);
    expect(
      screen.getByText(/クロスミントン世界王者が手がける/)
    ).toBeInTheDocument();
  });

  it("メール登録セクションが表示される", () => {
    render(<TeaserContent logoSrc="/logos/tate-neon-hybrid.svg" />);
    expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
  });

  it("キーファクトが表示される", () => {
    render(<TeaserContent logoSrc="/logos/tate-neon-hybrid.svg" />);

    expect(screen.getByText("本八幡駅 徒歩1分")).toBeInTheDocument();
    expect(screen.getByText("プロ仕様ハードコート 3面")).toBeInTheDocument();
    expect(screen.getByText("6:00 – 23:00")).toBeInTheDocument();
    expect(screen.getByText("西村昭彦 — 世界王者")).toBeInTheDocument();
  });

  it("フッターが表示される", () => {
    render(<TeaserContent logoSrc="/logos/tate-neon-hybrid.svg" />);
    expect(screen.getByText(/RST Agency/)).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/teaser/TeaserContent.test.tsx
```

Expected: FAIL

- [ ] **Step 3: TeaserContent.tsx を実装**

既存の `page.tsx` からロゴ以降のコンテンツ部分（カウントダウン、タグライン、メール登録、キーファクト、フッター）を抽出する。ロゴ画像パスは props で受け取る。カスタムカーソル、グレインオーバーレイ、アンビエントライティングは page.tsx 側に残す。

```typescript
"use client";

import { motion } from "framer-motion";
import { useCountdown } from "@/hooks/useCountdown";
import { EmailSignup } from "./EmailSignup";

const LAUNCH_DATE = new Date("2026-04-18T00:00:00+09:00");

interface TeaserContentProps {
  logoSrc: string;
}

export function TeaserContent({ logoSrc }: TeaserContentProps) {
  const countdown = useCountdown(LAUNCH_DATE);

  const countdownItems = [
    { value: countdown.days, label: "DAYS" },
    { value: countdown.hours, label: "HOURS" },
    { value: countdown.minutes, label: "MIN" },
    { value: countdown.seconds, label: "SEC" },
  ];

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="flex items-center justify-end px-8 md:px-16 py-6"
      >
        <span className="text-[10px] tracking-[0.35em] text-[#8A8A8A]/60 uppercase font-[var(--font-inter)]">
          Coming Soon
        </span>
      </motion.header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative"
          style={{ marginBottom: "clamp(1rem, 3vh, 2rem)" }}
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(48,110,195,0.15) 0%, rgba(17,49,123,0.06) 40%, transparent 70%)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt="THE PICKLE BANG THEORY"
            className="relative z-[1] w-auto object-contain"
            style={{ height: "clamp(180px, 30vh, 400px)" }}
          />
        </motion.div>

        {/* Open date */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.6 }}
          className="text-[12px] md:text-[13px] tracking-[0.4em] text-[#E6E6E6] uppercase font-[var(--font-inter)]"
          style={{ marginBottom: "clamp(0.75rem, 2vh, 1.5rem)" }}
        >
          2026.4.18 OPEN
        </motion.p>

        {/* Countdown */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.9 }}
          className="flex items-center gap-6 md:gap-10"
          style={{ marginBottom: "clamp(1rem, 2vh, 2rem)" }}
        >
          {countdownItems.map((item, i) => (
            <div key={item.label} className="text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 2.0 + i * 0.1 }}
              >
                <span
                  className="text-[clamp(2rem,5vw,3.5rem)] text-[#E6E6E6] leading-none block font-[var(--font-dm-serif)]"
                >
                  {String(item.value).padStart(2, "0")}
                </span>
                <span className="text-[9px] tracking-[0.35em] text-[#8A8A8A]/50 uppercase mt-2 block font-[var(--font-inter)]">
                  {item.label}
                </span>
              </motion.div>
            </div>
          ))}
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 2.4 }}
          className="text-[#E6E6E6]/50 text-[clamp(0.75rem,1.1vw,0.95rem)] leading-[1.9] tracking-wide text-center max-w-lg font-[var(--font-inter)]"
          style={{ marginBottom: "clamp(1.5rem, 3vh, 2.5rem)" }}
        >
          クロスミントン世界王者が手がける、プレミアムインドアピックルボール施設。本八幡に誕生。
        </motion.p>

        {/* Email signup */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 2.7 }}
          className="w-full max-w-md"
        >
          <p className="text-[10px] tracking-[0.3em] text-[#8A8A8A]/60 uppercase text-center mb-4 font-[var(--font-inter)]">
            オープン情報をいち早くお届け
          </p>
          <EmailSignup />
        </motion.div>
      </div>

      {/* Key facts row */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 3.0 }}
        className="px-8 md:px-16 py-4 border-t border-[#E6E6E6]/[0.06]"
      >
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-8 gap-y-2 md:gap-x-12">
          {[
            { label: "LOCATION", value: "本八幡駅 徒歩1分" },
            { label: "COURTS", value: "プロ仕様ハードコート 3面" },
            { label: "HOURS", value: "6:00 – 23:00" },
            { label: "FOUNDER", value: "西村昭彦 — 世界王者" },
          ].map((fact) => (
            <div key={fact.label} className="flex items-baseline gap-3 py-2">
              <span className="text-[9px] tracking-[0.3em] text-[#8A8A8A]/40 uppercase font-[var(--font-inter)]">
                {fact.label}
              </span>
              <span className="text-[12px] text-[#E6E6E6]/60 tracking-wide font-[var(--font-inter)]">
                {fact.value}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 3.2 }}
        className="flex items-center justify-between px-8 md:px-16 py-5"
      >
        <span className="text-[10px] text-[#8A8A8A]/30 font-[var(--font-inter)]">
          &copy; 2026 RST Agency Inc.
        </span>
        <a
          href="#"
          className="inline-flex items-center gap-2 text-[10px] tracking-[0.2em] text-[#8A8A8A]/40 hover:text-[#F6FF54] transition-colors duration-300 uppercase font-[var(--font-inter)]"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          Instagram
        </a>
        <span className="text-[10px] tracking-[0.2em] text-[#8A8A8A]/30 uppercase font-[var(--font-inter)]">
          Ichikawa, Chiba
        </span>
      </motion.footer>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/teaser/TeaserContent.test.tsx
```

Expected: 7 tests PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/teaser/TeaserContent.tsx src/components/teaser/TeaserContent.test.tsx
git commit -m "refactor(teaser): TeaserContent コンポーネントを page.tsx から抽出"
```

---

## Task 7: EngineSwitch コンポーネント

**Files:**
- Create: `src/components/teaser/EngineSwitch.tsx`
- Create: `src/components/teaser/EngineSwitch.test.tsx`

- [ ] **Step 1: テストを作成**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { EngineSwitch } from "./EngineSwitch";
import type { BigBangConfig } from "./types";

describe("EngineSwitch", () => {
  const defaultConfig: BigBangConfig = {
    explosionStyle: "physics",
    duration: "medium",
  };

  it("エンジン切り替えボタンが表示される", () => {
    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /canvas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /webgl/i })).toBeInTheDocument();
  });

  it("爆発パターン切り替えボタンが表示される", () => {
    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /physics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /neon/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /minimal/i })).toBeInTheDocument();
  });

  it("尺切り替えボタンが表示される", () => {
    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /short/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /long/i })).toBeInTheDocument();
  });

  it("リプレイボタンが表示される", () => {
    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("エンジンを切り替えるとコールバックが呼ばれる", async () => {
    const user = userEvent.setup();
    const onEngineChange = vi.fn();

    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={onEngineChange}
        onConfigChange={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /webgl/i }));
    expect(onEngineChange).toHaveBeenCalledWith("webgl");
  });

  it("爆発パターンを切り替えるとコールバックが呼ばれる", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();

    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={onConfigChange}
        onReplay={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /neon/i }));
    expect(onConfigChange).toHaveBeenCalledWith({ ...defaultConfig, explosionStyle: "neon" });
  });

  it("尺を切り替えるとコールバックが呼ばれる", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();

    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={onConfigChange}
        onReplay={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /long/i }));
    expect(onConfigChange).toHaveBeenCalledWith({ ...defaultConfig, duration: "long" });
  });

  it("リプレイボタンを押すとコールバックが呼ばれる", async () => {
    const user = userEvent.setup();
    const onReplay = vi.fn();

    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={vi.fn()}
        onReplay={onReplay}
      />
    );

    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(onReplay).toHaveBeenCalled();
  });

  it("現在選択中のエンジンがアクティブ表示される", () => {
    render(
      <EngineSwitch
        engine="canvas"
        config={defaultConfig}
        onEngineChange={vi.fn()}
        onConfigChange={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const canvasBtn = screen.getByRole("button", { name: /canvas/i });
    expect(canvasBtn).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/teaser/EngineSwitch.test.tsx
```

Expected: FAIL

- [ ] **Step 3: EngineSwitch.tsx を実装**

```typescript
"use client";

import type { BigBangConfig, ExplosionStyle, Duration } from "./types";

type EngineType = "canvas" | "webgl";

interface EngineSwitchProps {
  engine: EngineType;
  config: BigBangConfig;
  onEngineChange: (engine: EngineType) => void;
  onConfigChange: (config: BigBangConfig) => void;
  onReplay: () => void;
}

const EXPLOSION_STYLES: ExplosionStyle[] = ["physics", "neon", "minimal"];
const DURATIONS: Duration[] = ["short", "medium", "long"];

export function EngineSwitch({
  engine,
  config,
  onEngineChange,
  onConfigChange,
  onReplay,
}: EngineSwitchProps) {
  const activeClass = "bg-[#F6FF54]/15 text-[#F6FF54]";
  const inactiveClass = "text-[#666]";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-lg border border-[#E6E6E6]/10 bg-[#0A0A0A]/90 px-4 py-3 backdrop-blur-sm">
      {/* Engine */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[9px] tracking-[0.15em] text-[#666] uppercase">Engine</span>
        <div className="flex overflow-hidden rounded border border-[#E6E6E6]/10">
          {(["canvas", "webgl"] as const).map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={engine === e}
              onClick={() => onEngineChange(e)}
              className={`px-3 py-1.5 text-[11px] tracking-[0.1em] uppercase transition-colors ${
                engine === e ? activeClass : inactiveClass
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Explosion Style */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[9px] tracking-[0.15em] text-[#666] uppercase">Explosion</span>
        <div className="flex overflow-hidden rounded border border-[#E6E6E6]/10">
          {EXPLOSION_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={config.explosionStyle === style}
              onClick={() => onConfigChange({ ...config, explosionStyle: style })}
              className={`px-2.5 py-1.5 text-[11px] uppercase transition-colors ${
                config.explosionStyle === style ? activeClass : inactiveClass
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[9px] tracking-[0.15em] text-[#666] uppercase">Duration</span>
        <div className="flex overflow-hidden rounded border border-[#E6E6E6]/10">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={config.duration === d}
              onClick={() => onConfigChange({ ...config, duration: d })}
              className={`px-2.5 py-1.5 text-[11px] uppercase transition-colors ${
                config.duration === d ? activeClass : inactiveClass
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Replay */}
      <button
        type="button"
        onClick={onReplay}
        className="rounded border border-[#F6FF54]/30 px-4 py-1.5 text-[11px] tracking-[0.1em] text-[#F6FF54] transition-colors hover:bg-[#F6FF54]/10"
      >
        ▶ PLAY
      </button>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/teaser/EngineSwitch.test.tsx
```

Expected: 9 tests PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/teaser/EngineSwitch.tsx src/components/teaser/EngineSwitch.test.tsx
git commit -m "feat(teaser): EngineSwitch 切り替えUIコンポーネントを追加"
```

---

## Task 8: BigBangCanvas コンポーネント（Canvas 2D エンジン）

**Files:**
- Create: `src/components/teaser/BigBangCanvas.tsx`
- Create: `src/components/teaser/BigBangCanvas.test.tsx`

- [ ] **Step 1: テストを作成**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BigBangCanvas } from "./BigBangCanvas";
import type { BigBangConfig, AnimationPhase } from "./types";

// Canvas API をモック
const mockGetContext = vi.fn(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  canvas: { width: 1440, height: 900 },
  globalCompositeOperation: "source-over",
  globalAlpha: 1,
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
}));

HTMLCanvasElement.prototype.getContext = mockGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;

describe("BigBangCanvas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // requestAnimationFrame のモック
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      setTimeout(() => cb(performance.now()), 16);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const defaultConfig: BigBangConfig = {
    explosionStyle: "physics",
    duration: "medium",
  };

  it("canvas 要素が role=img と aria-label 付きでレンダリングされる", () => {
    render(
      <BigBangCanvas
        config={defaultConfig}
        onPhaseChange={vi.fn()}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    const canvas = screen.getByRole("img");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("aria-label", "ビッグバン シネマティック演出");
  });

  it("canvas が全画面表示される", () => {
    render(
      <BigBangCanvas
        config={defaultConfig}
        onPhaseChange={vi.fn()}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    const canvas = screen.getByRole("img");
    expect(canvas.tagName).toBe("CANVAS");
  });

  it("マウント時に onPhaseChange が dark で呼ばれる", () => {
    const onPhaseChange = vi.fn();

    render(
      <BigBangCanvas
        config={defaultConfig}
        onPhaseChange={onPhaseChange}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    expect(onPhaseChange).toHaveBeenCalledWith("dark");
  });

  it("prefers-reduced-motion 時は canvas がレンダリングされない", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onPhaseChange = vi.fn();

    render(
      <BigBangCanvas
        config={defaultConfig}
        onPhaseChange={onPhaseChange}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(onPhaseChange).toHaveBeenCalledWith("content");
  });

  it("アンマウント時にアニメーションがクリーンアップされる", () => {
    const { unmount } = render(
      <BigBangCanvas
        config={defaultConfig}
        onPhaseChange={vi.fn()}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/teaser/BigBangCanvas.test.tsx
```

Expected: FAIL

- [ ] **Step 3: BigBangCanvas.tsx を実装**

Canvas 2D で5フェーズのアニメーションを描画するコンポーネント。パーティクルシステム、衝撃波、フラッシュ効果を含む。各爆発パターン（physics / neon / minimal）と尺（short / medium / long）を `config` props で切り替え可能。

```typescript
"use client";

import { useRef, useEffect, useCallback } from "react";
import type { BigBangEngineProps, AnimationPhase } from "./types";
import { DURATION_MS } from "./types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
}

function createStars(count: number, width: number, height: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    life: Math.random() * 1000,
    maxLife: 1000,
    size: Math.random() * 2 + 0.5,
    color: "#ffffff",
    alpha: Math.random() * 0.6 + 0.1,
  }));
}

function getExplosionColors(style: BigBangEngineProps["config"]["explosionStyle"]): string[] {
  switch (style) {
    case "physics":
      return ["#ffffff", "#c8dcff", "#a0b8e0", "#8090c0"];
    case "neon":
      return ["#F6FF54", "#306EC3", "#F6FF54", "#11317B"];
    case "minimal":
      return ["#E6E6E6", "#cccccc", "#aaaaaa", "#888888"];
  }
}

function createExplosionParticles(
  count: number,
  cx: number,
  cy: number,
  colors: string[],
  speedMultiplier: number
): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 4 + 1) * speedMultiplier;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      size: Math.random() * 3 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
    };
  });
}

export function BigBangCanvas({ config, onPhaseChange, logoSrc }: BigBangEngineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const phaseRef = useRef<AnimationPhase>("dark");
  const startTimeRef = useRef<number>(0);
  const starsRef = useRef<Particle[]>([]);
  const explosionParticlesRef = useRef<Particle[]>([]);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const reducedMotionRef = useRef(false);

  const durations = DURATION_MS[config.duration];

  // prefers-reduced-motion チェック
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mql.matches;
    if (mql.matches) {
      onPhaseChange("content");
    }
  }, [onPhaseChange]);

  const setPhase = useCallback(
    (phase: AnimationPhase) => {
      if (phaseRef.current !== phase) {
        phaseRef.current = phase;
        onPhaseChange(phase);
      }
    },
    [onPhaseChange]
  );

  useEffect(() => {
    if (reducedMotionRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ロゴ画像を読み込み
    const logoImg = new Image();
    logoImg.src = logoSrc;
    logoImgRef.current = logoImg;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;

    // パーティクル数をデバイスに応じて調整
    const isMobile = w < 768;
    const starCount = isMobile ? 80 : 200;
    const explosionCount = isMobile ? 300 : 800;

    starsRef.current = createStars(starCount, w, h);

    startTimeRef.current = performance.now();
    setPhase("dark");

    const colors = getExplosionColors(config.explosionStyle);
    let shockwaveRadius = 0;
    let flashAlpha = 0;
    let logoAlpha = 0;
    let logoScale = 0;

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const { dark, converge, explode, logo } = durations;

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);

      // 背景: 黒
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      // Phase transitions
      if (elapsed < dark) {
        // Phase 1: Dark — 星の瞬き
        setPhase("dark");
        for (const star of starsRef.current) {
          star.life += 16;
          const twinkle = Math.sin(star.life * 0.003) * 0.5 + 0.5;
          ctx.globalAlpha = star.alpha * twinkle;
          ctx.fillStyle = star.color;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (elapsed < dark + converge) {
        // Phase 2: Converge — 星が中心に吸い寄せられる
        setPhase("converge");
        const progress = (elapsed - dark) / converge;
        const eased = progress * progress; // ease-in

        for (const star of starsRef.current) {
          const dx = cx - star.x;
          const dy = cy - star.y;
          const drawX = star.x + dx * eased;
          const drawY = star.y + dy * eased;

          ctx.globalAlpha = star.alpha * (1 + progress);
          ctx.fillStyle = star.color;
          ctx.beginPath();
          ctx.arc(drawX, drawY, star.size * (1 - eased * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }

        // 中心の光点
        const glowSize = 20 + progress * 40;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
        gradient.addColorStop(0, `rgba(48, 110, 195, ${0.3 + progress * 0.5})`);
        gradient.addColorStop(1, "transparent");
        ctx.globalAlpha = 1;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, glowSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (elapsed < dark + converge + explode) {
        // Phase 3: Explode — 爆発
        setPhase("explode");
        const progress = (elapsed - dark - converge) / explode;

        // 最初のフレームで爆発パーティクルを生成
        if (explosionParticlesRef.current.length === 0) {
          const speedMult = config.explosionStyle === "minimal" ? 1.5 : 3;
          const count = config.explosionStyle === "minimal" ? Math.floor(explosionCount * 0.4) : explosionCount;
          explosionParticlesRef.current = createExplosionParticles(count, cx, cy, colors, speedMult);
          flashAlpha = 1;
        }

        // フラッシュ
        if (flashAlpha > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = flashAlpha;
          ctx.fillStyle = colors[0];
          ctx.fillRect(0, 0, w, h);
          flashAlpha *= 0.85;
          ctx.globalCompositeOperation = "source-over";
        }

        // 衝撃波リング
        if (config.explosionStyle !== "minimal") {
          shockwaveRadius = progress * Math.max(w, h) * 0.6;
          ctx.globalAlpha = 1 - progress;
          ctx.strokeStyle = colors[0];
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, shockwaveRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // パーティクル更新・描画
        ctx.globalCompositeOperation = config.explosionStyle === "neon" ? "lighter" : "source-over";
        for (const p of explosionParticlesRef.current) {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.vy *= 0.98;
          if (config.explosionStyle === "physics") {
            p.vy += 0.02; // 微かな重力
          }
          p.life -= 0.012;

          if (p.life > 0) {
            ctx.globalAlpha = p.life * p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (elapsed < dark + converge + explode + logo) {
        // Phase 4: Logo — ロゴ惑星登場
        setPhase("logo");
        const progress = (elapsed - dark - converge - explode) / logo;
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out

        logoAlpha = eased;
        logoScale = eased;

        // 残留パーティクル
        ctx.globalCompositeOperation = config.explosionStyle === "neon" ? "lighter" : "source-over";
        for (const p of explosionParticlesRef.current) {
          p.x += p.vx * 0.3;
          p.y += p.vy * 0.3;
          p.life -= 0.005;
          if (p.life > 0) {
            ctx.globalAlpha = p.life * 0.3;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // ブルーグロウオーラ
        ctx.globalCompositeOperation = "source-over";
        const auraSize = 250 * logoScale;
        const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraSize);
        aura.addColorStop(0, `rgba(48, 110, 195, ${0.15 * logoAlpha})`);
        aura.addColorStop(0.4, `rgba(17, 49, 123, ${0.06 * logoAlpha})`);
        aura.addColorStop(1, "transparent");
        ctx.globalAlpha = 1;
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(cx, cy, auraSize, 0, Math.PI * 2);
        ctx.fill();

        // ロゴ描画
        if (logoImgRef.current?.complete) {
          const img = logoImgRef.current;
          const logoH = Math.min(h * 0.35, 400) * logoScale;
          const logoW = (img.naturalWidth / img.naturalHeight) * logoH;
          ctx.globalAlpha = logoAlpha;
          ctx.drawImage(img, cx - logoW / 2, cy - logoH / 2, logoW, logoH);
        }
      } else {
        // Phase 5: Content
        setPhase("content");
        // アニメーションループ停止（content フェーズは React に委譲）
        return;
      }

      ctx.globalAlpha = 1;
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [config, durations, logoSrc, setPhase]);

  if (reducedMotionRef.current) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="ビッグバン シネマティック演出"
      className="fixed inset-0 z-0"
    />
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/teaser/BigBangCanvas.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/teaser/BigBangCanvas.tsx src/components/teaser/BigBangCanvas.test.tsx
git commit -m "feat(teaser): BigBangCanvas Canvas 2D エンジンを追加"
```

---

## Task 9: BigBangWebGL コンポーネント（WebGL エンジン）

**Files:**
- Create: `src/components/teaser/BigBangWebGL.tsx`
- Create: `src/components/teaser/BigBangWebGL.test.tsx`

- [ ] **Step 1: R3F 関連パッケージをインストール**

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

- [ ] **Step 2: テストを作成**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BigBangWebGL } from "./BigBangWebGL";
import type { BigBangConfig } from "./types";

// R3F は jsdom では動作しないため、dynamic import をモックし
// WebGL 未対応時のフォールバック動作をテストする
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({ size: { width: 1440, height: 900 } })),
}));

vi.mock("@react-three/drei", () => ({
  useTexture: vi.fn(() => ({
    image: { width: 100, height: 200 },
  })),
}));

describe("BigBangWebGL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const defaultConfig: BigBangConfig = {
    explosionStyle: "physics",
    duration: "medium",
  };

  it("R3F Canvas コンテナがレンダリングされる", () => {
    render(
      <BigBangWebGL
        config={defaultConfig}
        onPhaseChange={vi.fn()}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "ビッグバン シネマティック演出");
  });

  it("マウント時に onPhaseChange が dark で呼ばれる", () => {
    const onPhaseChange = vi.fn();

    render(
      <BigBangWebGL
        config={defaultConfig}
        onPhaseChange={onPhaseChange}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    expect(onPhaseChange).toHaveBeenCalledWith("dark");
  });

  it("prefers-reduced-motion 時は content に直接遷移する", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onPhaseChange = vi.fn();

    render(
      <BigBangWebGL
        config={defaultConfig}
        onPhaseChange={onPhaseChange}
        logoSrc="/logos/tate-neon-hybrid.svg"
      />
    );

    expect(onPhaseChange).toHaveBeenCalledWith("content");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
npx vitest run src/components/teaser/BigBangWebGL.test.tsx
```

Expected: FAIL

- [ ] **Step 4: BigBangWebGL.tsx を実装**

React Three Fiber で同じ5フェーズのアニメーションを実装。Canvas版と同じ `BigBangEngineProps` インターフェースに準拠。Points でパーティクル、カスタムシェーダーで衝撃波とグロウ。

```typescript
"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { BigBangEngineProps, AnimationPhase } from "./types";
import { DURATION_MS } from "./types";

function getExplosionColors(style: BigBangEngineProps["config"]["explosionStyle"]): THREE.Color[] {
  switch (style) {
    case "physics":
      return [new THREE.Color("#ffffff"), new THREE.Color("#c8dcff"), new THREE.Color("#a0b8e0")];
    case "neon":
      return [new THREE.Color("#F6FF54"), new THREE.Color("#306EC3"), new THREE.Color("#11317B")];
    case "minimal":
      return [new THREE.Color("#E6E6E6"), new THREE.Color("#cccccc"), new THREE.Color("#aaaaaa")];
  }
}

interface SceneProps {
  config: BigBangEngineProps["config"];
  onPhaseChange: (phase: AnimationPhase) => void;
  logoSrc: string;
}

function BigBangScene({ config, onPhaseChange, logoSrc }: SceneProps) {
  const { size } = useThree();
  const phaseRef = useRef<AnimationPhase>("dark");
  const startTimeRef = useRef<number>(-1);
  const durations = DURATION_MS[config.duration];

  const isMobile = size.width < 768;
  const starCount = isMobile ? 80 : 200;
  const explosionCount = isMobile ? 300 : 800;

  const colors = useMemo(() => getExplosionColors(config.explosionStyle), [config.explosionStyle]);

  // Stars geometry
  const starsGeo = useMemo(() => {
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5;
      sizes[i] = Math.random() * 2 + 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [starCount]);

  // Explosion particles geometry
  const explosionGeo = useMemo(() => {
    const positions = new Float32Array(explosionCount * 3);
    const velocities = new Float32Array(explosionCount * 3);
    const colorArr = new Float32Array(explosionCount * 3);
    const lifetimes = new Float32Array(explosionCount);

    for (let i = 0; i < explosionCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (Math.random() * 4 + 1) * (config.explosionStyle === "minimal" ? 0.5 : 1);
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed * 0.3;

      const c = colors[Math.floor(Math.random() * colors.length)];
      colorArr[i * 3] = c.r;
      colorArr[i * 3 + 1] = c.g;
      colorArr[i * 3 + 2] = c.b;

      lifetimes[i] = 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));
    geo.setAttribute("lifetime", new THREE.BufferAttribute(lifetimes, 1));
    return geo;
  }, [explosionCount, colors, config.explosionStyle]);

  // Shockwave ring
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const starsRef = useRef<THREE.Points>(null);
  const explosionRef = useRef<THREE.Points>(null);
  const logoRef = useRef<THREE.Mesh>(null);

  // Logo texture
  const logoTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return loader.load(logoSrc);
  }, [logoSrc]);

  const setPhase = useCallback(
    (phase: AnimationPhase) => {
      if (phaseRef.current !== phase) {
        phaseRef.current = phase;
        onPhaseChange(phase);
      }
    },
    [onPhaseChange]
  );

  useFrame((state) => {
    if (startTimeRef.current < 0) {
      startTimeRef.current = state.clock.elapsedTime;
      setPhase("dark");
    }

    const elapsed = (state.clock.elapsedTime - startTimeRef.current) * 1000;
    const { dark, converge, explode, logo } = durations;

    if (elapsed < dark) {
      setPhase("dark");
      // 星の瞬き
      if (starsRef.current) {
        const positions = starsGeo.getAttribute("position") as THREE.BufferAttribute;
        starsRef.current.material = new THREE.PointsMaterial({
          color: "#ffffff",
          size: 0.05,
          transparent: true,
          opacity: 0.5 + Math.sin(elapsed * 0.003) * 0.2,
        });
      }
    } else if (elapsed < dark + converge) {
      setPhase("converge");
      const progress = (elapsed - dark) / converge;
      const eased = progress * progress;

      if (starsRef.current) {
        const positions = starsGeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < starCount; i++) {
          const ox = positions.array[i * 3];
          const oy = positions.array[i * 3 + 1];
          positions.setXYZ(i, ox * (1 - eased), oy * (1 - eased), positions.array[i * 3 + 2] * (1 - eased));
        }
        positions.needsUpdate = true;
      }
    } else if (elapsed < dark + converge + explode) {
      setPhase("explode");
      const progress = (elapsed - dark - converge) / explode;

      // 星を非表示
      if (starsRef.current) starsRef.current.visible = false;

      // 爆発パーティクル更新
      if (explosionRef.current) {
        explosionRef.current.visible = true;
        const pos = explosionGeo.getAttribute("position") as THREE.BufferAttribute;
        const vel = explosionGeo.getAttribute("velocity") as THREE.BufferAttribute;
        const life = explosionGeo.getAttribute("lifetime") as THREE.BufferAttribute;

        for (let i = 0; i < explosionCount; i++) {
          pos.setXYZ(
            i,
            pos.array[i * 3] + vel.array[i * 3] * 0.016,
            pos.array[i * 3 + 1] + vel.array[i * 3 + 1] * 0.016,
            pos.array[i * 3 + 2] + vel.array[i * 3 + 2] * 0.016
          );
          vel.setXYZ(i, vel.array[i * 3] * 0.98, vel.array[i * 3 + 1] * 0.98, vel.array[i * 3 + 2] * 0.98);
          life.setX(i, Math.max(0, life.array[i] - 0.008));
        }
        pos.needsUpdate = true;
        vel.needsUpdate = true;
        life.needsUpdate = true;
      }

      // 衝撃波
      if (shockwaveRef.current && config.explosionStyle !== "minimal") {
        shockwaveRef.current.visible = true;
        shockwaveRef.current.scale.setScalar(progress * 8);
        (shockwaveRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
      }
    } else if (elapsed < dark + converge + explode + logo) {
      setPhase("logo");
      const progress = (elapsed - dark - converge - explode) / logo;
      const eased = 1 - Math.pow(1 - progress, 3);

      if (shockwaveRef.current) shockwaveRef.current.visible = false;

      // ロゴ表示
      if (logoRef.current) {
        logoRef.current.visible = true;
        logoRef.current.scale.setScalar(eased * 2);
        (logoRef.current.material as THREE.MeshBasicMaterial).opacity = eased;
      }
    } else {
      setPhase("content");
    }
  });

  return (
    <>
      <color attach="background" args={["#000000"]} />

      {/* Stars */}
      <points ref={starsRef} geometry={starsGeo}>
        <pointsMaterial color="#ffffff" size={0.05} transparent opacity={0.5} />
      </points>

      {/* Explosion particles */}
      <points ref={explosionRef} geometry={explosionGeo} visible={false}>
        <pointsMaterial
          size={0.08}
          transparent
          vertexColors
          blending={config.explosionStyle === "neon" ? THREE.AdditiveBlending : THREE.NormalBlending}
        />
      </points>

      {/* Shockwave ring */}
      <mesh ref={shockwaveRef} visible={false}>
        <ringGeometry args={[0.95, 1, 64]} />
        <meshBasicMaterial color={colors[0]} transparent opacity={1} side={THREE.DoubleSide} />
      </mesh>

      {/* Logo plane */}
      <mesh ref={logoRef} visible={false}>
        <planeGeometry args={[2, 4]} />
        <meshBasicMaterial map={logoTexture} transparent opacity={0} />
      </mesh>

      <ambientLight intensity={0.1} />
    </>
  );
}

export function BigBangWebGL({ config, onPhaseChange, logoSrc }: BigBangEngineProps) {
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mql.matches;
    if (mql.matches) {
      onPhaseChange("content");
    }
  }, [onPhaseChange]);

  if (reducedMotionRef.current) {
    return null;
  }

  return (
    <div
      role="img"
      aria-label="ビッグバン シネマティック演出"
      className="fixed inset-0 z-0"
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <BigBangScene config={config} onPhaseChange={onPhaseChange} logoSrc={logoSrc} />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
npx vitest run src/components/teaser/BigBangWebGL.test.tsx
```

Expected: 3 tests PASS

- [ ] **Step 6: コミット**

```bash
git add src/components/teaser/BigBangWebGL.tsx src/components/teaser/BigBangWebGL.test.tsx package.json package-lock.json
git commit -m "feat(teaser): BigBangWebGL WebGL (R3F) エンジンを追加"
```

---

## Task 10: page.tsx オーケストレーター書き換え

**Files:**
- Modify: `src/app/teaser/page.tsx`
- Create: `src/app/teaser/page.test.tsx`

- [ ] **Step 1: テストを作成**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TeaserPage from "./page";

// BigBang エンジンをモック
vi.mock("@/components/teaser/BigBangCanvas", () => ({
  BigBangCanvas: ({ onPhaseChange }: { onPhaseChange: (phase: string) => void }) => {
    // マウント直後に content フェーズに遷移（テスト用に即完了）
    setTimeout(() => onPhaseChange("content"), 0);
    return <canvas data-testid="canvas-engine" />;
  },
}));

vi.mock("@/components/teaser/BigBangWebGL", () => ({
  BigBangWebGL: ({ onPhaseChange }: { onPhaseChange: (phase: string) => void }) => {
    setTimeout(() => onPhaseChange("content"), 0);
    return <div data-testid="webgl-engine" />;
  },
}));

describe("TeaserPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T00:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初期状態で Canvas エンジンが表示される", () => {
    render(<TeaserPage />);
    expect(screen.getByTestId("canvas-engine")).toBeInTheDocument();
  });

  it("演出完了後にティザーコンテンツが表示される", async () => {
    render(<TeaserPage />);

    // onPhaseChange("content") を待つ
    await vi.advanceTimersByTimeAsync(10);

    expect(screen.getByText("2026.4.18 OPEN")).toBeInTheDocument();
  });

  it("EngineSwitch でエンジンを切り替えられる", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TeaserPage />);

    const webglBtn = screen.getByRole("button", { name: /webgl/i });
    await user.click(webglBtn);

    expect(screen.getByTestId("webgl-engine")).toBeInTheDocument();
  });

  it("EngineSwitch が表示される", () => {
    render(<TeaserPage />);

    expect(screen.getByRole("button", { name: /canvas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /physics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("カスタムカーソルが表示される", () => {
    render(<TeaserPage />);

    const container = screen.getByTestId("teaser-page");
    expect(container).toHaveClass("cursor-none");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/app/teaser/page.test.tsx
```

Expected: FAIL

- [ ] **Step 3: page.tsx を書き換え**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { BigBangCanvas } from "@/components/teaser/BigBangCanvas";
import { BigBangWebGL } from "@/components/teaser/BigBangWebGL";
import { TeaserContent } from "@/components/teaser/TeaserContent";
import { EngineSwitch } from "@/components/teaser/EngineSwitch";
import { useAnimationPhase } from "@/hooks/useAnimationPhase";
import type { AnimationPhase, BigBangConfig } from "@/components/teaser/types";

type EngineType = "canvas" | "webgl";

const LOGO_SRC = "/logos/tate-neon-hybrid.svg";

export default function TeaserPage() {
  const [engine, setEngine] = useState<EngineType>("canvas");
  const [config, setConfig] = useState<BigBangConfig>({
    explosionStyle: "physics",
    duration: "medium",
  });
  const { phase, setPhase, reset } = useAnimationPhase(config);

  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });

  useEffect(() => {
    const handler = (e: MouseEvent) =>
      setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const handlePhaseChange = useCallback(
    (newPhase: AnimationPhase) => {
      setPhase(newPhase);
    },
    [setPhase]
  );

  const handleReplay = useCallback(() => {
    reset();
  }, [reset]);

  const handleEngineChange = useCallback((newEngine: EngineType) => {
    setEngine(newEngine);
  }, []);

  const handleConfigChange = useCallback((newConfig: BigBangConfig) => {
    setConfig(newConfig);
  }, []);

  const EngineComponent = engine === "webgl" ? BigBangWebGL : BigBangCanvas;

  return (
    <div
      data-testid="teaser-page"
      className="relative min-h-screen bg-[#000000] overflow-x-hidden cursor-none"
    >
      {/* Custom cursor */}
      <motion.div
        className="fixed pointer-events-none z-[100] mix-blend-difference"
        animate={{ x: cursorPos.x - 16, y: cursorPos.y - 16 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
      >
        <div className="w-8 h-8 rounded-full border border-[#E6E6E6]/50" />
      </motion.div>

      {/* Grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none z-[2]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      {/* BigBang Engine */}
      {phase !== "content" && (
        <EngineComponent
          config={config}
          onPhaseChange={handlePhaseChange}
          logoSrc={LOGO_SRC}
        />
      )}

      {/* Teaser Content — shown after animation completes */}
      {phase === "content" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Ambient lighting */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#306EC3]/[0.06] rounded-full blur-[200px]" />
            <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#11317B]/[0.05] rounded-full blur-[150px]" />
          </div>

          <TeaserContent logoSrc={LOGO_SRC} />
        </motion.div>
      )}

      {/* Engine Switch — development comparison UI */}
      <EngineSwitch
        engine={engine}
        config={config}
        onEngineChange={handleEngineChange}
        onConfigChange={handleConfigChange}
        onReplay={handleReplay}
      />
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/app/teaser/page.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 5: 全テストが通ることを確認**

```bash
npx vitest run
```

Expected: 全テスト PASS

- [ ] **Step 6: 開発サーバーで動作確認**

```bash
npm run dev
```

ブラウザで http://localhost:3000/teaser を開き、以下を確認:
- 宇宙→爆発→ロゴの演出が再生される
- 演出完了後にカウントダウン等のコンテンツが表示される
- 右下の EngineSwitch で切り替えが機能する
- REPLAY ボタンで再生される

- [ ] **Step 7: コミット**

```bash
git add src/app/teaser/page.tsx src/app/teaser/page.test.tsx
git commit -m "feat(teaser): page.tsx をシネマティックイントロのオーケストレーターに書き換え"
```

---

## Task 11: ビルド確認と最終チェック

**Files:**
- なし（確認のみ）

- [ ] **Step 1: TypeScript 型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 2: Lint チェック**

```bash
npm run lint
```

Expected: エラーなし

- [ ] **Step 3: 全テスト実行**

```bash
npx vitest run
```

Expected: 全テスト PASS

- [ ] **Step 4: ビルド確認**

```bash
npm run build
```

Expected: ビルド成功

- [ ] **Step 5: コミット（修正があった場合のみ）**

ビルドや型チェックで問題が見つかった場合は修正してコミット:

```bash
git add -A
git commit -m "fix(teaser): ビルドエラー・型エラーを修正"
```
