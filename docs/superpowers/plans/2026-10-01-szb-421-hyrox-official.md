# /hyrox 公式トレーニングクラブ認定+体験会セクション 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /hyrox の Hero 直下に、HYROX 公式トレーニングクラブ認定と体験会(料金・所要時間・次回開催日・申込直リンク)を示すセクションを足す。

**Architecture:** 確定開催日を定数(`HYROX_TRIAL_DATES`)に持ち、サーバーコンポーネント `HyroxContent` が JST で「今日以降」だけを選んで props で `HyroxTrial`(クライアント)に渡す。料金・分数は既存の `HYROX_LESSON_PRICES.trial`(`buildHyroxDescriptionValues` 経由)を単一ソースにする。

**Tech Stack:** Next.js 16 / next-intl / Framer Motion / Vitest + Testing Library。依存追加なし。

設計書: `docs/superpowers/specs/2026-10-01-szb-421-hyrox-official-design.md`

## Global Constraints

- **コミット禁止**: 司令塔の「OK」が来るまで `git commit` / `git add` を実行しない(各タスクのコミット手順は置かない)。
- TypeScript `strict`、`any` 禁止、`React.FC` 禁止(関数宣言 + `XxxProps` interface)、型だけの import は `import type`。
- カバレッジ 100%。`vitest.config.ts` の除外追加・`istanbul ignore` の新規追加・`.only/.skip` は不可。
- `messages/ja.json`・`messages/en.json` は `HyroxPage.trial` の追加のみ(他キー・整形は触らない)。ja/en で同じキー構造・同じ順序(`hero` の直後)。
- 開始時刻・定員・受付開始日はサイトに書かない。Gym Finder へのリンクは入れない。
- `HyroxContent.tsx` の差分は「import 2行 + 日程計算1行 + JSX 1行」まで。`page.tsx` は触らない。
- 色は既存トークン(`text-text-light` / `text-text-gray` / `text-accent` / `bg-deep-black`)。新規デザイントークンは作らない。

---

### Task 1: 開催日の定数と「今日以降」の判定関数

**Files:**
- Create: `src/constants/hyroxTrial.ts`
- Create: `src/constants/hyroxTrial.test.ts`
- Create: `src/lib/hyroxTrialSchedule.ts`
- Create: `src/lib/hyroxTrialSchedule.test.ts`

**Interfaces:**
- Produces: `HYROX_TRIAL_DATES: readonly string[]`(`"YYYY-MM-DD"`・昇順・重複なし)/ `toJstDateString(now: Date): string` / `getUpcomingTrialDates(now?: Date, dates?: readonly string[]): readonly string[]` / `formatTrialDate(isoDate: string, locale: string): string`

- [ ] **Step 1: 失敗するテストを書く(定数)** — `src/constants/hyroxTrial.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { HYROX_TRIAL_DATES } from "./hyroxTrial";

describe("HYROX_TRIAL_DATES", () => {
  it("YYYY-MM-DD 形式で、実在する日付だけを持つ", () => {
    for (const date of HYROX_TRIAL_DATES) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const parsed = new Date(`${date}T00:00:00Z`);
      expect(parsed.toISOString().slice(0, 10)).toBe(date);
    }
  });

  it("昇順で重複がない", () => {
    const sorted = [...HYROX_TRIAL_DATES].sort();
    expect([...HYROX_TRIAL_DATES]).toEqual(sorted);
    expect(new Set(HYROX_TRIAL_DATES).size).toBe(HYROX_TRIAL_DATES.length);
  });
});
```

- [ ] **Step 2: 失敗するテストを書く(判定関数と整形)** — `src/lib/hyroxTrialSchedule.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  formatTrialDate,
  getUpcomingTrialDates,
  toJstDateString,
} from "./hyroxTrialSchedule";

const DATES = ["2026-10-04", "2026-10-17", "2026-10-18"] as const;

describe("toJstDateString", () => {
  it("UTC 14:59 は同日の JST、15:00 は翌日の JST になる", () => {
    expect(toJstDateString(new Date("2026-10-03T14:59:59Z"))).toBe("2026-10-03");
    expect(toJstDateString(new Date("2026-10-03T15:00:00Z"))).toBe("2026-10-04");
  });
});

describe("getUpcomingTrialDates", () => {
  it("前日(JST 23:59)は全件を返す", () => {
    const now = new Date("2026-10-03T14:59:59Z");
    expect(getUpcomingTrialDates(now, DATES)).toEqual([...DATES]);
  });

  it("当日(JST 0:00 と 23:59)はその日を残す", () => {
    expect(
      getUpcomingTrialDates(new Date("2026-10-03T15:00:00Z"), DATES),
    ).toEqual([...DATES]);
    expect(
      getUpcomingTrialDates(new Date("2026-10-04T14:59:59Z"), DATES),
    ).toEqual([...DATES]);
  });

  it("翌日(JST 0:00)になると過ぎた日を落とす", () => {
    expect(
      getUpcomingTrialDates(new Date("2026-10-04T15:00:00Z"), DATES),
    ).toEqual(["2026-10-17", "2026-10-18"]);
  });

  it("すべて過ぎたら空配列を返す", () => {
    expect(
      getUpcomingTrialDates(new Date("2026-10-18T15:00:00Z"), DATES),
    ).toEqual([]);
  });

  it("引数を省略すると現在時刻と定数 HYROX_TRIAL_DATES で判定する", () => {
    const result = getUpcomingTrialDates();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("formatTrialDate", () => {
  it("日本語は「10月4日(日)」の形式", () => {
    expect(formatTrialDate("2026-10-04", "ja")).toBe("10月4日(日)");
  });

  it("英語は曜日・月・日の短縮形", () => {
    expect(formatTrialDate("2026-10-04", "en")).toBe("Sun, Oct 4");
  });
});
```

- [ ] **Step 3: Red を確認**

Run: `npx vitest run src/constants/hyroxTrial.test.ts src/lib/hyroxTrialSchedule.test.ts`
Expected: FAIL(モジュールが無い)

- [ ] **Step 4: 実装** — `src/constants/hyroxTrial.ts`

```ts
/**
 * HYROX 体験会の確定開催日(JST の暦日 "YYYY-MM-DD")。昇順・重複なし。
 *
 * 毎月、日程が確定したらここだけを更新する(ニュースの開催概要と一致させる)。
 * 過ぎた日は /hyrox から自動で消え、1件も残らなければ「お知らせ・LaBOLAでご確認ください」
 * の案内に切り替わる。開始時刻・定員・受付開始日は月ごとに変わるのでここには持たない。
 * 出典: ニュース hyrox-morning-trial-class-2026(2026年10月分)。
 */
export const HYROX_TRIAL_DATES: readonly string[] = [
  "2026-10-04",
  "2026-10-17",
  "2026-10-18",
  "2026-10-24",
];
```

`src/lib/hyroxTrialSchedule.ts`

```ts
import { HYROX_TRIAL_DATES } from "@/constants/hyroxTrial";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 時刻を JST の暦日 "YYYY-MM-DD" にする。閲覧者のローカル TZ に左右されない。 */
export function toJstDateString(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * JST で今日以降の開催日だけを返す。当日はその日の終わりまで残す
 * (当日の受付可否は LaBOLA が正)。ISO 日付は文字列比較で大小が決まる。
 */
export function getUpcomingTrialDates(
  now: Date = new Date(),
  dates: readonly string[] = HYROX_TRIAL_DATES,
): readonly string[] {
  const today = toJstDateString(now);
  return dates.filter((date) => date >= today);
}

/**
 * 暦日 "YYYY-MM-DD" を表示用に整形する。暦日そのものを UTC で整形するので
 * 実行環境のタイムゾーンで日付がずれない。ja は「10月4日(日)」、en は「Sun, Oct 4」。
 */
export function formatTrialDate(isoDate: string, locale: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (locale === "ja") {
    const weekday = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "UTC",
      weekday: "short",
    }).format(date);
    return `${month}月${day}日(${weekday})`;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}
```

- [ ] **Step 5: Green を確認**

Run: `npx vitest run src/constants/hyroxTrial.test.ts src/lib/hyroxTrialSchedule.test.ts`
Expected: PASS

---

### Task 2: 文言(ja・en)

**Files:**
- Modify: `messages/ja.json`(`HyroxPage.hero` の直後に `trial` を追加)
- Modify: `messages/en.json`(同じ位置)
- Test: 既存 `src/i18n/hyroxMessages.test.ts`(ja/en のキー構造一致)

**Interfaces:**
- Produces: `HyroxPage.trial.{title,titleJa,certified,cardTitle,cardMeta,cardDescription,cardNote,nextLabel,noSchedule,reserveCta,newTab,newsCta}`。`cardMeta` は ICU の `{minutes}`・`{price}` を持つ。

- [ ] **Step 1: 失敗するテストを足す** — `src/i18n/hyroxMessages.test.ts` の既存 describe の末尾に追加

```ts
  it("HyroxPage.trial は ja/en とも同じキーを持ち、cardMeta に差し込み口がある", () => {
    const jaTrial = (ja as unknown as { HyroxPage: { trial: Record<string, string> } })
      .HyroxPage.trial;
    const enTrial = (en as unknown as { HyroxPage: { trial: Record<string, string> } })
      .HyroxPage.trial;
    expect(Object.keys(enTrial)).toEqual(Object.keys(jaTrial));
    expect(jaTrial.cardMeta).toContain("{minutes}");
    expect(jaTrial.cardMeta).toContain("{price}");
    expect(enTrial.cardMeta).toContain("{minutes}");
    expect(enTrial.cardMeta).toContain("{price}");
  });
```

- [ ] **Step 2: Red を確認**

Run: `npx vitest run src/i18n/hyroxMessages.test.ts`
Expected: FAIL(`trial` が undefined)

- [ ] **Step 3: 文言を足す** — `messages/ja.json` の `"HyroxPage": { "hero": {...},` の直後に挿入

```json
    "trial": {
      "title": "OFFICIAL",
      "titleJa": "HYROX公式トレーニングクラブ認定・体験会",
      "certified": "THE PICKLE BANG THEORY は、2026年8月にHYROX公式トレーニングクラブ（HYROX Training Club）に認定されました。HYROX公式トレーニングジムとして、公式8種目に対応した器具を常設しています。",
      "cardTitle": "HYROX体験会",
      "cardMeta": "{minutes}分・{price}",
      "cardDescription": "HYROXが初めての方向けの体験会です。HYROXの種目と器具の使い方を、スタッフが一通りご案内します。",
      "cardNote": "ランニングシューズとトレーニングウェアをご持参ください（レンタルはありません）。",
      "nextLabel": "次回の開催日",
      "noSchedule": "次回の日程は、お知らせ・LaBOLAでご確認ください。",
      "reserveCta": "体験会を予約する",
      "newTab": "（新しいタブで開きます）",
      "newsCta": "認定のお知らせを読む"
    },
```

`messages/en.json` の同じ位置

```json
    "trial": {
      "title": "OFFICIAL",
      "titleJa": "Official HYROX Training Club & trial session",
      "certified": "THE PICKLE BANG THEORY was certified as an official HYROX Training Club in August 2026. As an official HYROX training gym, we have equipment for all eight official stations installed year-round.",
      "cardTitle": "HYROX Trial Session",
      "cardMeta": "{minutes} min · {price}",
      "cardDescription": "For first-timers. Our staff walk you through the HYROX stations and how to use the equipment.",
      "cardNote": "Please bring running shoes and training wear (rentals are not available).",
      "nextLabel": "Next session dates",
      "noSchedule": "Next dates will be announced in our news and on LaBOLA.",
      "reserveCta": "Book a trial session",
      "newTab": "(opens in a new tab)",
      "newsCta": "Read the certification announcement"
    },
```

- [ ] **Step 4: Green を確認**

Run: `npx vitest run src/i18n/hyroxMessages.test.ts`
Expected: PASS(既存の「HyroxPage のキー構造が一致」も PASS のまま)

---

### Task 3: `HyroxTrial` コンポーネント

**Files:**
- Create: `src/components/hyrox/HyroxTrial.tsx`
- Create: `src/components/hyrox/HyroxTrial.test.tsx`

**Interfaces:**
- Consumes: `formatTrialDate(isoDate, locale)`(Task 1)/ `HyroxPage.trial.*`(Task 2)/ `buildHyroxDescriptionValues(locale)`(既存、`trialMinutes`・`trialPrice`)/ `LABOLA_SCHOOL_URL`・`EXTERNAL_LINK_PROPS`(`@/constants/site`)/ `trackCtaClick`・`trackLabolaEntry`(`@/lib/analytics/trackEvent`)/ `TrackedLink`
- Produces: `default function HyroxTrial({ upcomingDates }: HyroxTrialProps)`、`interface HyroxTrialProps { upcomingDates: readonly string[] }`

- [ ] **Step 1: 失敗するテストを書く** — `src/components/hyrox/HyroxTrial.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { HYROX_LESSON_PRICES } from "@/constants/pricing";
import { EXTERNAL_LINK_PROPS, LABOLA_SCHOOL_URL } from "@/constants/site";
import HyroxTrial from "./HyroxTrial";

import type React from "react";

const trackCtaClick = vi.fn();
const trackLabolaEntry = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
  trackLabolaEntry: (...args: unknown[]) => trackLabolaEntry(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

beforeEach(() => {
  trackCtaClick.mockClear();
  trackLabolaEntry.mockClear();
});

const DATES = ["2026-10-17", "2026-10-18"];

describe("HyroxTrial", () => {
  it("h2 に英語見出しと日本語(公式トレーニングクラブ認定・体験会)を含む", () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "OFFICIAL HYROX公式トレーニングクラブ認定・体験会",
      }),
    ).toBeInTheDocument();
  });

  it("2026年8月にトレーニングクラブへ認定された旨と、公式トレーニングジムの併記がある", () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    const text = screen.getByText(/2026年8月にHYROX公式トレーニングクラブ/);
    expect(text).toHaveTextContent("HYROX Training Club");
    expect(text).toHaveTextContent("公式トレーニングジム");
  });

  it("体験会の分数と料金は HYROX_LESSON_PRICES.trial と一致する", () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    const { minutes, priceYen } = HYROX_LESSON_PRICES.trial;
    expect(
      screen.getByText(`${minutes}分・${priceYen.toLocaleString("ja-JP")}円`),
    ).toBeInTheDocument();
  });

  it("持ち物(ランニングシューズ・トレーニングウェア、レンタルなし)を案内する", () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    expect(screen.getByText(/ランニングシューズ/)).toHaveTextContent(
      "レンタルはありません",
    );
  });

  it("次回の開催日を time 要素のリストで表示する", () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    expect(screen.getByText("次回の開催日")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("10月17日(土)");
    expect(items[1]).toHaveTextContent("10月18日(日)");
    expect(items[0].querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-17",
    );
    expect(
      screen.queryByText("次回の日程は、お知らせ・LaBOLAでご確認ください。"),
    ).not.toBeInTheDocument();
  });

  it("開催日が0件のときは、お知らせ・LaBOLA への案内に切り替わる", () => {
    renderWithIntl(<HyroxTrial upcomingDates={[]} />);
    expect(
      screen.getByText("次回の日程は、お知らせ・LaBOLAでご確認ください。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("次回の開催日")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("予約 CTA は LaBOLA のクラス・スクール一覧へ別タブで直リンクし、計測を送る", async () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    const link = screen.getByRole("link", { name: /体験会を予約する/ });
    expect(link).toHaveAttribute("href", LABOLA_SCHOOL_URL);
    expect(link).toHaveAttribute("target", EXTERNAL_LINK_PROPS.target);
    expect(link).toHaveAttribute("rel", EXTERNAL_LINK_PROPS.rel);
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reservation",
      "hyrox_trial",
      "体験会を予約する",
    );
    expect(trackLabolaEntry).toHaveBeenCalledWith("program");
  });

  it("認定のお知らせへ内部リンクし、content_click を送る", async () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    const link = screen.getByRole("link", { name: "認定のお知らせを読む" });
    expect(link).toHaveAttribute("href", "/news/hyrox-official-training-gym");
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_trial_news",
      "hyrox-official-training-gym",
    );
  });

  it("Gym Finder へのリンクを含まない(#420 完了まで張らない)", () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.includes("hyrox-training-finder"))).toBe(
      false,
    );
  });

  it("英語表示では英語の文言・日付になり、日本語のみのお知らせリンクは出さない", () => {
    renderWithIntl(<HyroxTrial upcomingDates={DATES} />, { locale: "en" });
    expect(screen.getByText("50 min · ¥3,000")).toBeInTheDocument();
    expect(screen.getByText("Sun, Oct 18")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Book a trial session/ }),
    ).toHaveAttribute("href", LABOLA_SCHOOL_URL);
    expect(
      screen.queryByRole("link", { name: "Read the certification announcement" }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Red を確認**

Run: `npx vitest run src/components/hyrox/HyroxTrial.test.tsx`
Expected: FAIL(`./HyroxTrial` が無い)

- [ ] **Step 3: 実装** — `src/components/hyrox/HyroxTrial.tsx`

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { EASE, revealInitial } from "@/constants/motion";
import { EXTERNAL_LINK_PROPS, LABOLA_SCHOOL_URL } from "@/constants/site";
import { trackCtaClick, trackLabolaEntry } from "@/lib/analytics/trackEvent";
import { formatTrialDate } from "@/lib/hyroxTrialSchedule";
import { buildHyroxDescriptionValues } from "@/lib/metadata/hyroxDescriptionValues";
import HyroxSectionTitle from "./HyroxSectionTitle";

// 公式トレーニングクラブ認定のお知らせ (microCMS slug)。日本語のみの記事。
const OFFICIAL_NEWS_SLUG = "hyrox-official-training-gym";

interface HyroxTrialProps {
  /** JST で今日以降の確定開催日("YYYY-MM-DD")。サーバー側で絞り込んで渡す。 */
  upcomingDates: readonly string[];
}

export default function HyroxTrial({ upcomingDates }: HyroxTrialProps) {
  const t = useTranslations("HyroxPage.trial");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const { trialMinutes, trialPrice } = buildHyroxDescriptionValues(locale);
  const reserveLabel = t("reserveCta");

  const handleReserveClick = () => {
    trackCtaClick("reservation", "hyrox_trial", reserveLabel);
    trackLabolaEntry("program");
  };

  return (
    <section className="bg-deep-black py-12 lg:py-16">
      <motion.div
        className="mx-auto max-w-4xl px-6 lg:px-12"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <div className="text-center">
          <HyroxSectionTitle title={t("title")} titleJa={t("titleJa")} />
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-loose text-text-gray lg:text-base">
            {t("certified")}
          </p>
        </div>

        <div className="mt-10 rounded-sm border border-accent/40 border-t-2 border-t-accent bg-white/[0.02] p-6 text-center sm:p-8">
          <h3 className="font-sans text-xl font-black tracking-wide text-text-light sm:text-2xl">
            {t("cardTitle")}
          </h3>
          <p className="mt-2 text-lg font-bold text-accent">
            {t("cardMeta", { minutes: trialMinutes, price: trialPrice })}
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-light/75">
            {t("cardDescription")}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-text-gray">
            {t("cardNote")}
          </p>

          {upcomingDates.length > 0 ? (
            <div className="mt-6">
              <p className="text-xs tracking-[0.2em] text-text-gray">
                {t("nextLabel")}
              </p>
              <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm font-bold text-text-light">
                {upcomingDates.map((date) => (
                  <li key={date}>
                    <time dateTime={date}>{formatTrialDate(date, locale)}</time>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-6 text-sm text-text-gray">{t("noSchedule")}</p>
          )}

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
            <a
              href={LABOLA_SCHOOL_URL}
              {...EXTERNAL_LINK_PROPS}
              onClick={handleReserveClick}
              className="inline-flex w-full items-center justify-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold tracking-[0.15em] text-deep-black transition-all hover:gap-3 hover:bg-accent/90 sm:w-auto sm:py-4"
            >
              {reserveLabel}
              <span aria-hidden="true">→</span>
              <span className="sr-only">{t("newTab")}</span>
            </a>
            {locale === "ja" ? (
              <TrackedLink
                href={`/news/${OFFICIAL_NEWS_SLUG}`}
                eventKey="contentClick"
                location="hyrox_trial_news"
                label={OFFICIAL_NEWS_SLUG}
                className="text-sm text-accent underline underline-offset-4 transition-colors hover:text-accent/80"
              >
                {t("newsCta")}
              </TrackedLink>
            ) : null}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 4: Green を確認**

Run: `npx vitest run src/components/hyrox/HyroxTrial.test.tsx`
Expected: PASS(落ちた場合はテストの文言一致を実際の出力に合わせて実装側を直す。テスト側の期待値は変えない)

---

### Task 4: `HyroxContent` に差し込む

**Files:**
- Modify: `src/app/[locale]/hyrox/HyroxContent.tsx`
- Modify: `src/app/[locale]/hyrox/HyroxContent.test.tsx`

**Interfaces:**
- Consumes: `getUpcomingTrialDates()`(Task 1)/ `HyroxTrial`(Task 3)

- [ ] **Step 1: 失敗するテストを足す** — `HyroxContent.test.tsx` のモック群に追加し、describe に2件足す

モック(`import HyroxContent` の前、既存の `vi.mock` 群の末尾に追加):

```tsx
vi.mock("@/lib/hyroxTrialSchedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hyroxTrialSchedule")>();
  return { ...actual, getUpcomingTrialDates: () => ["2026-10-17"] };
});
```

テスト(describe 末尾):

```tsx
  it("HyroxTrial が Hero の直後・Facility の前に並ぶ", () => {
    renderWithIntl(<HyroxContent />);
    const hero = screen.getByRole("heading", { level: 1, name: /^HYROX/ });
    const trial = screen.getByRole("heading", {
      level: 2,
      name: /HYROX公式トレーニングクラブ認定・体験会/,
    });
    const facility = screen.getByTestId("facility");
    expect(
      hero.compareDocumentPosition(trial) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      trial.compareDocumentPosition(facility) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("サーバー側で絞った開催日を HyroxTrial に渡す", () => {
    renderWithIntl(<HyroxContent />);
    expect(screen.getByText("10月17日(土)")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Red を確認**

Run: `npx vitest run "src/app/[locale]/hyrox/HyroxContent.test.tsx"`
Expected: FAIL(HyroxTrial が未配置)

- [ ] **Step 3: 実装** — `HyroxContent.tsx`

import を追加(既存 `HyroxPicklePromo` の import の下):

```tsx
import HyroxTrial from "@/components/hyrox/HyroxTrial";
import { getUpcomingTrialDates } from "@/lib/hyroxTrialSchedule";
```

関数本体(`const showColumns` の下に1行):

```tsx
  const upcomingTrialDates = getUpcomingTrialDates();
```

JSX(`<HyroxHero />` の直後に1行):

```tsx
        <HyroxTrial upcomingDates={upcomingTrialDates} />
```

- [ ] **Step 4: Green を確認**

Run: `npx vitest run "src/app/[locale]/hyrox/HyroxContent.test.tsx"`
Expected: PASS

---

### Task 5: 全体検証と証跡

**Files:** なし(検証のみ)。証跡: `.superpowers/evidence/szb-421/`(gitignore 済み)

- [ ] **Step 1: 全体検証**

Run: `npm run test:coverage 2>&1 | tail -40` → 全テスト PASS・カバレッジ 100%・閾値エラーなし
Run: `npm run lint` → エラー 0
Run: `npx tsc --noEmit` → エラー 0
Run: `npm run build` → 成功(/hyrox が静的/ISR で生成される)

- [ ] **Step 2: dev サーバーで目視確認**

Run: `cp /Users/tsutsumi.akihiro/dev/bigban/.env.local ./.env.local`(中身を表示しない)→ `npx next dev -p 3210`(バックグラウンド)
`http://localhost:3210/hyrox` を 375px と 1440px でスクリーンショット(Hero 直下・セクション全体)。日程あり状態と、`HYROX_TRIAL_DATES` を一時的に空にした0件状態の両方。`/en/hyrox` も1枚。撮影後に定数を元へ戻し、`git diff` で戻っていることを確認する。
保存: `.superpowers/evidence/szb-421/{trial-ja-375,trial-ja-1440,trial-empty-375,trial-en-375}.png`

- [ ] **Step 3: 司令塔へ確認依頼**(コミットはしない)
