# 予約ページ（/reserve）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** labola 予約カレンダー（shop 3453）を埋め込んだプレミアムな `/reserve` ページを作り、サイト内の全RESERVE導線を内部 `/reserve` に切り替える。

**Architecture:** 案A（エディトリアル縦積み）。`reserve/page.tsx`(server) が locale 解決・metadata を担い、`src/components/reserve/` の4コンポーネント（Hero/Steps/Calendar/Info）を縦に構成。既存の `HomeNavigation` / `HomeFooter` で挟む。文言は `Reserve` ネームスペースで ja/en 対応。

**Tech Stack:** Next.js 16 App Router, TypeScript(strict), Tailwind v4, Framer Motion, next-intl, Vitest + RTL。

参照仕様書: `docs/superpowers/specs/2026-06-02-reserve-page-design.md`

---

## ファイル構成

| 種別 | パス | 責務 |
|---|---|---|
| 変更 | `messages/ja.json`, `messages/en.json` | `Reserve` ネームスペース + `Metadata.reserve` 追加 |
| 変更 | `src/constants/site.ts` | `RESERVE_URL` 削除、`RESERVE_PATH` / `LABOLA_CALENDAR_SRC` 追加 |
| 新規 | `src/components/reserve/ReserveCalendar.tsx`(+test) | iframe ラッパ + 見出し |
| 新規 | `src/components/reserve/ReserveHero.tsx`(+test) | ヒーロー |
| 新規 | `src/components/reserve/ReserveSteps.tsx`(+test) | 予約STEP(ol/li) |
| 新規 | `src/components/reserve/ReserveInfo.tsx`(+test) | 営業時間/アクセス + 注意事項 |
| 変更 | `src/app/[locale]/reserve/page.tsx`(+test) | 構成 + generateMetadata |
| 変更 | `src/components/home/PromoBanner.tsx`(+test) | 内部 /reserve へ |
| 変更 | `src/components/home/HomeHero.tsx`(+test) | 内部 /reserve へ |
| 変更 | `src/components/home/HomeServices.tsx`(+test) | service01 を内部 /reserve へ |
| 変更 | `src/components/home/HomeNavigation.tsx`(+test) | RESERVE×2 を内部 /reserve へ |
| 変更 | `src/lib/structured-data/sportsActivityLocation.ts`(+test) | 予約 target を内部URLへ |

---

## Task 1: i18n メッセージ追加（Reserve / Metadata.reserve）

**Files:**
- Modify: `messages/ja.json`
- Modify: `messages/en.json`

- [ ] **Step 1: ja.json に `Metadata.reserve` を追加**

`Metadata` 内（`teaser` の後あたり）に追加:

```json
    "reserve": {
      "title": "予約|THE PICKLE BANG THEORY",
      "description": "THE PICKLE BANG THEORY のコート予約ページ。ご希望の日時を選んでオンラインでかんたんに予約できます。本八幡駅徒歩1分、6:00–23:00営業。"
    },
```

- [ ] **Step 2: ja.json に `Reserve` ネームスペースを追加**（トップレベル、`PromoBanner` の近く等、既存と重複しない位置）

```json
  "Reserve": {
    "hero": {
      "eyebrow": "RESERVATION",
      "title": "RESERVE",
      "subtitle": "コート予約",
      "lead": "ご希望の日時を選んで、オンラインでかんたんにコートを予約できます。"
    },
    "steps": {
      "heading": "予約の流れ",
      "headingEn": "HOW TO BOOK",
      "step01": { "title": "日時を選ぶ", "description": "カレンダーから空き枠を選択します。" },
      "step02": { "title": "コート・人数を選択", "description": "利用コートと人数・オプションを指定します。" },
      "step03": { "title": "予約完了（決済）", "description": "お支払い情報を入力して予約を確定します。" }
    },
    "calendar": {
      "title": "BOOK A COURT",
      "subtitle": "カレンダーから予約",
      "iframeTitle": "予約カレンダー"
    },
    "info": {
      "heading": "INFORMATION",
      "hoursLabel": "営業時間",
      "hoursValue": "6:00 – 23:00（不定休）",
      "accessLabel": "アクセス",
      "accessStation": "本八幡駅 徒歩1分",
      "accessAddress": "〒272-0021 千葉県市川市八幡2-16-6 八幡ハタビル 6階"
    },
    "notes": {
      "heading": "ご利用にあたって",
      "headingEn": "NOTES",
      "items": [
        "ご予約は予約システム上の受付時間に従います。",
        "キャンセル・変更は予約システムの規定に従います。詳細は予約時にご確認ください。",
        "開始時刻に遅れた場合も、ご予約枠の時間内でのご利用となります。",
        "シューズ・ラケット等の貸出は店舗・プランにより異なります。"
      ]
    }
  },
```

- [ ] **Step 3: en.json に `Metadata.reserve` を追加**

```json
    "reserve": {
      "title": "Reservation · THE PICKLE BANG THEORY",
      "description": "Book a court at THE PICKLE BANG THEORY. Pick your time and reserve online in seconds. 1 min from Motoyawata Station, open 6:00–23:00."
    },
```

- [ ] **Step 4: en.json に `Reserve` ネームスペースを追加**

```json
  "Reserve": {
    "hero": {
      "eyebrow": "RESERVATION",
      "title": "RESERVE",
      "subtitle": "Book a Court",
      "lead": "Pick your preferred date and time and book a court online in just a few taps."
    },
    "steps": {
      "heading": "How to Book",
      "headingEn": "HOW TO BOOK",
      "step01": { "title": "Pick a date & time", "description": "Choose an open slot from the calendar." },
      "step02": { "title": "Choose court & details", "description": "Select your court, party size and options." },
      "step03": { "title": "Confirm & pay", "description": "Enter payment details to confirm your booking." }
    },
    "calendar": {
      "title": "BOOK A COURT",
      "subtitle": "Reserve from the calendar",
      "iframeTitle": "Reservation calendar"
    },
    "info": {
      "heading": "INFORMATION",
      "hoursLabel": "Hours",
      "hoursValue": "6:00 – 23:00 (irregular holidays)",
      "accessLabel": "Access",
      "accessStation": "1 min from Motoyawata Station",
      "accessAddress": "6F Yawata Hata Bldg., 2-16-6 Yawata, Ichikawa, Chiba 272-0021"
    },
    "notes": {
      "heading": "Before You Visit",
      "headingEn": "NOTES",
      "items": [
        "Reservations follow the booking system's accepted time window.",
        "Cancellations and changes follow the booking system's policy. Please check at the time of booking.",
        "Late arrivals are accommodated only within the reserved time slot.",
        "Shoe and paddle rentals vary by location and plan."
      ]
    }
  },
```

- [ ] **Step 5: JSON 妥当性確認**

Run: `python3 -c "import json; json.load(open('messages/ja.json')); json.load(open('messages/en.json')); print('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add messages/ja.json messages/en.json
git commit -m "feat(reserve): 予約ページ用 i18n メッセージを追加"
```

---

## Task 2: 定数の整理（site.ts）

**Files:**
- Modify: `src/constants/site.ts`

- [ ] **Step 1: テスト不要（定数のみ）。`RESERVE_URL` を削除し、`RESERVE_PATH` と `LABOLA_CALENDAR_SRC` を追加**

`src/constants/site.ts` を以下に更新（`RESERVE_URL` 行を削除）:

```ts
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// 内部予約ページのパス（next-intl Link 用）
export const RESERVE_PATH = "/reserve";

// labola 予約カレンダー (shop 3453) の埋め込み URL。
// tab_name=すべて は非ASCIIのため URL エンコード済み。
export const LABOLA_CALENDAR_SRC =
  "https://yoyaku.labola.jp/r/shop/3453/calendar/?embed=normal&tab_name=%E3%81%99%E3%81%B9%E3%81%A6";

export const TENNISBEAR_EVENTS_URL =
  "https://www.tennisbear.net/user/148195/organized-event";

export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
```

> 注: この時点で `RESERVE_URL` を import している箇所（Hero/Services/PromoBanner/Navigation/structured-data）は型エラーになる。Task 3〜11 で順次解消する。`tsc` は Task 12 でまとめて確認。

- [ ] **Step 2: Commit**

```bash
git add src/constants/site.ts
git commit -m "refactor(reserve): RESERVE_URL を廃止し RESERVE_PATH/LABOLA_CALENDAR_SRC を追加"
```

---

## Task 3: ReserveCalendar コンポーネント

**Files:**
- Create: `src/components/reserve/ReserveCalendar.tsx`
- Test: `src/components/reserve/ReserveCalendar.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveCalendar from "./ReserveCalendar";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveCalendar", () => {
  it("labola shop 3453 の埋め込み iframe を表示する", () => {
    renderWithIntl(<ReserveCalendar />);
    const iframe = screen.getByTitle("予約カレンダー");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      "src",
      "https://yoyaku.labola.jp/r/shop/3453/calendar/?embed=normal&tab_name=%E3%81%99%E3%81%B9%E3%81%A6"
    );
  });

  it("見出し BOOK A COURT を表示する", () => {
    renderWithIntl(<ReserveCalendar />);
    expect(screen.getByText("BOOK A COURT")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/reserve/ReserveCalendar.test.tsx`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装**

```tsx
"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { LABOLA_CALENDAR_SRC } from "@/constants/site";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function ReserveCalendar() {
  const t = useTranslations("Reserve.calendar");

  return (
    <section className="bg-deep-black py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center mb-8 lg:mb-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.12em] text-text-light">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("subtitle")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <motion.div
          className="mx-auto w-full max-w-[1100px] border border-accent/20 border-t-2 border-t-accent bg-white rounded-sm overflow-hidden"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
        >
          <iframe
            src={LABOLA_CALENDAR_SRC}
            title={t("iframeTitle")}
            className="w-full h-[640px] md:h-[550px] border-0"
          />
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/reserve/ReserveCalendar.test.tsx`
Expected: PASS（2件）

- [ ] **Step 5: Commit**

```bash
git add src/components/reserve/ReserveCalendar.tsx src/components/reserve/ReserveCalendar.test.tsx
git commit -m "feat(reserve): ReserveCalendar (labola埋め込み) を追加"
```

---

## Task 4: ReserveHero コンポーネント

**Files:**
- Create: `src/components/reserve/ReserveHero.tsx`
- Test: `src/components/reserve/ReserveHero.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveHero from "./ReserveHero";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveHero", () => {
  it("h1 見出し RESERVE を表示する", () => {
    renderWithIntl(<ReserveHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: /RESERVE/ })
    ).toBeInTheDocument();
  });

  it("和文サブタイトルとリード文を表示する", () => {
    renderWithIntl(<ReserveHero />);
    expect(screen.getByText("コート予約")).toBeInTheDocument();
    expect(
      screen.getByText(
        "ご希望の日時を選んで、オンラインでかんたんにコートを予約できます。"
      )
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/reserve/ReserveHero.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

```tsx
"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function ReserveHero() {
  const t = useTranslations("Reserve.hero");

  return (
    <section className="pt-[calc(7rem+var(--promo-banner-h))] pb-10 lg:pt-[calc(8rem+var(--promo-banner-h))] lg:pb-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <p className="text-xs tracking-[0.4em] text-accent mb-4">
            {t("eyebrow")}
          </p>
          <h1 className="font-serif text-5xl sm:text-7xl lg:text-8xl font-black tracking-[0.08em] sm:tracking-[0.15em] text-text-light">
            {t("title")}
          </h1>
          <p className="mt-4 text-sm sm:text-base tracking-[0.25em] text-text-gray">
            {t("subtitle")}
          </p>
          <div className="mx-auto mt-5 w-14 h-[3px] bg-accent" />
          <p className="mx-auto mt-6 max-w-xl text-sm sm:text-base leading-relaxed text-text-light/80">
            {t("lead")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/reserve/ReserveHero.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reserve/ReserveHero.tsx src/components/reserve/ReserveHero.test.tsx
git commit -m "feat(reserve): ReserveHero を追加"
```

---

## Task 5: ReserveSteps コンポーネント

**Files:**
- Create: `src/components/reserve/ReserveSteps.tsx`
- Test: `src/components/reserve/ReserveSteps.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveSteps from "./ReserveSteps";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveSteps", () => {
  it("3つのステップを順序付きリストで表示する", () => {
    renderWithIntl(<ReserveSteps />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(screen.getByText("日時を選ぶ")).toBeInTheDocument();
    expect(screen.getByText("コート・人数を選択")).toBeInTheDocument();
    expect(screen.getByText("予約完了（決済）")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/reserve/ReserveSteps.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

```tsx
"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const STEP_KEYS = ["step01", "step02", "step03"] as const;
const STEP_NUMBERS = ["01", "02", "03"] as const;

export default function ReserveSteps() {
  const t = useTranslations("Reserve.steps");

  return (
    <section className="bg-deep-black py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center mb-8 lg:mb-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-black tracking-[0.12em] text-text-light">
            {t("headingEn")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("heading")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <motion.ol
          className="grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{ visible: { transition: { staggerChildren: 0.15 } } }}
        >
          {STEP_KEYS.map((key, i) => (
            <motion.li
              key={key}
              className="text-center sm:text-left"
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
              }}
            >
              <span className="font-serif text-5xl lg:text-6xl text-accent block mb-3">
                {STEP_NUMBERS[i]}
              </span>
              <h3 className="font-serif text-lg lg:text-xl text-text-light mb-2">
                {t(`${key}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-text-light/70">
                {t(`${key}.description`)}
              </p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/reserve/ReserveSteps.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reserve/ReserveSteps.tsx src/components/reserve/ReserveSteps.test.tsx
git commit -m "feat(reserve): ReserveSteps (予約の流れ) を追加"
```

---

## Task 6: ReserveInfo コンポーネント

**Files:**
- Create: `src/components/reserve/ReserveInfo.tsx`
- Test: `src/components/reserve/ReserveInfo.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveInfo from "./ReserveInfo";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveInfo", () => {
  it("営業時間とアクセスを表示する", () => {
    renderWithIntl(<ReserveInfo />);
    expect(screen.getByText("6:00 – 23:00（不定休）")).toBeInTheDocument();
    expect(screen.getByText("本八幡駅 徒歩1分")).toBeInTheDocument();
  });

  it("注意事項を4件表示する", () => {
    renderWithIntl(<ReserveInfo />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/reserve/ReserveInfo.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

```tsx
"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function ReserveInfo() {
  const t = useTranslations("Reserve");
  const notes = t.raw("notes.items") as string[];

  return (
    <section className="bg-deep-black pb-20 lg:pb-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          {/* INFORMATION */}
          <div>
            <h2 className="text-xs tracking-[0.3em] text-accent mb-6">
              {t("info.heading")}
            </h2>
            <dl className="space-y-5">
              <div>
                <dt className="text-xs tracking-[0.2em] text-text-gray mb-1">
                  {t("info.hoursLabel")}
                </dt>
                <dd className="text-text-light">{t("info.hoursValue")}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-[0.2em] text-text-gray mb-1">
                  {t("info.accessLabel")}
                </dt>
                <dd className="text-text-light">{t("info.accessStation")}</dd>
                <dd className="text-text-light/70 text-sm mt-1">
                  {t("info.accessAddress")}
                </dd>
              </div>
            </dl>
          </div>

          {/* NOTES */}
          <div>
            <h2 className="text-xs tracking-[0.3em] text-accent mb-6">
              {t("notes.headingEn")}
            </h2>
            <p className="text-sm text-text-gray mb-4">{t("notes.heading")}</p>
            <ul className="space-y-3">
              {notes.map((note) => (
                <li
                  key={note}
                  className="relative pl-5 text-sm leading-relaxed text-text-light/80 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:bg-accent"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/reserve/ReserveInfo.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reserve/ReserveInfo.tsx src/components/reserve/ReserveInfo.test.tsx
git commit -m "feat(reserve): ReserveInfo (営業時間/注意事項) を追加"
```

---

## Task 7: reserve/page.tsx（構成 + metadata）

**Files:**
- Modify: `src/app/[locale]/reserve/page.tsx`
- Test: `src/app/[locale]/reserve/page.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**（locale guard）

```tsx
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
}));

import ReservePage from "./page";

describe("ReservePage", () => {
  it("不正な locale で notFound を呼ぶ", async () => {
    await expect(
      ReservePage({ params: Promise.resolve({ locale: "xx" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run "src/app/[locale]/reserve/page.test.tsx"`
Expected: FAIL（現状 page は iframe テストページのため notFound を throw しない or 構造不一致）

- [ ] **Step 3: 実装（page.tsx を全面置換）**

```tsx
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SITE_URL } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import ReserveHero from "@/components/reserve/ReserveHero";
import ReserveSteps from "@/components/reserve/ReserveSteps";
import ReserveCalendar from "@/components/reserve/ReserveCalendar";
import ReserveInfo from "@/components/reserve/ReserveInfo";

import type { Metadata } from "next";

interface ReservePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ReservePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/reserve` : `${SITE_URL}/${locale}/reserve`;

  return {
    title: t("reserve.title"),
    description: t("reserve.description"),
    openGraph: {
      title: t("reserve.title"),
      description: t("reserve.description"),
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/reserve`,
        en: `${SITE_URL}/en/reserve`,
        "x-default": `${SITE_URL}/reserve`,
      },
    },
  };
}

export default async function ReservePage({ params }: ReservePageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <main className="bg-deep-black min-h-screen">
      <HomeNavigation />
      <ReserveHero />
      <ReserveSteps />
      <ReserveCalendar />
      <ReserveInfo />
      <HomeFooter />
    </main>
  );
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run "src/app/[locale]/reserve/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/reserve/page.tsx" "src/app/[locale]/reserve/page.test.tsx"
git commit -m "feat(reserve): /reserve ページを構成し metadata を追加"
```

---

## Task 8: PromoBanner を内部 /reserve へ

**Files:**
- Modify: `src/components/home/PromoBanner.tsx`
- Modify: `src/components/home/PromoBanner.test.tsx`

- [ ] **Step 1: テストを内部リンク検証に更新**

`PromoBanner.test.tsx` の href 検証ブロックを以下に変更:

```tsx
  it("links to the internal reserve page", () => {
    renderWithIntl(<PromoBanner />, "ja");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/reserve");
  });
```

（`target=_blank` / `rel` を検証していた行は削除）

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/home/PromoBanner.test.tsx`
Expected: FAIL（まだ外部URL）

- [ ] **Step 3: 実装（PromoBanner.tsx）**

import と要素を変更:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RESERVE_PATH } from "@/constants/site";

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");

  return (
    <Link
      href={RESERVE_PATH}
      aria-label={t("ariaLabel")}
      className="fixed top-0 left-0 w-full z-[55] bg-accent text-deep-black h-[var(--promo-banner-h)] flex items-center justify-center px-4 hover:brightness-95 transition-[filter] duration-200"
    >
      <span className="truncate text-xs md:text-sm font-bold tracking-wide">
        {t("text")}
      </span>
    </Link>
  );
}
```

> 注: 6月版文言の切替（textJune）が develop 側で入っている場合は、その分岐ロジックを保持したまま `<a>`→`<Link>` のみ置換する。

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/home/PromoBanner.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/home/PromoBanner.tsx src/components/home/PromoBanner.test.tsx
git commit -m "refactor(reserve): PromoBanner を内部 /reserve リンクに変更"
```

---

## Task 9: HomeHero を内部 /reserve へ

**Files:**
- Modify: `src/components/home/HomeHero.tsx`
- Modify: `src/components/home/HomeHero.test.tsx`

- [ ] **Step 1: テスト更新**

`HomeHero.test.tsx` の CTA 検証を以下へ:

```tsx
  it("CTAボタン（RESERVE A COURT）が内部予約ページにリンクする", () => {
    renderWithIntl(<HomeHero />);
    const cta = screen.getByRole("link", { name: /RESERVE A COURT/ });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/reserve");
  });
```

（`target=_blank` / `rel` 検証行は削除）

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/home/HomeHero.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`import { RESERVE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";` を
`import { RESERVE_PATH } from "@/constants/site";` に変更し、
`import { Link } from "@/i18n/navigation";` を追加。

CTA 部分（`<a ...>{t("cta")}</a>`）を以下へ置換:

```tsx
              <Link
                ref={ref as React.RefObject<HTMLAnchorElement>}
                href={RESERVE_PATH}
                className="inline-block bg-accent px-8 py-3 text-sm font-bold tracking-widest text-deep-black transition-transform"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px)`,
                }}
              >
                {t("cta")}
              </Link>
```

> 注: next-intl `Link` は `<a>` に ref を forward する。型が合わない場合は `ref` を一旦外し `useMagneticButton` の対象を親要素に変更するか、`as` キャストで対応（最小差分を優先）。

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/home/HomeHero.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/home/HomeHero.tsx src/components/home/HomeHero.test.tsx
git commit -m "refactor(reserve): HomeHero CTA を内部 /reserve リンクに変更"
```

---

## Task 10: HomeServices service01 を内部 /reserve へ

**Files:**
- Modify: `src/components/home/HomeServices.tsx`
- Modify: `src/components/home/HomeServices.test.tsx`

- [ ] **Step 1: テスト更新**

`HomeServices.test.tsx` の service01 リンク検証を内部へ:

```tsx
    expect(link).toHaveAttribute("href", "/reserve");
```

（`target=_blank` 検証があれば削除）

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/home/HomeServices.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

import を変更:

```tsx
import { Link } from "@/i18n/navigation";
import {
  RESERVE_PATH,
  TENNISBEAR_EVENTS_URL,
  EXTERNAL_LINK_PROPS,
} from "@/constants/site";
```

`ServiceConfig` に内部リンク判定を追加:

```tsx
interface ServiceConfig {
  number: string;
  key: string;
  isReversed: boolean;
  isDark: boolean;
  imageSrc: string;
  imageAlt: string;
  hasCta: boolean;
  ctaUrl?: string;
  ctaInternal?: boolean;
}
```

`SERVICES` の service01 を内部化:

```tsx
  { number: "01", key: "service01", isReversed: false, isDark: true, imageSrc: "/images/rental.webp", imageAlt: "Court rental", hasCta: true, ctaUrl: RESERVE_PATH, ctaInternal: true },
```

CTA レンダリング部を内部/外部で出し分け:

```tsx
              {service.hasCta && service.ctaUrl && (
                service.ctaInternal ? (
                  <Link
                    href={service.ctaUrl}
                    className="inline-block mt-6 bg-accent text-deep-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-colors"
                  >
                    {t(`${service.key}.cta`)}
                  </Link>
                ) : (
                  <a
                    href={service.ctaUrl}
                    {...EXTERNAL_LINK_PROPS}
                    className="inline-block mt-6 bg-accent text-deep-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-colors"
                  >
                    {t(`${service.key}.cta`)}
                  </a>
                )
              )}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/home/HomeServices.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/home/HomeServices.tsx src/components/home/HomeServices.test.tsx
git commit -m "refactor(reserve): HomeServices コートレンタルCTAを内部 /reserve に変更"
```

---

## Task 11: HomeNavigation の RESERVE×2 を内部 /reserve へ

**Files:**
- Modify: `src/components/home/HomeNavigation.tsx`
- Modify: `src/components/home/HomeNavigation.test.tsx`

- [ ] **Step 1: テスト更新**

`HomeNavigation.test.tsx` の reserve 検証（168-172, 283-285 付近）を内部リンク検証へ:

```tsx
    const reserveLinks = screen.getAllByRole("link", { name: "RESERVE" });
    expect(reserveLinks.length).toBeGreaterThanOrEqual(1);
    expect(reserveLinks[0]).toHaveAttribute("href", "/reserve");
```

モバイルダイアログ内（283-285）:

```tsx
    const reserveInDialog = dialog.querySelector("a[href='/reserve']");
    expect(reserveInDialog).toBeInTheDocument();
    expect(reserveInDialog?.textContent).toBe("RESERVE");
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/home/HomeNavigation.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`import { RESERVE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";` から `RESERVE_URL` を削除し `RESERVE_PATH` を追加（`EXTERNAL_LINK_PROPS` が他で未使用なら併せて削除）。`Link` は既存 import を流用。

デスクトップ（135-141）:

```tsx
            <Link
              href={RESERVE_PATH}
              className="bg-accent text-deep-black px-5 py-2 text-xs font-bold uppercase tracking-widest"
            >
              {t("reserve")}
            </Link>
```

モバイルダイアログ（215-221）:

```tsx
          <Link
            href={RESERVE_PATH}
            onClick={handleMobileLinkClick}
            className="mt-12 bg-accent text-deep-black px-8 py-3 text-sm font-bold uppercase tracking-widest"
          >
            {t("reserve")}
          </Link>
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/home/HomeNavigation.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/home/HomeNavigation.tsx src/components/home/HomeNavigation.test.tsx
git commit -m "refactor(reserve): ナビの RESERVE を内部 /reserve リンクに変更"
```

---

## Task 12: 構造化データの予約 target + 全体検証

**Files:**
- Modify: `src/lib/structured-data/sportsActivityLocation.ts`
- Modify: `src/lib/structured-data/sportsActivityLocation.test.ts`

- [ ] **Step 1: テスト更新**

`sportsActivityLocation.test.ts` で予約 target を検証している箇所を `${SITE_URL}/reserve` 相当へ更新（例）:

```ts
    expect(result.potentialAction.target).toBe(`${SITE_URL}/reserve`);
```

（テストの既存記法に合わせて調整。`SITE_URL` import が無ければ追加）

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/lib/structured-data/sportsActivityLocation.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`sportsActivityLocation.ts` の import を `import { SITE_URL } from "@/constants/site";`（`RESERVE_URL` を削除）に変更し、124 行付近の `target: RESERVE_URL` を:

```ts
      target: `${SITE_URL}/reserve`,
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/lib/structured-data/sportsActivityLocation.test.ts`
Expected: PASS

- [ ] **Step 5: 全体検証（型・全テスト・lint）**

Run: `npx tsc --noEmit`
Expected: エラーなし（`RESERVE_URL` 参照残りがないこと）

Run: `npx vitest run`
Expected: 全テスト PASS

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/lib/structured-data/sportsActivityLocation.ts src/lib/structured-data/sportsActivityLocation.test.ts
git commit -m "refactor(reserve): 構造化データの予約 target を内部 /reserve に変更"
```

---

## 完了条件

- `/reserve`（ja/en）が ヒーロー / STEP / labola カレンダー(3453) / 営業時間・注意事項 + ナビ・フッターで表示される
- サイト内 RESERVE 導線がすべて内部 `/reserve`（同一タブ）に向く
- `RESERVE_URL` 参照がコードベースから消えている
- 全テスト PASS、`tsc` クリーン、`lint` クリーン
- ブラウザ（http://localhost:3000/reserve）で表示・遷移を確認
