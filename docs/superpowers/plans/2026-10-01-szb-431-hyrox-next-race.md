# /hyrox NEXT RACE セクション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /hyrox に「次のHYROX大会」(名称・開催地・日付・残り日数)と、同ページの料金・予約(`HyroxProgram`)へ誘導するボタンを置く。大会が終われば自動で次へ、全部終われば非表示。

**Architecture:** 大会一覧を `src/constants/hyroxRaces.ts` に置き、JST 暦日で「次の大会」を選ぶ純関数を `src/lib/hyroxRaces.ts` に切り出す。表示は client の `HyroxNextRace`(props は `initialNowMs` のみ。初回描画は Server が渡した時刻で決定的にし、マウント後に現在時刻へ更新)。`HyroxContent` の `HyroxProgram` 直前に差し込む。

**Tech Stack:** Next.js 16 App Router / TypeScript strict / next-intl / framer-motion / Vitest + React Testing Library

設計書: `docs/superpowers/specs/2026-10-01-szb-431-hyrox-next-race-design.md`(司令塔・オーナー承認済み 2026-10-01)

> **実装時の変更(2026-10-01):** (1) `formatRaceDates` は ICU 差によるハイドレーション不一致と、`Intl` の ja 出力が想定(`2027年1月21日(木)…`)と違ったため、固定の語彙で自前に組み立てた。(2) `useEffect`+`setState` と描画中の `Date.now()` が React の lint に反したため、`currentTimeMs()` / `currentJstDayStartMs()` を lib に追加し、`HyroxNextRace` は `useSyncExternalStore`(server snapshot=`initialNowMs`、client snapshot=JST 日付の始まり)にした。下のコード例は当初案で、実装は `src/` が正。

## Global Constraints

- コミットは司令塔の OK が来るまで**しない**(各タスクの Commit ステップは実行せず、最後に一括)。
- `any` 禁止・`React.FC` 禁止・`import type`・Props は `ComponentNameProps` interface・event handler は `handle` 接頭辞。
- カバレッジ 100%(statements/branches/functions/lines)。`vitest.config.ts` の除外追加・`istanbul ignore`・`.only/.skip` 禁止。
- 新規依存なし。`messages/ja.json`・`messages/en.json` は `HyroxPage.nextRace` の追加のみ(既存キーの整形・並べ替え禁止)。`HyroxContent.tsx` は import 1行+差し込み1行のみ。
- チケット販売状況・参加費・所要時間は載せない。注記は「日程・販売状況は HYROX 公式サイトの発表をご確認ください。」のみ。
- 大会データ(公式確認 2026-10-01): BYD HYROX Osaka 2027-01-21〜25 INTEX Osaka https://hyrox.com/event/byd-hyrox-osaka/ / HYROX Nagoya 2027-04-16〜18 Port Messe Nagoya https://hyrox.com/event/hyrox-nagoya/
- 文言(ja): 見出し `NEXT RACE` / `次のHYROX大会`、本文「HYROX公式8種目に対応したトレーニングエリアで、大会に向けた練習ができます。」、ボタン「練習エリアの料金を見る」→ `#program`、リンク「大会の公式ページ(HYROX)」。
- 日付はすべて JST 暦日で比較(閲覧者の TZ に依存しない)。
- `page.tsx` に `export const revalidate = 3600` を1行追加。

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `src/constants/hyroxRaces.ts` | 新規 | 大会一覧(`HyroxRace` 型 + `HYROX_RACES`) |
| `src/lib/hyroxRaces.ts` | 新規 | `getNextHyroxRace` / `getRaceStatus` / `formatRaceDates` |
| `src/lib/hyroxRaces.test.ts` | 新規 | 上記の境界・整合テスト |
| `src/components/hyrox/HyroxNextRace.tsx` | 新規 | セクション表示 |
| `src/components/hyrox/HyroxNextRace.test.tsx` | 新規 | 表示・操作テスト |
| `messages/ja.json` / `messages/en.json` | 追記 | `HyroxPage.nextRace.*`(`program` の直前に挿入) |
| `src/components/hyrox/HyroxProgram.tsx` (+test) | 修正 | section に `id="program"` と `scroll-mt-24` |
| `src/app/[locale]/hyrox/HyroxContent.tsx` (+test) | 修正 | `HyroxProgram` の直前に差し込み |
| `src/app/[locale]/hyrox/page.tsx` (+test) | 修正 | `revalidate = 3600` |

---

### Task 1: 大会データと日付ロジック(純関数)

**Files:**
- Create: `src/constants/hyroxRaces.ts`, `src/lib/hyroxRaces.ts`
- Test: `src/lib/hyroxRaces.test.ts`

**Interfaces:**
- Produces:
  - `interface HyroxRace { id: string; startDate: string; endDate: string; officialUrl: string }`(日付は JST の `YYYY-MM-DD`、`id` は messages の `races.<id>` キー)
  - `const HYROX_RACES: readonly HyroxRace[]`
  - `type HyroxRaceStatus = { kind: "upcoming"; daysUntil: number } | { kind: "ongoing" }`
  - `getNextHyroxRace(nowMs: number, races?: readonly HyroxRace[]): HyroxRace | null`
  - `getRaceStatus(race: HyroxRace, nowMs: number): HyroxRaceStatus`
  - `formatRaceDates(race: HyroxRace, locale: "ja" | "en"): string`

- [ ] **Step 1: 失敗するテストを書く** — `src/lib/hyroxRaces.test.ts`

```ts
import { describe, it, expect } from "vitest";

import { HYROX_RACES } from "@/constants/hyroxRaces";
import type { HyroxRace } from "@/constants/hyroxRaces";

import {
  formatRaceDates,
  getNextHyroxRace,
  getRaceStatus,
} from "./hyroxRaces";

const OSAKA = HYROX_RACES[0];
const NAGOYA = HYROX_RACES[1];

// JST の日時から epoch ミリ秒を作る
const jst = (iso: string): number => new Date(`${iso}+09:00`).getTime();

describe("HYROX_RACES(データの整合)", () => {
  it("公式で確認した大阪・名古屋の日程を持つ", () => {
    expect(OSAKA).toMatchObject({
      id: "osaka2027",
      startDate: "2027-01-21",
      endDate: "2027-01-25",
      officialUrl: "https://hyrox.com/event/byd-hyrox-osaka/",
    });
    expect(NAGOYA).toMatchObject({
      id: "nagoya2027",
      startDate: "2027-04-16",
      endDate: "2027-04-18",
      officialUrl: "https://hyrox.com/event/hyrox-nagoya/",
    });
  });

  it("日付は YYYY-MM-DD・開始≦終了・開始日の昇順・id 重複なし", () => {
    const ids = new Set<string>();
    HYROX_RACES.forEach((race, index) => {
      expect(race.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(race.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(race.startDate <= race.endDate).toBe(true);
      if (index > 0) {
        expect(HYROX_RACES[index - 1].startDate < race.startDate).toBe(true);
      }
      ids.add(race.id);
    });
    expect(ids.size).toBe(HYROX_RACES.length);
  });
});

describe("getNextHyroxRace", () => {
  it("大阪より前は大阪を返す", () => {
    expect(getNextHyroxRace(jst("2026-10-01T12:00:00"))?.id).toBe("osaka2027");
  });

  it("大阪最終日 JST 23:59:59 はまだ大阪", () => {
    expect(getNextHyroxRace(jst("2027-01-25T23:59:59"))?.id).toBe("osaka2027");
  });

  it("大阪最終日の翌日 JST 0:00 ちょうどで名古屋に切り替わる", () => {
    expect(getNextHyroxRace(jst("2027-01-26T00:00:00"))?.id).toBe("nagoya2027");
  });

  it("名古屋最終日の翌日 JST 0:00 以降は null(全大会終了)", () => {
    expect(getNextHyroxRace(jst("2027-04-18T23:59:59"))?.id).toBe("nagoya2027");
    expect(getNextHyroxRace(jst("2027-04-19T00:00:00"))).toBeNull();
  });

  it("races を渡せばそれを使う(空なら null)", () => {
    const only: readonly HyroxRace[] = [NAGOYA];
    expect(getNextHyroxRace(jst("2026-10-01T00:00:00"), only)?.id).toBe(
      "nagoya2027",
    );
    expect(getNextHyroxRace(jst("2026-10-01T00:00:00"), [])).toBeNull();
  });
});

describe("getRaceStatus", () => {
  it("開始の前日は残り1日(JST 暦日差)", () => {
    expect(getRaceStatus(OSAKA, jst("2027-01-20T23:59:59"))).toEqual({
      kind: "upcoming",
      daysUntil: 1,
    });
  });

  it("2026-10-01 時点の大阪は残り112日", () => {
    expect(getRaceStatus(OSAKA, jst("2026-10-01T09:00:00"))).toEqual({
      kind: "upcoming",
      daysUntil: 112,
    });
  });

  it("開始日 JST 0:00 から開催中", () => {
    expect(getRaceStatus(OSAKA, jst("2027-01-21T00:00:00"))).toEqual({
      kind: "ongoing",
    });
  });

  it("最終日 JST 23:59:59 もまだ開催中", () => {
    expect(getRaceStatus(OSAKA, jst("2027-01-25T23:59:59"))).toEqual({
      kind: "ongoing",
    });
  });
});

describe("formatRaceDates", () => {
  it("ja: 年月日と曜日つきの範囲", () => {
    expect(formatRaceDates(OSAKA, "ja")).toBe("2027年1月21日(木)～25日(月)");
  });

  it("en: Jan 21 – 25 の範囲", () => {
    expect(formatRaceDates(OSAKA, "en")).toBe("Thu, Jan 21 – Mon, Jan 25, 2027");
  });

  it("開始日と終了日が同じなら1日だけ表示する", () => {
    const oneDay: HyroxRace = { ...OSAKA, startDate: "2027-01-21", endDate: "2027-01-21" };
    expect(formatRaceDates(oneDay, "ja")).toBe("2027年1月21日(木)");
  });
});
```

注: `formatRaceDates` の期待文字列(特に区切り文字 `～` / `–`)は ICU 実装に依存する。Step 4 で実出力を確認し、**出力に合わせてテストを直すのは区切り文字・空白だけ**(表記ルールの確定)で、ロジックは変えない。

- [ ] **Step 2: 失敗を確認** — `npx vitest run src/lib/hyroxRaces.test.ts` → モジュール未定義で FAIL。

- [ ] **Step 3: 最小実装**

`src/constants/hyroxRaces.ts`

```ts
/**
 * /hyrox の NEXT RACE に出す HYROX 公式大会の一覧。
 * 日付は開催地(日本)の暦日(JST, YYYY-MM-DD)。大会を足す・直すのはここだけ。
 * 日程は HYROX 公式イベントページで確認すること(2026-10-01 確認)。
 * 開始日の昇順に並べる。`id` は messages の `HyroxPage.nextRace.races.<id>` のキー。
 */
export interface HyroxRace {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly officialUrl: string;
}

export const HYROX_RACES: readonly HyroxRace[] = [
  {
    id: "osaka2027",
    startDate: "2027-01-21",
    endDate: "2027-01-25",
    officialUrl: "https://hyrox.com/event/byd-hyrox-osaka/",
  },
  {
    id: "nagoya2027",
    startDate: "2027-04-16",
    endDate: "2027-04-18",
    officialUrl: "https://hyrox.com/event/hyrox-nagoya/",
  },
];
```

`src/lib/hyroxRaces.ts`

```ts
import { HYROX_RACES } from "@/constants/hyroxRaces";
import type { HyroxRace } from "@/constants/hyroxRaces";

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type HyroxRaceStatus =
  | { readonly kind: "upcoming"; readonly daysUntil: number }
  | { readonly kind: "ongoing" };

/** epoch ミリ秒 → JST 暦日の通し番号(1970-01-01 = 0) */
function jstDayNumber(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

/** "YYYY-MM-DD"(JST 暦日) → 通し番号 */
function dateStringDayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** 最終日の JST 終わりまで「次の大会」。すべて終わっていれば null。 */
export function getNextHyroxRace(
  nowMs: number,
  races: readonly HyroxRace[] = HYROX_RACES,
): HyroxRace | null {
  const today = jstDayNumber(nowMs);
  return races.find((race) => dateStringDayNumber(race.endDate) >= today) ?? null;
}

/** 開始前なら残り日数(JST 暦日差)、開始日〜最終日は開催中。 */
export function getRaceStatus(race: HyroxRace, nowMs: number): HyroxRaceStatus {
  const daysUntil = dateStringDayNumber(race.startDate) - jstDayNumber(nowMs);
  return daysUntil > 0 ? { kind: "upcoming", daysUntil } : { kind: "ongoing" };
}

/** 開催日程の表示文字列(JST 基準。同日なら1日だけ)。 */
export function formatRaceDates(race: HyroxRace, locale: "ja" | "en"): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: locale === "ja" ? "long" : "short",
    day: "numeric",
    weekday: "short",
  });
  const start = new Date(`${race.startDate}T12:00:00+09:00`);
  const end = new Date(`${race.endDate}T12:00:00+09:00`);
  return formatter.formatRange(start, end);
}
```

- [ ] **Step 4: 通過を確認** — `npx vitest run src/lib/hyroxRaces.test.ts` → PASS。`formatRaceDates` の期待値が実出力と違う場合は区切り・空白だけテスト側を合わせる。

---

### Task 2: メッセージと `HyroxNextRace` コンポーネント

**Files:**
- Modify: `messages/ja.json`, `messages/en.json`(`HyroxPage.program` の直前に `nextRace` を挿入)
- Create: `src/components/hyrox/HyroxNextRace.tsx`
- Test: `src/components/hyrox/HyroxNextRace.test.tsx`

**Interfaces:**
- Consumes: `getNextHyroxRace` / `getRaceStatus` / `formatRaceDates`(Task 1)、`trackCtaClick("contentClick", location, label)`(`@/lib/analytics/trackEvent`)、`HyroxSectionTitle`、`EASE`(`@/constants/motion`)
- Produces: `default function HyroxNextRace({ initialNowMs }: HyroxNextRaceProps)`、`interface HyroxNextRaceProps { initialNowMs: number }`。セクションのルートは `<section aria-labelledby>` ではなく通常の `<section>` + `h2`(`HyroxSectionTitle`)。ボタンは `<a href="#program">`。

メッセージ(ja)— `HyroxPage.nextRace`:

```json
"nextRace": {
  "title": "NEXT RACE",
  "titleJa": "次のHYROX大会",
  "lead": "HYROX公式8種目に対応したトレーニングエリアで、大会に向けた練習ができます。",
  "daysUntil": "開催まで あと {days} 日",
  "ongoing": "開催中",
  "cta": "練習エリアの料金を見る",
  "officialLink": "大会の公式ページ(HYROX)",
  "note": "日程・販売状況は HYROX 公式サイトの発表をご確認ください。",
  "races": {
    "osaka2027": { "name": "BYD HYROX Osaka", "location": "大阪・インテックス大阪" },
    "nagoya2027": { "name": "HYROX Nagoya", "location": "名古屋・ポートメッセなごや" }
  }
},
```

メッセージ(en):

```json
"nextRace": {
  "title": "NEXT RACE",
  "titleJa": "Next HYROX race",
  "lead": "Train for race day in our area equipped for all 8 official HYROX stations.",
  "daysUntil": "{days} days to go",
  "ongoing": "Happening now",
  "cta": "See area rental rates",
  "officialLink": "Official race page (HYROX)",
  "note": "Dates and ticket availability: please check the official HYROX website.",
  "races": {
    "osaka2027": { "name": "BYD HYROX Osaka", "location": "Osaka · INTEX Osaka" },
    "nagoya2027": { "name": "HYROX Nagoya", "location": "Nagoya · Port Messe Nagoya" }
  }
},
```

(`daysUntil` は ICU の複数形で `{days, plural, one {# day to go} other {# days to go}}`(en)にする。ja は `{days}` のまま。)

- [ ] **Step 1: 失敗するテストを書く** — `src/components/hyrox/HyroxNextRace.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxNextRace from "./HyroxNextRace";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

const jst = (iso: string): number => new Date(`${iso}+09:00`).getTime();

describe("HyroxNextRace", () => {
  beforeEach(() => {
    trackCtaClick.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("見出し・大会名・開催地・日程・残り日数・本文を表示する", () => {
    vi.setSystemTime(jst("2026-10-01T09:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={jst("2026-10-01T09:00:00")} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "NEXT RACE 次のHYROX大会" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BYD HYROX Osaka")).toBeInTheDocument();
    expect(screen.getByText("大阪・インテックス大阪")).toBeInTheDocument();
    expect(screen.getByText("2027年1月21日(木)～25日(月)")).toBeInTheDocument();
    expect(screen.getByText("開催まで あと 112 日")).toBeInTheDocument();
    expect(screen.getByText(/HYROX公式8種目に対応した/)).toBeInTheDocument();
  });

  it("販売状況の注記だけを載せ、料金・所要時間・チケット状況は断定しない", () => {
    vi.setSystemTime(jst("2026-10-01T09:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={jst("2026-10-01T09:00:00")} />);
    expect(
      screen.getByText("日程・販売状況は HYROX 公式サイトの発表をご確認ください。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/完売|SOLD OUT|購入可/)).not.toBeInTheDocument();
  });

  it("ボタンは同ページの料金セクション(#program)へ誘導し、クリックを計測する", async () => {
    vi.setSystemTime(jst("2026-10-01T09:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={jst("2026-10-01T09:00:00")} />);
    const cta = screen.getByRole("link", { name: "練習エリアの料金を見る" });
    expect(cta).toHaveAttribute("href", "#program");
    vi.useRealTimers();
    await userEvent.click(cta);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_next_race",
      "program",
    );
  });

  it("公式ページへの外部リンクは別タブ・noopener で開く", () => {
    vi.setSystemTime(jst("2026-10-01T09:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={jst("2026-10-01T09:00:00")} />);
    const link = screen.getByRole("link", { name: "大会の公式ページ(HYROX)" });
    expect(link).toHaveAttribute("href", "https://hyrox.com/event/byd-hyrox-osaka/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("開催中は「開催中」を表示する", () => {
    vi.setSystemTime(jst("2027-01-22T10:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={jst("2027-01-22T10:00:00")} />);
    expect(screen.getByText("開催中")).toBeInTheDocument();
    expect(screen.queryByText(/あと/)).not.toBeInTheDocument();
  });

  it("全大会が終わったら何も描画しない", () => {
    vi.setSystemTime(jst("2027-05-01T10:00:00"));
    const { container } = renderWithIntl(
      <HyroxNextRace initialNowMs={jst("2027-05-01T10:00:00")} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("マウント後に現在時刻へ更新する(静的 HTML の古い時刻を直す)", () => {
    // サーバーが渡した時刻は大阪の前、実際の「いま」は大阪終了後 → 名古屋に切り替わる
    vi.setSystemTime(jst("2027-02-01T10:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={jst("2026-10-01T09:00:00")} />);
    expect(screen.queryByText("BYD HYROX Osaka")).not.toBeInTheDocument();
    expect(screen.getByText("HYROX Nagoya")).toBeInTheDocument();
    expect(screen.getByText("名古屋・ポートメッセなごや")).toBeInTheDocument();
  });

  it("en: 英語の見出し・日程・残り日数を表示する", () => {
    vi.setSystemTime(jst("2026-10-01T09:00:00"));
    renderWithIntl(<HyroxNextRace initialNowMs={jst("2026-10-01T09:00:00")} />, {
      locale: "en",
    });
    expect(screen.getByText("Thu, Jan 21 – Mon, Jan 25, 2027")).toBeInTheDocument();
    expect(screen.getByText("112 days to go")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See area rental rates" })).toBeInTheDocument();
  });
});
```

注: `act` を使わなければ未使用 import になるので、使わない場合は import から外す。framer-motion の `whileInView` は既存テストと同じくモック(`__mocks__`)が効く前提。

- [ ] **Step 2: 失敗を確認** — `npx vitest run src/components/hyrox/HyroxNextRace.test.tsx` → FAIL(コンポーネント・メッセージ未定義)。

- [ ] **Step 3: メッセージ追加 + 実装**

`src/components/hyrox/HyroxNextRace.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";

import { EASE } from "@/constants/motion";
import {
  formatRaceDates,
  getNextHyroxRace,
  getRaceStatus,
} from "@/lib/hyroxRaces";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

import HyroxSectionTitle from "./HyroxSectionTitle";

interface HyroxNextRaceProps {
  /** サーバーが渡す初回描画用の時刻(ハイドレーションを決定的にする)。 */
  initialNowMs: number;
}

// 次のHYROX大会と、練習用エリアの料金・予約(#program)への誘導。
// 大会が終われば次の大会に自動で切り替わり、全大会が終われば何も描画しない。
export default function HyroxNextRace({ initialNowMs }: HyroxNextRaceProps) {
  const t = useTranslations("HyroxPage.nextRace");
  const locale = useLocale() === "en" ? "en" : "ja";
  const [nowMs, setNowMs] = useState(initialNowMs);

  // /hyrox は静的生成のため、マウント後に現在時刻へ更新して残り日数・大会を正しくする
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const race = getNextHyroxRace(nowMs);
  if (!race) return null;

  const status = getRaceStatus(race, nowMs);

  const handleCtaClick = () => {
    trackCtaClick("contentClick", "hyrox_next_race", "program");
  };

  return (
    <section className="bg-deep-black pb-12 text-text-light lg:pb-16">
      <div className="mx-auto max-w-3xl px-6 lg:px-12">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <HyroxSectionTitle title={t("title")} titleJa={t("titleJa")} />
        </motion.div>

        <motion.div
          className="rounded-sm border border-accent/40 bg-accent/[0.08] px-6 py-8 text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <p className="font-serif text-2xl font-black tracking-[0.1em] sm:text-3xl">
            {t(`races.${race.id}.name`)}
          </p>
          <p className="mt-2 text-sm text-text-gray">
            {t(`races.${race.id}.location`)}
          </p>
          <p className="mt-1 text-sm font-bold text-text-light">
            {formatRaceDates(race, locale)}
          </p>
          <p className="mt-4 text-base font-bold text-accent">
            {status.kind === "upcoming"
              ? t("daysUntil", { days: status.daysUntil })
              : t("ongoing")}
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm text-text-gray">
            {t("lead")}
          </p>
          <a
            href="#program"
            onClick={handleCtaClick}
            className="mt-6 inline-block rounded-sm bg-accent px-8 py-3 text-sm font-bold text-deep-black"
          >
            {t("cta")}
          </a>
          <p className="mt-4">
            <a
              href={race.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-gray underline underline-offset-4"
            >
              {t("officialLink")}
            </a>
          </p>
          <p className="mt-3 text-xs text-text-gray">{t("note")}</p>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 通過を確認** — `npx vitest run src/components/hyrox/HyroxNextRace.test.tsx` → PASS。`bg-accent` 上の文字色・コントラスト(`text-deep-black`)は既存 CTA のクラスに合わせて Task 4 の目視で確認し、必要なら調整する。

---

### Task 3: 差し込み・アンカー・revalidate

**Files:**
- Modify: `src/components/hyrox/HyroxProgram.tsx`(section に `id="program"` `scroll-mt-24`)、`src/app/[locale]/hyrox/HyroxContent.tsx`(import 1行 + `HyroxProgram` 直前に `<HyroxNextRace initialNowMs={Date.now()} />`)、`src/app/[locale]/hyrox/page.tsx`(`export const revalidate = 3600`)
- Test: `HyroxProgram.test.tsx` / `HyroxContent.test.tsx` / `page.test.tsx`

**Interfaces:**
- Consumes: `HyroxNextRace`(Task 2)

- [ ] **Step 1: 失敗するテストを足す**
  - `HyroxProgram.test.tsx`: `it("ボタンのアンカー先として id=program を持つ")` → `container.querySelector("section#program")` が存在。
  - `HyroxContent.test.tsx`: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime("2026-10-01T00:00:00+09:00")` のもとで「NEXT RACE の見出しが PROGRAM の見出しより前に並ぶ」(`compareDocumentPosition`)ことを確認。後続テストへ影響しないよう `afterEach(vi.useRealTimers)`。
  - `page.test.tsx`: `import { revalidate } from "./page"` → `expect(revalidate).toBe(3600)`。
- [ ] **Step 2: 失敗を確認** — `npx vitest run src/components/hyrox/HyroxProgram.test.tsx "src/app/[locale]/hyrox"`。
- [ ] **Step 3: 実装** — 上記3ファイルを最小差分で修正。`HyroxContent.tsx` は import を `HyroxProgram` の import の直前に1行、差し込みを `<HyroxProgram />` の直前に1行だけ足す(他は触らない)。
- [ ] **Step 4: 通過を確認** — 同コマンドで PASS。

---

### Task 4: 検証と証跡

- [ ] **Step 1:** `npm run test:coverage`(全体 100%・閾値エラーなし)、`npm run lint`、`npx tsc --noEmit`、`npm run build`。
- [ ] **Step 2:** `cp /Users/tsutsumi.akihiro/dev/bigban/.env.local ./.env.local`(中身は出力しない)→ `npx next dev -p 3211` → `/hyrox` と `/en/hyrox` を開く。
- [ ] **Step 3:** 375px / 1440px のスクリーンショットを `.superpowers/evidence/szb-431/` に保存(ja 2枚・en 1枚、ボタンで `#program` へ移動する様子、コンソールエラーなし・ハイドレーション警告なし)。
- [ ] **Step 4:** 司令塔へ確認依頼(要約・証跡の絶対パス・テスト/カバレッジ/lint/型の結果)。**OK が来るまでコミットしない。**
