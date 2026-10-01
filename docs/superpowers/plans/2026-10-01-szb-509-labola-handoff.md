# szb-509 LaBOLA への渡し方の改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /reserve の予約ボタンを「今日の LaBOLA 1日表示」へつなぎ、日付ボタン・ビジター予約の明記・会員登録メール未着の対処を足す。

**Architecture:** 日付計算は純関数(`quickDates.ts`)に分け、画面側は「マウント後に今日を知る」小さなフック(`useMountedNow`)で SSR と衝突させない。カードのボタン周り(メインボタン・日付ボタン・ビジター注記)は `ReserveCardActions` に集約し、`ReserveChoice` はカード定義だけを持つ。説明セクションは独立ファイル `ReserveVisitorGuide`(他 issue との衝突回避)。

**Tech Stack:** Next.js 16 App Router・next-intl・Vitest + React Testing Library。新規依存なし。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-10-01-szb-509-labola-handoff-design.md`(確定済みの方針はそちらが正)
- TDD(Red→Green→Refactor)・カバレッジ100%・`any` 禁止・`import type`・`React.FC` 禁止。`istanbul ignore` の新規追加と `vitest.config.ts` の除外追加は不可
- 日付は JST 固定でクライアント側計算。URL の月日はゼロ埋めなし(`/calendar/2026/10/5/`)
- 日付ボタン・メインボタンは `<a href target="_blank" rel="noopener noreferrer">`(`EXTERNAL_LINK_PROPS`)のまま。JS 遷移にしない(GA4 クロスドメインリンカーが `_gl` を付けるため)
- メインボタンの計測は不変: `trackCtaClick("reservation", <既存location>, <CTA文言>)` + `trackLabolaEntry(kind)`
- 日付ボタンの計測: 同じ2関数を呼び、`location` だけ `<既存location>_date_<today|tomorrow|saturday|sunday>`
- 画面に出す文言に「LaBOLA」「RESERVA」を出さない(既存テストが検証)。「予約システム」「ログイン画面」と書く
- 登録の「無料」は「会員登録(無料)」と書いてよい(オーナー確認済み)。PBT Club の登録料には触れない。段数・所要分・決済手段は書かない
- `messages/ja.json`・`messages/en.json` は新キーの追加だけ(既存キー・整形に触れない)。#506(支払い・不定休)・#511(英語ガイド)と衝突させない
- 英語は ja と同じキー構成で最小限の翻訳のみ

## File Structure

| ファイル | 責務 |
|---|---|
| `src/lib/labola/quickDates.ts`(新規) | JST の日付計算と「今日/明日/直近の土・日」の算出(純関数) |
| `src/constants/site.ts`(変更) | `labolaDayUrl` を追加 |
| `src/components/reserve/useMountedNow.ts`(新規) | マウント前は `null`、後は `Date` を返すフック |
| `src/components/reserve/ReserveCardActions.tsx`(新規) | メインボタン+日付ボタン+ビジター注記と計測 |
| `src/components/reserve/ReserveChoice.tsx`(変更) | カード定義に `tabName` を持たせ、ボタン部を `ReserveCardActions` へ委譲 |
| `src/components/reserve/ReserveVisitorGuide.tsx`(新規) | 予約のしかた+登録メール未着の注意の説明セクション |
| `src/app/[locale]/reserve/page.tsx`(変更) | ReserveHero と予約本体の間にガイドを1つ追加 |
| `messages/ja.json` `messages/en.json`(変更) | `Reserve.choice.visitorNote`/`quickDate`、`Reserve.guide`、`Reserve.faq.items` 末尾2件 |
| `docs/operations/labola-handoff-requests.md`(新規) | LaBOLA 側への確認事項(オーナーが実施) |

---

### Task 1: 日付計算と 1日表示 URL

**Files:**
- Create: `src/lib/labola/quickDates.ts`, `src/lib/labola/quickDates.test.ts`
- Modify: `src/constants/site.ts`, `src/constants/site.test.ts`

**Interfaces:**
- Produces: `toJstDate(now: Date): JstDate`、`buildQuickDates(now: Date): QuickDate[]`、型 `JstDate { year; month; day; weekday }`・`QuickDateId`・`QuickDate = JstDate & { id }`、`labolaDayUrl(tabName: string, date: { year: number; month: number; day: number }): string`

- [ ] **Step 1: 失敗するテストを書く**(`quickDates.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { buildQuickDates, toJstDate } from "./quickDates";

// 2026-10-01 は木曜。10/3=土, 10/4=日。
const at = (iso: string) => new Date(iso);

describe("toJstDate", () => {
  it("UTC 15:00 を境に JST の日付が進む", () => {
    expect(toJstDate(at("2026-09-30T14:59:59Z"))).toEqual({ year: 2026, month: 9, day: 30, weekday: 3 });
    expect(toJstDate(at("2026-09-30T15:00:00Z"))).toEqual({ year: 2026, month: 10, day: 1, weekday: 4 });
  });
});

describe("buildQuickDates", () => {
  const ids = (now: Date) => buildQuickDates(now).map((d) => d.id);
  const md = (now: Date) => buildQuickDates(now).map((d) => `${d.month}/${d.day}`);

  it("木曜: 今日・明日・土・日", () => {
    const now = at("2026-10-01T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow", "saturday", "sunday"]);
    expect(md(now)).toEqual(["10/1", "10/2", "10/3", "10/4"]);
  });

  it("金曜: 明日が土曜なので重複せず 今日・明日・日", () => {
    const now = at("2026-10-02T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow", "sunday"]);
    expect(md(now)).toEqual(["10/2", "10/3", "10/4"]);
  });

  it("土曜: 今日が土曜・明日が日曜なので 今日・明日 のみ", () => {
    const now = at("2026-10-03T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow"]);
    expect(md(now)).toEqual(["10/3", "10/4"]);
  });

  it("日曜: 今日・明日・次の土曜", () => {
    const now = at("2026-10-04T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow", "saturday"]);
    expect(md(now)).toEqual(["10/4", "10/5", "10/10"]);
  });

  it.each([
    ["月", "2026-10-05T03:00:00Z"],
    ["火", "2026-10-06T03:00:00Z"],
    ["水", "2026-10-07T03:00:00Z"],
  ])("%s曜: 4件が日付の昇順で並ぶ", (_label, iso) => {
    const dates = buildQuickDates(at(iso));
    expect(dates).toHaveLength(4);
    const keys = dates.map((d) => d.year * 10000 + d.month * 100 + d.day);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });

  it("月またぎ・年またぎでも正しい日付を返す", () => {
    expect(md(at("2026-10-31T03:00:00Z"))).toEqual(["10/31", "11/1"]);
    const nye = buildQuickDates(at("2026-12-31T03:00:00Z"));
    expect(nye.map((d) => `${d.year}-${d.month}-${d.day}`)).toEqual([
      "2026-12-31", "2027-1-1", "2027-1-2", "2027-1-3",
    ]);
  });

  it("UTC では前日でも JST の今日を基準にする", () => {
    expect(md(at("2026-09-30T16:00:00Z"))[0]).toBe("10/1");
  });
});
```

`site.test.ts` の import に `labolaDayUrl` を足し、末尾の describe に追加:

```ts
describe("labolaDayUrl", () => {
  it("月日をゼロ埋めせず、タブ名をエンコードして1日表示 URL を作る", () => {
    expect(labolaDayUrl("ピックルボールコート", { year: 2026, month: 10, day: 5 })).toBe(
      `https://yoyaku.labola.jp/r/shop/3473/calendar/2026/10/5/?tab_name=${encodeURIComponent("ピックルボールコート")}`,
    );
    expect(labolaDayUrl("H Y R O X", { year: 2026, month: 11, day: 20 })).toBe(
      "https://yoyaku.labola.jp/r/shop/3473/calendar/2026/11/20/?tab_name=H%20Y%20R%20O%20X",
    );
  });
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run src/lib/labola src/constants/site.test.ts` → FAIL(未定義)

- [ ] **Step 3: 実装**

`src/lib/labola/quickDates.ts`:

```ts
/** JST の暦日(曜日つき)。weekday は 0=日〜6=土。 */
export interface JstDate {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

export type QuickDateId = "today" | "tomorrow" | "saturday" | "sunday";

export interface QuickDate extends JstDate {
  id: QuickDateId;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function jstDateAfter(now: Date, offsetDays: number): JstDate {
  const shifted = new Date(now.getTime() + JST_OFFSET_MS + offsetDays * DAY_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** 閲覧者のタイムゾーンに関係なく、日本時間の「今日」を返す。 */
export function toJstDate(now: Date): JstDate {
  return jstDateAfter(now, 0);
}

/**
 * 日付ボタンの候補(今日・明日・直近の土・日)を日付の昇順で返す。
 * 同じ日は先に挙げた方(今日 > 明日 > 土 > 日)だけ残す。
 */
export function buildQuickDates(now: Date): QuickDate[] {
  const { weekday } = toJstDate(now);
  const candidates: { id: QuickDateId; offset: number }[] = [
    { id: "today", offset: 0 },
    { id: "tomorrow", offset: 1 },
    { id: "saturday", offset: (6 - weekday + 7) % 7 },
    { id: "sunday", offset: (7 - weekday) % 7 },
  ];
  const seenOffsets = new Set<number>();
  const unique = candidates.filter(({ offset }) => {
    if (seenOffsets.has(offset)) return false;
    seenOffsets.add(offset);
    return true;
  });
  return unique.map(({ id, offset }) => ({ id, ...jstDateAfter(now, offset) }));
}
```

`src/constants/site.ts` の `LABOLA_HYROX_URL` の直後に追加:

```ts
// 1日表示(日付指定)。LaBOLA の月日はゼロ埋めなし。tabName は labola 管理画面の
// カテゴリ名と完全一致。予約ボタンの「今日」と日付ボタンで使う。
export function labolaDayUrl(
  tabName: string,
  date: { year: number; month: number; day: number },
): string {
  return `${LABOLA_SHOP_BASE}/calendar/${date.year}/${date.month}/${date.day}/?tab_name=${encodeURIComponent(tabName)}`;
}
```

- [ ] **Step 4: 通過を確認** — 同コマンド → PASS

---

### Task 2: カードのボタン周り(日付ボタン・メインボタン・ビジター注記)

**Files:**
- Create: `src/components/reserve/useMountedNow.ts`, `useMountedNow.test.ts`, `ReserveCardActions.tsx`, `ReserveCardActions.test.tsx`
- Modify: `src/components/reserve/ReserveChoice.tsx`, `ReserveChoice.test.tsx`, `messages/ja.json`, `messages/en.json`

**Interfaces:**
- Consumes: Task 1 の `buildQuickDates`・`toJstDate`・`labolaDayUrl`
- Produces: `useMountedNow(): Date | null`、`<ReserveCardActions ctaLabel fallbackHref location labolaEntryKind? tabName? />`

メッセージ追加(`Reserve.choice` の `lessonCta` の後ろに追記。既存キーは変更しない):

ja:
```json
"visitorNote": "会員登録なしで予約できます。ログイン画面を下へスクロールして「ビジターで予約」を選んでください。",
"quickDate": {
  "heading": "日付を選んで空き状況を見る",
  "today": "今日", "tomorrow": "明日", "saturday": "土曜", "sunday": "日曜",
  "chip": "{label} {month}/{day}({weekday})",
  "weekday": { "sun": "日", "mon": "月", "tue": "火", "wed": "水", "thu": "木", "fri": "金", "sat": "土" }
}
```
en:
```json
"visitorNote": "No membership needed. On the login screen, scroll down and choose “ビジターで予約” (Book as a visitor).",
"quickDate": {
  "heading": "Pick a date to see open slots",
  "today": "Today", "tomorrow": "Tomorrow", "saturday": "Sat", "sunday": "Sun",
  "chip": "{label} {month}/{day}",
  "weekday": { "sun": "Sun", "mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu", "fri": "Fri", "sat": "Sat" }
}
```

- [ ] **Step 1: 失敗するテストを書く**

`useMountedNow.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMountedNow } from "./useMountedNow";

describe("useMountedNow", () => {
  it("最初の描画では null、マウント後に Date を返す", () => {
    const seen: (Date | null)[] = [];
    const { result } = renderHook(() => {
      const value = useMountedNow();
      seen.push(value);
      return value;
    });
    expect(seen[0]).toBeNull();
    expect(result.current).toBeInstanceOf(Date);
  });
});
```

`ReserveCardActions.test.tsx`(フックをモックして マウント前/後 を作る):
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import ReserveCardActions from "./ReserveCardActions";

const trackCtaClick = vi.fn();
const trackLabolaEntry = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
  trackLabolaEntry: (...args: unknown[]) => trackLabolaEntry(...args),
}));

const mockNow = vi.hoisted(() => ({ value: null as Date | null }));
vi.mock("./useMountedNow", () => ({ useMountedNow: () => mockNow.value }));

const FALLBACK = "https://yoyaku.labola.jp/r/shop/3473/calendar_week/?&tab_name=x";
const TAB = "ピックルボールコート";
// 2026-10-01 木曜 12:00 JST
const THURSDAY = new Date("2026-10-01T03:00:00Z");

beforeEach(() => {
  trackCtaClick.mockClear();
  trackLabolaEntry.mockClear();
  mockNow.value = null;
});

function renderCourt() {
  return renderWithIntl(
    <ReserveCardActions ctaLabel="コートの予約" fallbackHref={FALLBACK}
      location="reserve_choice_august" labolaEntryKind="rental" tabName={TAB} />,
  );
}

describe("ReserveCardActions", () => {
  it("マウント前は従来の URL を使い、日付ボタンは出さない", () => {
    renderCourt();
    expect(screen.getByRole("link", { name: /コートの予約/ })).toHaveAttribute("href", FALLBACK);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("マウント後はメインボタンが今日の1日表示になり、日付ボタンが並ぶ", () => {
    mockNow.value = THURSDAY;
    renderCourt();
    const base = `https://yoyaku.labola.jp/r/shop/3473/calendar`;
    const tab = encodeURIComponent(TAB);
    expect(screen.getByRole("link", { name: /コートの予約/ })).toHaveAttribute(
      "href", `${base}/2026/10/1/?tab_name=${tab}`);
    expect(screen.getByRole("link", { name: "今日 10/1(木)" })).toHaveAttribute(
      "href", `${base}/2026/10/1/?tab_name=${tab}`);
    expect(screen.getByRole("link", { name: "明日 10/2(金)" })).toHaveAttribute(
      "href", `${base}/2026/10/2/?tab_name=${tab}`);
    expect(screen.getByRole("link", { name: "土曜 10/3(土)" })).toHaveAttribute(
      "href", `${base}/2026/10/3/?tab_name=${tab}`);
    expect(screen.getByRole("link", { name: "日曜 10/4(日)" })).toHaveAttribute(
      "href", `${base}/2026/10/4/?tab_name=${tab}`);
    expect(screen.getByRole("group", { name: "日付を選んで空き状況を見る" })).toBeInTheDocument();
  });

  it("すべてのボタンが別タブで開く外部リンク", () => {
    mockNow.value = THURSDAY;
    renderCourt();
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("メインボタンのクリックは従来どおりの2イベントだけを送る", async () => {
    mockNow.value = THURSDAY;
    renderCourt();
    await userEvent.click(screen.getByRole("link", { name: /コートの予約/ }));
    expect(trackCtaClick).toHaveBeenCalledTimes(1);
    expect(trackCtaClick).toHaveBeenCalledWith("reservation", "reserve_choice_august", "コートの予約");
    expect(trackLabolaEntry).toHaveBeenCalledTimes(1);
    expect(trackLabolaEntry).toHaveBeenCalledWith("rental");
  });

  it("日付ボタンのクリックは location に日付種別を足して同じ2イベントを送る", async () => {
    mockNow.value = THURSDAY;
    renderCourt();
    await userEvent.click(screen.getByRole("link", { name: "明日 10/2(金)" }));
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reservation", "reserve_choice_august_date_tomorrow", "コートの予約");
    expect(trackLabolaEntry).toHaveBeenCalledWith("rental");
    expect(trackCtaClick).toHaveBeenCalledTimes(1);
    expect(trackLabolaEntry).toHaveBeenCalledTimes(1);
  });

  it("LaBOLA へ進むカードにはビジター予約の注記を出す", () => {
    renderCourt();
    expect(screen.getByText(/会員登録なしで予約できます/)).toBeInTheDocument();
  });

  it("日付指定のないカード(レッスン)は日付ボタンを出さず、1日表示にも差し替えない", () => {
    mockNow.value = THURSDAY;
    renderWithIntl(
      <ReserveCardActions ctaLabel="レッスンの予約" fallbackHref="https://example.test/school/"
        location="reserve_choice_hyrox_lesson" labolaEntryKind="program" />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /レッスンの予約/ })).toHaveAttribute(
      "href", "https://example.test/school/");
    expect(screen.getByText(/会員登録なしで予約できます/)).toBeInTheDocument();
  });

  it("LaBOLA 以外へ進むカード(イベント)は注記も日付ボタンも出さず labola 流入イベントも送らない", async () => {
    mockNow.value = THURSDAY;
    renderWithIntl(
      <ReserveCardActions ctaLabel="イベントの申込" fallbackHref="https://example.test/events"
        location="reserve_choice_pickle_event" />,
    );
    expect(screen.queryByText(/会員登録なしで予約できます/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /イベントの申込/ }));
    expect(trackCtaClick).toHaveBeenCalledWith("reservation", "reserve_choice_pickle_event", "イベントの申込");
    expect(trackLabolaEntry).not.toHaveBeenCalled();
  });

  it("英語では日付ボタンの文言と注記が英語になる", () => {
    mockNow.value = THURSDAY;
    renderWithIntl(
      <ReserveCardActions ctaLabel="Book a court" fallbackHref={FALLBACK}
        location="reserve_choice_august" labolaEntryKind="rental" tabName={TAB} />,
      { locale: "en" },
    );
    expect(screen.getByRole("link", { name: "Today 10/1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sat 10/3" })).toBeInTheDocument();
    expect(screen.getByText(/No membership needed/)).toBeInTheDocument();
  });
});
```

`ReserveChoice.test.tsx` の更新(挙動の変更に合わせる): `beforeEach` で `vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-01T03:00:00Z"))`、`afterEach` で `vi.useRealTimers()`。メインボタンの href 期待値を「今日の1日表示」(`labolaDayUrl(tabName, {2026,10,1})`)に変更(`LABOLA_PICKLEBALL_URL`/`LABOLA_HYROX_URL` との比較をやめ、`LABOLA_SCHOOL_URL` のレッスンは据え置き)。「リンク数4」の assert は日付ボタンで数が変わるため「全リンクが yoyaku.labola.jp かテニスベアで RESERVA を含まない」に置き換える。コート/HYROX エリアのカードに日付ボタンが2枚分(各4件)あること・レッスン/イベントのカードに無いことを追加する。

- [ ] **Step 2: 失敗を確認** — `npx vitest run src/components/reserve` → FAIL(コンポーネント未作成・期待値不一致)

- [ ] **Step 3: 実装**

`useMountedNow.ts`:
```ts
"use client";

import { useEffect, useState } from "react";

/**
 * マウント後に現在時刻を返す。サーバー描画とハイドレーション時は null。
 * 日付つき URL をキャッシュされたページに焼き込まないため、日付はクライアントで決める。
 */
export function useMountedNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);
  return now;
}
```

`ReserveCardActions.tsx`:
```tsx
"use client";

import { useTranslations } from "next-intl";
import { EXTERNAL_LINK_PROPS, labolaDayUrl } from "@/constants/site";
import { trackCtaClick, trackLabolaEntry } from "@/lib/analytics/trackEvent";
import { buildQuickDates, toJstDate } from "@/lib/labola/quickDates";
import type { LabolaEntryKind } from "@/lib/analytics/labolaEvents";
import { useMountedNow } from "./useMountedNow";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface ReserveCardActionsProps {
  ctaLabel: string;
  /** マウント前・日付指定なしのカードで使う URL。 */
  fallbackHref: string;
  location: string;
  /** 指定があるときだけ LaBOLA 専用の流入イベントとビジター注記を伴う。 */
  labolaEntryKind?: LabolaEntryKind;
  /** 指定があるときだけ 1日表示への差し替えと日付ボタンを出す。 */
  tabName?: string;
}

export default function ReserveCardActions({
  ctaLabel,
  fallbackHref,
  location,
  labolaEntryKind,
  tabName,
}: ReserveCardActionsProps) {
  const t = useTranslations("Reserve.choice");
  const now = useMountedNow();
  const dayView = tabName !== undefined && now !== null ? { tabName, now } : null;

  const handleClick = (clickLocation: string) => {
    trackCtaClick("reservation", clickLocation, ctaLabel);
    if (labolaEntryKind) trackLabolaEntry(labolaEntryKind);
  };

  return (
    <>
      <a
        href={dayView ? labolaDayUrl(dayView.tabName, toJstDate(dayView.now)) : fallbackHref}
        {...EXTERNAL_LINK_PROPS}
        onClick={() => handleClick(location)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold tracking-[0.15em] text-deep-black transition-all hover:gap-3 hover:bg-accent/90 sm:mt-8 sm:py-4"
      >
        {ctaLabel}
        <span aria-hidden className="text-base leading-none">
          →
        </span>
      </a>

      {dayView && (
        <div role="group" aria-label={t("quickDate.heading")} className="mt-4">
          <p className="text-[11px] tracking-[0.15em] text-text-gray">
            {t("quickDate.heading")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {buildQuickDates(dayView.now).map((date) => (
              <li key={date.id}>
                <a
                  href={labolaDayUrl(dayView.tabName, date)}
                  {...EXTERNAL_LINK_PROPS}
                  onClick={() => handleClick(`${location}_date_${date.id}`)}
                  className="inline-flex items-center border border-accent/40 px-3 py-2 text-xs font-bold tracking-wide text-text-light transition-colors hover:border-accent hover:text-accent"
                >
                  {t("quickDate.chip", {
                    label: t(`quickDate.${date.id}`),
                    month: date.month,
                    day: date.day,
                    weekday: t(`quickDate.weekday.${WEEKDAY_KEYS[date.weekday]}`),
                  })}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {labolaEntryKind && (
        <p className="mt-3 text-xs leading-relaxed text-text-gray">
          {t("visitorNote")}
        </p>
      )}
    </>
  );
}
```

`ReserveChoice.tsx`: `ChoiceCard` に `tabName?: string` を追加。`COURT_CARD` に `tabName: LABOLA_CALENDAR_TABS[0].tabName`、`HYROX_AREA_CARD` に `tabName: LABOLA_CALENDAR_TABS[1].tabName`。`ChoiceCardGrid` 内の `<a ...>…</a>` を次に置き換え、不要になった `trackCtaClick`/`trackLabolaEntry`/`EXTERNAL_LINK_PROPS` の import を削除:
```tsx
<ReserveCardActions
  ctaLabel={t(card.ctaKey)}
  fallbackHref={card.href}
  location={card.location}
  labolaEntryKind={card.labolaEntryKind}
  tabName={card.tabName}
/>
```

- [ ] **Step 4: 通過を確認** — `npx vitest run src/components/reserve` → PASS

---

### Task 3: 説明セクションと FAQ、ページへの組み込み

**Files:**
- Create: `src/components/reserve/ReserveVisitorGuide.tsx`, `ReserveVisitorGuide.test.tsx`
- Modify: `src/app/[locale]/reserve/page.tsx`, `page.test.tsx`, `src/components/reserve/ReserveFaq.test.tsx`, `messages/ja.json`, `messages/en.json`

**Interfaces:**
- Produces: `<ReserveVisitorGuide />`(props なし)

メッセージ追加(`Reserve` 直下の `faq` の前に `guide`、`faq.items` の末尾に2件):

ja `Reserve.guide`:
```json
"guide": {
  "kicker": "HOW TO BOOK",
  "heading": "予約のしかた(会員登録は不要です)",
  "step1Title": "日付と空いている枠を選ぶ",
  "step1Body": "下のボタンから日付を選ぶと、その日の空き状況が開きます。空いている枠をタップします。",
  "step2Title": "ログイン画面の下の「ビジターで予約」を選ぶ",
  "step2Body": "会員でない方は、ログイン画面を下へスクロールして「ビジターで予約」を押してください。会員登録なしで予約できます。",
  "step3Title": "予約内容と連絡先を入力して確定",
  "step3Body": "画面の案内に沿って進みます。",
  "registerHeading": "会員登録(無料)をされる方へ",
  "registerBody": "登録のご案内メールが届かないときは、迷惑メールフォルダ・受信拒否の設定・入力したメールアドレスをご確認ください。それでも届かない場合は、先にビジターで予約を進めることもできます。"
}
```
ja `faq.items` 追加:
```json
{ "question": "会員登録しなくても予約できますか？", "answer": "はい。ログイン画面を下へスクロールして「ビジターで予約」を選ぶと、会員登録なしで予約できます。" },
{ "question": "会員登録のメールが届きません", "answer": "迷惑メールフォルダや受信拒否の設定、登録時に入力したメールアドレスに誤りがないかをご確認ください。それでも届かない場合は、会員登録なしで予約できる「ビジターで予約」から先に進むこともできます。解決しないときは、このサイトのお問い合わせフォーム、またはInstagramのDMからご連絡ください。" }
```
en は同じ構成で翻訳(`step2Title`: `Choose “ビジターで予約” (Book as a visitor) at the bottom of the login screen` など)。

- [ ] **Step 1: 失敗するテストを書く**

`ReserveVisitorGuide.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import ReserveVisitorGuide from "./ReserveVisitorGuide";

describe("ReserveVisitorGuide", () => {
  it("ビジター予約で会員登録が不要なことを見出しで伝える", () => {
    renderWithIntl(<ReserveVisitorGuide />);
    expect(screen.getByRole("heading", { level: 2, name: /会員登録は不要/ })).toBeInTheDocument();
  });

  it("予約の流れを3段の順序つきリストで示す", () => {
    renderWithIntl(<ReserveVisitorGuide />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent("「ビジターで予約」");
  });

  it("会員登録(無料)の手前でメール未着の確認事項を案内する", () => {
    renderWithIntl(<ReserveVisitorGuide />);
    expect(screen.getByRole("heading", { level: 3, name: "会員登録(無料)をされる方へ" })).toBeInTheDocument();
    expect(screen.getByText(/迷惑メールフォルダ/)).toBeInTheDocument();
  });

  it("システム名・所要時間・決済手段を書かない", () => {
    const { container } = renderWithIntl(<ReserveVisitorGuide />);
    expect(container.textContent).not.toMatch(/labola|reserva/i);
    expect(container.textContent).not.toMatch(/\d+\s*分|クレジット|PayPay/);
  });

  it("英語でも描画できる", () => {
    renderWithIntl(<ReserveVisitorGuide />, { locale: "en" });
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/No membership/);
  });
});
```

`ReserveFaq.test.tsx` に追加: 既定メッセージで「会員登録しなくても予約できますか？」「会員登録のメールが届きません」の2件が描画され、後者の回答に「迷惑メール」「お問い合わせフォーム」が含まれること、FAQ 構造化データ(JSON-LD)にも載ること(既存の JSON-LD テストの書き方に合わせる)。

`page.test.tsx`: `ReserveVisitorGuide` のモック(`<section data-testid="reserve-visitor-guide" />`)を追加し、ヒーロー・予約案内の間(ガイドが予約案内より前、予約案内がガイドの直後)を `compareDocumentPosition` で固定するテストを追加。

- [ ] **Step 2: 失敗を確認** — `npx vitest run src/components/reserve src/app/\\[locale\\]/reserve` → FAIL

- [ ] **Step 3: 実装** — `ReserveVisitorGuide.tsx`(`ReserveFaq` と同じ `"use client"`・framer-motion の `revealInitial`/`EASE` パターン。`section` > 見出し `h2`、順序つき `ol` の3項目、登録の注意は `h3` + `p`)。`page.tsx` に `import ReserveVisitorGuide from "@/components/reserve/ReserveVisitorGuide";` を足し、`<ReserveHero />` と `{reserveBody}` の間に `<ReserveVisitorGuide />` を追加。messages に上記を追記。

- [ ] **Step 4: 通過を確認** — 同コマンド → PASS

---

### Task 4: 手順書(LaBOLA 側の確認事項)

**Files:**
- Create: `docs/operations/labola-handoff-requests.md`

- [ ] **Step 1: 手順書を書く** — LaBOLA サポートへ確認する3点(ビジター予約をログイン画面の上に出せるか／会員登録メールの送信元と再送の方法／登録案内文への追記可否)を、問い合わせ文面つきで。確認結果を書き戻す欄を付ける。実施はオーナー。

---

### Task 5: 検証と証跡

- [ ] **Step 1:** `npm run test:coverage`(全体 100%・閾値エラーなし)、`npm run lint`、`npx tsc --noEmit`、`npm run build`
- [ ] **Step 2:** `cp /Users/tsutsumi.akihiro/dev/bigban/.env.local ./.env.local` のうえ `npx next dev -p 3204`、`/reserve` と `/en/reserve` を 375px・1440px でスクリーンショット(`.superpowers/evidence/szb-509/`)。日付ボタンのリンク先・ビジター注記・説明セクション・FAQ を確認
- [ ] **Step 3:** 司令塔へ確認依頼(証跡の絶対パス・各検証結果)。**OK が来るまでコミットしない**

## Self-Review(計画 vs 設計書)

- 日付ボタン+1日表示(設計書 §1)→ Task 1・2。メインボタンの差し替え・SSR フォールバック → Task 2
- 計測(設計書 §2)→ Task 2 のテストで固定
- ビジター明記(§3)→ Task 2(注記)・Task 3(説明セクション)
- メール未着(§4)→ Task 3(手前=説明セクション、後=FAQ)
- LaBOLA 側確認(§5)→ Task 4
- 型・名前の整合: `toJstDate`/`buildQuickDates`/`labolaDayUrl`/`useMountedNow`/`ReserveCardActions`/`ReserveVisitorGuide` はタスク間で一致
