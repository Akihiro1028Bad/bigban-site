# HYROX トレーニングエリア 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ピックルボールと並ぶ「第二の柱」として HYROX 専用ページ `/hyrox` を新設し、ホームに誘導カードを設置する（コンテンツは Coming Soon プレースホルダ前提）。

**Architecture:** 既存サブページ（about / tokushoho）と同型。`page.tsx`（Server Component）が `generateMetadata` と `StructuredData` を担い、`HyroxContent.tsx`（Client）が `HomeNavigation` ＋ 各セクション ＋ `HomeFooter` を合成。各セクションは既存 home コンポーネントのトークン・パターンを流用した新規コンポーネント。文言は next-intl 静的（`messages/{ja,en}.json`）。

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS v4, Framer Motion（`__mocks__/framer-motion.tsx` で自動モック）, next-intl, Vitest + React Testing Library（カバレッジ100%必須）。

**設計書:** `docs/superpowers/specs/2026-05-24-hyrox-training-area-design.md`

---

## 共通ルール

- テストは `src/test-utils/intl-wrapper.tsx` の `renderWithIntl` を使う（`NextIntlClientProvider` ラップ済み）。
- Framer Motion は alias で自動モックされるため、`motion.*` 要素は素の DOM 要素として描画される。
- すべての新規 `.tsx` / `.ts` にはコロケーションテストを併置し、カバレッジ100%を満たす。
- 文言キーは ja/en で**同一構造**を厳守する。
- コミットは各タスク末尾で行う（Conventional Commits、属性付与なし）。

## ファイル構成（このプランで作成/変更）

| 種別 | パス | 責務 |
|------|------|------|
| 変更 | `messages/ja.json` / `messages/en.json` | `Navigation.hyrox` / `Metadata.hyrox` / `HyroxPage` / `HomeHyroxPromo` を追加 |
| 作成 | `src/components/hyrox/stations.ts` | 8種目の定数（番号＋メッセージキー） |
| 作成 | `src/components/hyrox/HyroxHero.tsx` | ヒーロー |
| 作成 | `src/components/hyrox/HyroxIntro.tsx` | What is HYROX ＋ Key Numbers |
| 作成 | `src/components/hyrox/HyroxStations.tsx` | 8 stations グリッド |
| 作成 | `src/components/hyrox/HyroxProgram.tsx` | program/pricing（Coming Soon） |
| 作成 | `src/app/[locale]/hyrox/HyroxContent.tsx` | Nav＋各セクション＋Footer 合成（Client） |
| 作成 | `src/app/[locale]/hyrox/page.tsx` | メタデータ＋StructuredData（Server） |
| 作成 | `src/app/[locale]/hyrox/loading.tsx` / `error.tsx` | ローディング/エラー境界 |
| 作成 | `src/lib/structured-data/exerciseGym.ts` | ExerciseGym JSON-LD ビルダー |
| 変更 | `src/lib/structured-data/index.ts` | `buildExerciseGym` を re-export |
| 変更 | `src/lib/structured-data/service.ts` | HYROX を Service 定義に追加 |
| 作成 | `src/components/home/HomeHyroxPromo.tsx` | ホーム誘導カード |
| 変更 | `src/app/[locale]/page.tsx` | `HomeServices` と `HomePricing` の間に `HomeHyroxPromo` 挿入 |
| 変更 | `src/components/home/HomeNavigation.tsx` | `NAV_ITEMS` に `hyrox` 追加 |
| 変更 | `src/components/home/HomeFooter.tsx` | `/hyrox` リンクを別枠追加 |
| 変更 | `src/components/home/HomeFacility.tsx` | `trainingArea` を `/hyrox` 相互リンク化 |
| 変更 | `src/constants/routes.ts` | `SITEMAP_ROUTES` に `/hyrox` 追加 |

---

## Task 1: i18n メッセージ追加

**Files:**
- Modify: `messages/ja.json`
- Modify: `messages/en.json`
- Test: `src/i18n/hyroxMessages.test.ts`（新規。ja/en の構造一致を検証）

- [ ] **Step 1: 失敗するテストを書く**

Create `src/i18n/hyroxMessages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";

function keysOf(obj: unknown): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? Object.keys(v as object).map((c) => `${k}.${c}`)
      : [k],
  );
}

describe("HYROX i18n messages", () => {
  it("ja に Navigation.hyrox / Metadata.hyrox がある", () => {
    expect((ja.Navigation as Record<string, unknown>).hyrox).toBeTypeOf("string");
    expect((ja.Metadata as Record<string, unknown>).hyrox).toBeTypeOf("object");
  });

  it("ja に 8 stations が定義されている", () => {
    const stations = (ja as Record<string, any>).HyroxPage.stations;
    for (let i = 1; i <= 8; i++) {
      const key = `station${String(i).padStart(2, "0")}`;
      expect(stations[key].name).toBeTypeOf("string");
      expect(stations[key].nameJa).toBeTypeOf("string");
    }
  });

  it("ja と en の HyroxPage / HomeHyroxPromo のキー構造が一致する", () => {
    const jaObj = ja as Record<string, unknown>;
    const enObj = en as Record<string, unknown>;
    expect(keysOf(enObj.HyroxPage)).toEqual(keysOf(jaObj.HyroxPage));
    expect(keysOf(enObj.HomeHyroxPromo)).toEqual(keysOf(jaObj.HomeHyroxPromo));
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/i18n/hyroxMessages.test.ts`
Expected: FAIL（`HyroxPage` / `hyrox` キーが存在しない）

- [ ] **Step 3: ja.json に追記**

`messages/ja.json` の `Navigation` オブジェクトに追加:

```json
"hyrox": "HYROX"
```

`Metadata` オブジェクトに追加:

```json
"hyrox": {
  "title": "HYROX トレーニングエリア | THE PICKLE BANG THEORY",
  "description": "ランニングと8種目のファンクショナルワークアウトで競う世界的フィットネスレース HYROX。本八幡の THE PICKLE BANG THEORY に本格トレーニングエリアが登場予定。",
  "keywords": ["HYROX", "ハイロックス", "HYROX 市川", "HYROX 本八幡", "HYROX 千葉", "HYROX ジム", "HYROX トレーニング", "HYROX 体験", "ファンクショナルフィットネス", "機能性トレーニング"]
}
```

トップレベルに追加:

```json
"HyroxPage": {
  "hero": {
    "kicker": "The World Series of Fitness Racing",
    "title": "HYROX",
    "tagline": "RUN. WORKOUT. REPEAT.",
    "lead": "ピックルボールと並ぶ、もう一つの主役。（コピー準備中）",
    "cta": "体験予約",
    "statusBadge": "COMING SOON"
  },
  "whatIs": {
    "title": "WHAT IS HYROX",
    "titleJa": "ハイロックスとは",
    "lead": "ランニング8kmと8種目のファンクショナルワークアウトを組み合わせた、世界統一ルールのフィットネスレース。（本文準備中）",
    "keyNumbers": {
      "run": { "value": "8", "labelEn": "KM RUN", "labelJa": "ランニング" },
      "workouts": { "value": "8", "labelEn": "WORKOUTS", "labelJa": "種目" },
      "race": { "value": "1", "labelEn": "RACE", "labelJa": "レース" }
    }
  },
  "stations": {
    "title": "8 STATIONS",
    "titleJa": "8つの種目",
    "preparing": "準備中",
    "station01": { "name": "SkiErg", "nameJa": "スキーエルグ", "description": "準備中" },
    "station02": { "name": "Sled Push", "nameJa": "スレッドプッシュ", "description": "準備中" },
    "station03": { "name": "Sled Pull", "nameJa": "スレッドプル", "description": "準備中" },
    "station04": { "name": "Burpee Broad Jumps", "nameJa": "バーピーブロードジャンプ", "description": "準備中" },
    "station05": { "name": "Rowing", "nameJa": "ローイング", "description": "準備中" },
    "station06": { "name": "Farmers Carry", "nameJa": "ファーマーズキャリー", "description": "準備中" },
    "station07": { "name": "Sandbag Lunges", "nameJa": "サンドバッグランジ", "description": "準備中" },
    "station08": { "name": "Wall Balls", "nameJa": "ウォールボール", "description": "準備中" }
  },
  "program": {
    "title": "PROGRAM",
    "titleJa": "プログラム・料金",
    "comingSoon": "Coming Soon",
    "note": "プログラム・料金は準備中です。詳細が決まり次第お知らせします。"
  }
},
"HomeHyroxPromo": {
  "kicker": "NEW TRAINING AREA",
  "title": "HYROX",
  "titleEn": "The World Series of Fitness Racing",
  "description": "本格ファンクショナルトレーニングエリアが登場予定。（準備中）",
  "cta": "DISCOVER HYROX"
}
```

- [ ] **Step 4: en.json に追記（同一キー構造・英語値）**

`messages/en.json` の `Navigation` に `"hyrox": "HYROX"`、`Metadata` に:

```json
"hyrox": {
  "title": "HYROX Training Area | THE PICKLE BANG THEORY",
  "description": "HYROX — the world series of fitness racing combining an 8 km run with 8 functional workouts. A dedicated training area is coming to THE PICKLE BANG THEORY in Motoyawata.",
  "keywords": ["HYROX", "HYROX Japan", "HYROX Chiba", "HYROX Motoyawata", "HYROX gym", "HYROX training", "functional fitness", "fitness racing"]
}
```

トップレベルに追加（キー構造は ja と完全一致、値は英語）:

```json
"HyroxPage": {
  "hero": {
    "kicker": "The World Series of Fitness Racing",
    "title": "HYROX",
    "tagline": "RUN. WORKOUT. REPEAT.",
    "lead": "The second pillar, alongside pickleball. (Copy coming soon)",
    "cta": "Book a trial",
    "statusBadge": "COMING SOON"
  },
  "whatIs": {
    "title": "WHAT IS HYROX",
    "titleJa": "About HYROX",
    "lead": "A standardized global fitness race combining an 8 km run with 8 functional workout stations. (Details coming soon)",
    "keyNumbers": {
      "run": { "value": "8", "labelEn": "KM RUN", "labelJa": "Running" },
      "workouts": { "value": "8", "labelEn": "WORKOUTS", "labelJa": "Stations" },
      "race": { "value": "1", "labelEn": "RACE", "labelJa": "Race" }
    }
  },
  "stations": {
    "title": "8 STATIONS",
    "titleJa": "The 8 Workouts",
    "preparing": "Coming soon",
    "station01": { "name": "SkiErg", "nameJa": "SkiErg", "description": "Coming soon" },
    "station02": { "name": "Sled Push", "nameJa": "Sled Push", "description": "Coming soon" },
    "station03": { "name": "Sled Pull", "nameJa": "Sled Pull", "description": "Coming soon" },
    "station04": { "name": "Burpee Broad Jumps", "nameJa": "Burpee Broad Jumps", "description": "Coming soon" },
    "station05": { "name": "Rowing", "nameJa": "Rowing", "description": "Coming soon" },
    "station06": { "name": "Farmers Carry", "nameJa": "Farmers Carry", "description": "Coming soon" },
    "station07": { "name": "Sandbag Lunges", "nameJa": "Sandbag Lunges", "description": "Coming soon" },
    "station08": { "name": "Wall Balls", "nameJa": "Wall Balls", "description": "Coming soon" }
  },
  "program": {
    "title": "PROGRAM",
    "titleJa": "Program & Pricing",
    "comingSoon": "Coming Soon",
    "note": "Programs and pricing are being finalized. Stay tuned."
  }
},
"HomeHyroxPromo": {
  "kicker": "NEW TRAINING AREA",
  "title": "HYROX",
  "titleEn": "The World Series of Fitness Racing",
  "description": "A dedicated functional training area is coming soon. (Preparing)",
  "cta": "DISCOVER HYROX"
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run src/i18n/hyroxMessages.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add messages/ja.json messages/en.json src/i18n/hyroxMessages.test.ts
git commit -m "feat(i18n): HYROX ページ用メッセージを追加"
```

---

## Task 2: stations 定数

**Files:**
- Create: `src/components/hyrox/stations.ts`
- Test: `src/components/hyrox/stations.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from "vitest";
import { HYROX_STATIONS } from "./stations";

describe("HYROX_STATIONS", () => {
  it("8件ある", () => {
    expect(HYROX_STATIONS).toHaveLength(8);
  });

  it("number は 01〜08、key は station01〜station08", () => {
    HYROX_STATIONS.forEach((s, i) => {
      const n = String(i + 1).padStart(2, "0");
      expect(s.number).toBe(n);
      expect(s.key).toBe(`station${n}`);
    });
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/hyrox/stations.test.ts`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装**

Create `src/components/hyrox/stations.ts`:

```ts
export interface HyroxStation {
  number: string;
  key: string;
}

export const HYROX_STATIONS: readonly HyroxStation[] = Array.from(
  { length: 8 },
  (_, i) => {
    const number = String(i + 1).padStart(2, "0");
    return { number, key: `station${number}` };
  },
);
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/hyrox/stations.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/hyrox/stations.ts src/components/hyrox/stations.test.ts
git commit -m "feat(hyrox): 8種目の定数を追加"
```

---

## Task 3: HyroxHero コンポーネント

**Files:**
- Create: `src/components/hyrox/HyroxHero.tsx`
- Test: `src/components/hyrox/HyroxHero.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxHero from "./HyroxHero";

describe("HyroxHero", () => {
  it("見出し HYROX とタグラインを表示する", () => {
    renderWithIntl(<HyroxHero />);
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
    expect(screen.getByText("RUN. WORKOUT. REPEAT.")).toBeInTheDocument();
  });

  it("COMING SOON バッジと予約 CTA を表示する", () => {
    renderWithIntl(<HyroxHero />);
    expect(screen.getByText("COMING SOON")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "体験予約" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/hyrox/HyroxHero.test.tsx`
Expected: FAIL（コンポーネント未作成）

- [ ] **Step 3: 実装**

Create `src/components/hyrox/HyroxHero.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { RESERVE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxHero() {
  const t = useTranslations("HyroxPage.hero");

  return (
    <section className="relative min-h-[80vh] flex items-center bg-deep-black overflow-hidden">
      <Image
        src="/images/comingsoon.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-deep-black via-deep-black/70 to-transparent" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-12 py-32 w-full">
        <motion.span
          className="inline-block text-[10px] tracking-[0.3em] text-accent border border-accent/40 rounded-full px-4 py-1 mb-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          {t("statusBadge")}
        </motion.span>
        <motion.p
          className="text-xs tracking-[0.3em] text-text-gray uppercase mb-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
        >
          {t("kicker")}
        </motion.p>
        <motion.h1
          className="font-serif text-6xl sm:text-7xl lg:text-8xl font-black tracking-[0.1em] text-text-light"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.2, ease: EASE }}
        >
          {t("title")}
        </motion.h1>
        <div className="mt-4 w-14 h-[3px] bg-accent" />
        <motion.p
          className="mt-6 text-accent text-sm sm:text-base tracking-[0.25em] uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.0, delay: 0.4, ease: EASE }}
        >
          {t("tagline")}
        </motion.p>
        <p className="mt-6 text-text-gray text-sm sm:text-base max-w-xl leading-relaxed">
          {t("lead")}
        </p>
        <a
          href={RESERVE_URL}
          {...EXTERNAL_LINK_PROPS}
          className="inline-block mt-8 bg-accent text-deep-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-colors"
        >
          {t("cta")}
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/hyrox/HyroxHero.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/hyrox/HyroxHero.tsx src/components/hyrox/HyroxHero.test.tsx
git commit -m "feat(hyrox): ヒーローセクションを追加"
```

---

## Task 4: HyroxIntro コンポーネント（What is HYROX ＋ Key Numbers）

**Files:**
- Create: `src/components/hyrox/HyroxIntro.tsx`
- Test: `src/components/hyrox/HyroxIntro.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxIntro from "./HyroxIntro";

describe("HyroxIntro", () => {
  it("WHAT IS HYROX 見出しを表示する", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.getByRole("heading", { name: "WHAT IS HYROX" })).toBeInTheDocument();
  });

  it("3つの Key Number ラベル(KM RUN / WORKOUTS / RACE)を表示する", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.getByText("KM RUN")).toBeInTheDocument();
    expect(screen.getByText("WORKOUTS")).toBeInTheDocument();
    expect(screen.getByText("RACE")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/hyrox/HyroxIntro.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

Create `src/components/hyrox/HyroxIntro.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const NUMBER_KEYS = ["run", "workouts", "race"] as const;

export default function HyroxIntro() {
  const t = useTranslations("HyroxPage.whatIs");

  const keyNumbers = NUMBER_KEYS.map((key) => ({
    key,
    value: t(`keyNumbers.${key}.value`),
    labelEn: t(`keyNumbers.${key}.labelEn`),
    labelJa: t(`keyNumbers.${key}.labelJa`),
  }));

  return (
    <section className="bg-deep-black py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em] text-text-light">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mt-4 w-14 h-[3px] bg-accent" />
          <p className="mt-8 text-text-gray text-sm lg:text-base leading-loose max-w-2xl">
            {t("lead")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 mt-16 border-t border-b border-text-gray/10">
          {keyNumbers.map((item, i) => (
            <motion.div
              key={item.key}
              className={`flex flex-col items-center text-center py-8${
                i < keyNumbers.length - 1 ? " sm:border-r sm:border-accent/20" : ""
              }${i > 0 ? " border-t sm:border-t-0 border-text-gray/10" : ""}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-150px" }}
              transition={{ duration: 1.1, delay: i * 0.15, ease: EASE }}
            >
              <span
                className="font-serif text-text-light font-bold leading-none"
                style={{ fontSize: "clamp(3.5rem, 7vw, 7rem)" }}
              >
                {item.value}
              </span>
              <span className="text-xs tracking-[0.25em] text-accent mt-4">
                {item.labelEn}
              </span>
              <span className="text-sm text-text-gray mt-1">{item.labelJa}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/hyrox/HyroxIntro.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/hyrox/HyroxIntro.tsx src/components/hyrox/HyroxIntro.test.tsx
git commit -m "feat(hyrox): What is HYROX セクションを追加"
```

---

## Task 5: HyroxStations コンポーネント

**Files:**
- Create: `src/components/hyrox/HyroxStations.tsx`
- Test: `src/components/hyrox/HyroxStations.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxStations from "./HyroxStations";

describe("HyroxStations", () => {
  it("8 STATIONS 見出しを表示する", () => {
    renderWithIntl(<HyroxStations />);
    expect(screen.getByRole("heading", { name: "8 STATIONS" })).toBeInTheDocument();
  });

  it("8種目すべての名称を表示する", () => {
    renderWithIntl(<HyroxStations />);
    expect(screen.getByText("SkiErg")).toBeInTheDocument();
    expect(screen.getByText("Wall Balls")).toBeInTheDocument();
    expect(screen.getByText("08")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/hyrox/HyroxStations.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

Create `src/components/hyrox/HyroxStations.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { HYROX_STATIONS } from "./stations";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxStations() {
  const t = useTranslations("HyroxPage.stations");

  return (
    <section className="bg-deep-black pb-24 lg:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em] text-text-light">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HYROX_STATIONS.map((station, i) => (
            <motion.div
              key={station.key}
              className="relative bg-gradient-to-b from-accent/[0.07] to-transparent px-6 py-8"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1.0, delay: 0.1 + i * 0.06, ease: EASE }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
              <span className="font-serif text-3xl text-accent block mb-3">
                {station.number}
              </span>
              <span className="text-text-light text-base font-bold tracking-wide block">
                {t(`${station.key}.name`)}
              </span>
              <span className="text-text-gray text-xs block mt-1">
                {t(`${station.key}.nameJa`)}
              </span>
              <span className="text-accent/50 text-[10px] tracking-wider block mt-3">
                {t("preparing")}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/hyrox/HyroxStations.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/hyrox/HyroxStations.tsx src/components/hyrox/HyroxStations.test.tsx
git commit -m "feat(hyrox): 8 stations グリッドを追加"
```

---

## Task 6: HyroxProgram コンポーネント（Coming Soon）

**Files:**
- Create: `src/components/hyrox/HyroxProgram.tsx`
- Test: `src/components/hyrox/HyroxProgram.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxProgram from "./HyroxProgram";

describe("HyroxProgram", () => {
  it("PROGRAM 見出しと Coming Soon を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByRole("heading", { name: "PROGRAM" })).toBeInTheDocument();
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });

  it("注記文を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(
      screen.getByText("プログラム・料金は準備中です。詳細が決まり次第お知らせします。"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/hyrox/HyroxProgram.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

Create `src/components/hyrox/HyroxProgram.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxProgram() {
  const t = useTranslations("HyroxPage.program");

  return (
    <section className="bg-deep-black pb-24 lg:pb-32 text-text-light">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em]">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <motion.div
          className="border border-text-gray/15 rounded-sm px-8 py-16 flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
        >
          <span className="text-accent text-sm tracking-[0.3em] uppercase">
            {t("comingSoon")}
          </span>
          <p className="mt-4 text-text-gray text-sm max-w-md leading-relaxed">
            {t("note")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/hyrox/HyroxProgram.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/hyrox/HyroxProgram.tsx src/components/hyrox/HyroxProgram.test.tsx
git commit -m "feat(hyrox): プログラム/料金(Coming Soon)セクションを追加"
```

---

## Task 7: ExerciseGym 構造化データ

**Files:**
- Create: `src/lib/structured-data/exerciseGym.ts`
- Modify: `src/lib/structured-data/index.ts`
- Test: `src/lib/structured-data/exerciseGym.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from "vitest";
import { buildExerciseGym } from "./exerciseGym";

describe("buildExerciseGym", () => {
  it("ja: url が /hyrox、@id が /#hyrox", () => {
    const schema = buildExerciseGym("ja");
    expect(schema["@type"]).toBe("ExerciseGym");
    expect(schema["@id"]).toBe("http://localhost:3000/#hyrox");
    expect(schema.url).toBe("http://localhost:3000/hyrox");
    expect(schema.sport).toContain("HYROX");
  });

  it("en: url が /en/hyrox", () => {
    const schema = buildExerciseGym("en");
    expect(schema.url).toBe("http://localhost:3000/en/hyrox");
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/structured-data/exerciseGym.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

Create `src/lib/structured-data/exerciseGym.ts`:

```ts
import { SITE_URL } from "@/constants/site";
import type { Locale } from "@/i18n/routing";

export interface ExerciseGymSchema {
  "@context": "https://schema.org";
  "@type": "ExerciseGym";
  "@id": string;
  name: string;
  url: string;
  parentOrganization: { "@id": string };
  sport: string[];
  areaServed: { "@type": "AdministrativeArea"; name: string };
}

export function buildExerciseGym(locale: Locale): ExerciseGymSchema {
  const url =
    locale === "ja" ? `${SITE_URL}/hyrox` : `${SITE_URL}/${locale}/hyrox`;
  return {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    "@id": `${SITE_URL}/#hyrox`,
    name: "THE PICKLE BANG THEORY — HYROX Training Area",
    url,
    parentOrganization: { "@id": `${SITE_URL}/#facility` },
    sport: ["HYROX", "Functional Fitness"],
    areaServed: { "@type": "AdministrativeArea", name: "千葉県市川市" },
  };
}
```

Modify `src/lib/structured-data/index.ts` — 末尾に追加:

```ts
export { buildExerciseGym } from "./exerciseGym";
export type { ExerciseGymSchema } from "./exerciseGym";
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/lib/structured-data/exerciseGym.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/structured-data/exerciseGym.ts src/lib/structured-data/index.ts src/lib/structured-data/exerciseGym.test.ts
git commit -m "feat(seo): HYROX 用 ExerciseGym 構造化データを追加"
```

---

## Task 8: buildServices に HYROX を追加

**Files:**
- Modify: `src/lib/structured-data/service.ts`
- Modify: `src/lib/structured-data/service.test.ts`

- [ ] **Step 1: テストを更新（先に期待値を変える）**

`src/lib/structured-data/service.test.ts` の「サービス件数」を検証している箇所を 5 → 6 に更新し、HYROX を含む検証を追加:

```ts
it("HYROX トレーニングを含む", () => {
  const services = buildServices();
  expect(services).toHaveLength(6);
  expect(services.some((s) => s.serviceType === "HYROXトレーニング")).toBe(true);
});
```

（既存の `toHaveLength(5)` を期待する他テストがあれば 6 に修正する。）

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/structured-data/service.test.ts`
Expected: FAIL（現状5件）

- [ ] **Step 3: 実装**

`src/lib/structured-data/service.ts` の `SERVICE_DEFINITIONS` 配列末尾に追加:

```ts
  {
    name: "HYROXトレーニング",
    description:
      "ランニングと8種目のファンクショナルワークアウトで競う世界的フィットネスレース HYROX。本格的なトレーニングエリアを併設予定。",
    serviceType: "HYROXトレーニング",
  },
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/lib/structured-data/service.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/structured-data/service.ts src/lib/structured-data/service.test.ts
git commit -m "feat(seo): Service 構造化データに HYROX を追加"
```

---

## Task 9: HyroxContent（Nav＋セクション＋Footer 合成）

**Files:**
- Create: `src/app/[locale]/hyrox/HyroxContent.tsx`
- Test: `src/app/[locale]/hyrox/HyroxContent.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";

vi.mock("@/components/home/HomeNavigation", () => ({ default: () => <nav data-testid="nav" /> }));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => <footer data-testid="footer" /> }));

import HyroxContent from "./HyroxContent";

describe("HyroxContent", () => {
  it("Nav・Footer・HYROX 見出しを描画する", () => {
    renderWithIntl(<HyroxContent />);
    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/app/[locale]/hyrox/HyroxContent.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

Create `src/app/[locale]/hyrox/HyroxContent.tsx`:

```tsx
"use client";

import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import HyroxHero from "@/components/hyrox/HyroxHero";
import HyroxIntro from "@/components/hyrox/HyroxIntro";
import HyroxStations from "@/components/hyrox/HyroxStations";
import HyroxProgram from "@/components/hyrox/HyroxProgram";

export default function HyroxContent() {
  return (
    <>
      <HomeNavigation />
      <main>
        <HyroxHero />
        <HyroxIntro />
        <HyroxStations />
        <HyroxProgram />
      </main>
      <HomeFooter />
    </>
  );
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/[locale]/hyrox/HyroxContent.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/[locale]/hyrox/HyroxContent.tsx src/app/[locale]/hyrox/HyroxContent.test.tsx
git commit -m "feat(hyrox): ページ本体(HyroxContent)を合成"
```

---

## Task 10: /hyrox ルート（page.tsx ＋ loading ＋ error）

**Files:**
- Create: `src/app/[locale]/hyrox/page.tsx`
- Create: `src/app/[locale]/hyrox/loading.tsx`
- Create: `src/app/[locale]/hyrox/error.tsx`
- Test: `src/app/[locale]/hyrox/page.test.tsx`
- Test: `src/app/[locale]/hyrox/boundaries.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**（`about/page.test.tsx` のパターンを踏襲）

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const mockGetTranslations = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./HyroxContent", () => ({ default: () => null }));
vi.mock("@/components/StructuredData", () => ({ default: () => null }));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: vi.fn().mockReturnValue({}),
  buildExerciseGym: vi.fn().mockReturnValue({}),
}));

describe("Hyrox generateMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  function buildMockT(keywords: string[]) {
    const mockT = ((key: string) => `translated:${key}`) as unknown as {
      (key: string): string;
      raw: (key: string) => unknown;
    };
    mockT.raw = (_key: string) => keywords;
    return mockT;
  }

  it("ja: canonical=/hyrox, og:locale=ja_JP", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT(["HYROX"]));
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ja" }) });
    expect(metadata.keywords).toEqual(["HYROX"]);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/hyrox");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/hyrox");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
  });

  it("en: canonical=/en/hyrox, og:locale=en_US", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT([]));
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/en/hyrox");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });
});

describe("Hyrox Page", () => {
  it("ja で描画できる", async () => {
    const { default: HyroxPage } = await import("./page");
    const element = await HyroxPage({ params: Promise.resolve({ locale: "ja" }) });
    const { container } = render(element);
    expect(container).toBeTruthy();
  });

  it("不正 locale で notFound", async () => {
    const { default: HyroxPage } = await import("./page");
    await expect(
      HyroxPage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/app/[locale]/hyrox/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

Create `src/app/[locale]/hyrox/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import StructuredData from "@/components/StructuredData";
import { SITE_URL } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { parseKeywords } from "@/lib/og-utils";
import { buildBreadcrumb, buildExerciseGym } from "@/lib/structured-data";

import HyroxContent from "./HyroxContent";

interface HyroxPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HyroxPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("hyrox.keywords"));
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/hyrox` : `${SITE_URL}/${locale}/hyrox`;

  return {
    title: t("hyrox.title"),
    description: t("hyrox.description"),
    keywords,
    openGraph: {
      title: t("hyrox.title"),
      description: t("hyrox.description"),
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/hyrox`,
        en: `${SITE_URL}/en/hyrox`,
        "x-default": `${SITE_URL}/hyrox`,
      },
    },
  };
}

export default async function HyroxPage({ params }: HyroxPageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [{ name: "HYROX", path: "/hyrox" }])}
      />
      <StructuredData data={buildExerciseGym(locale)} />
      <HyroxContent />
    </>
  );
}
```

Create `src/app/[locale]/hyrox/loading.tsx`:

```tsx
export default function Loading() {
  return <div className="min-h-screen bg-deep-black" aria-hidden="true" />;
}
```

Create `src/app/[locale]/hyrox/error.tsx`:

```tsx
"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-deep-black flex flex-col items-center justify-center gap-6 text-text-light">
      <p className="text-sm tracking-wide">ページを表示できませんでした。</p>
      <button
        onClick={reset}
        className="bg-accent text-deep-black px-6 py-3 text-xs font-bold uppercase tracking-widest"
      >
        再読み込み
      </button>
    </div>
  );
}
```

- [ ] **Step 4: error/loading のテストを追加**（カバレッジ100%のため）

Create `src/app/[locale]/hyrox/boundaries.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Loading from "./loading";
import ErrorBoundary from "./error";

describe("hyrox boundaries", () => {
  it("loading が描画される", () => {
    const { container } = render(<Loading />);
    expect(container.firstChild).toBeTruthy();
  });

  it("error の再読み込みで reset が呼ばれる", () => {
    const reset = vi.fn();
    render(<ErrorBoundary reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: テスト通過を確認**

Run: `npx vitest run src/app/[locale]/hyrox/`
Expected: PASS（page / boundaries）

- [ ] **Step 6: コミット**

```bash
git add src/app/[locale]/hyrox/page.tsx src/app/[locale]/hyrox/loading.tsx src/app/[locale]/hyrox/error.tsx src/app/[locale]/hyrox/page.test.tsx src/app/[locale]/hyrox/boundaries.test.tsx
git commit -m "feat(hyrox): /hyrox ルート(page/loading/error)を追加"
```

---

## Task 11: HomeHyroxPromo（ホーム誘導カード）

**Files:**
- Create: `src/components/home/HomeHyroxPromo.tsx`
- Test: `src/components/home/HomeHyroxPromo.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HomeHyroxPromo from "./HomeHyroxPromo";

describe("HomeHyroxPromo", () => {
  it("HYROX 見出しと CTA を表示する", () => {
    renderWithIntl(<HomeHyroxPromo />);
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
    expect(screen.getByText("DISCOVER HYROX")).toBeInTheDocument();
  });

  it("CTA が /hyrox へのリンク", () => {
    renderWithIntl(<HomeHyroxPromo />);
    const link = screen.getByRole("link", { name: /DISCOVER HYROX/ });
    expect(link).toHaveAttribute("href", "/hyrox");
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/home/HomeHyroxPromo.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

Create `src/components/home/HomeHyroxPromo.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HomeHyroxPromo() {
  const t = useTranslations("HomeHyroxPromo");

  return (
    <section className="bg-deep-black text-text-light">
      <div className="mx-auto max-w-7xl px-6 lg:px-12 py-12 lg:py-28">
        <motion.div
          className="relative grid grid-cols-1 lg:grid-cols-2 overflow-hidden rounded-none lg:rounded-sm border border-text-gray/15"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
          <div className="relative aspect-[16/10] lg:aspect-auto lg:min-h-[320px]">
            <Image
              src="/images/comingsoon.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover opacity-60"
            />
          </div>
          <div className="px-8 py-10 lg:px-12 lg:py-16 flex flex-col justify-center">
            <span className="text-[10px] tracking-[0.3em] text-accent uppercase mb-3">
              {t("kicker")}
            </span>
            <h2 className="font-serif text-4xl lg:text-5xl font-black tracking-[0.1em]">
              {t("title")}
            </h2>
            <p className="text-xs tracking-[0.2em] text-text-gray mt-2">
              {t("titleEn")}
            </p>
            <p className="text-sm text-text-gray leading-relaxed mt-5">
              {t("description")}
            </p>
            <Link
              href="/hyrox"
              className="inline-block mt-7 self-start bg-accent text-deep-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-colors"
            >
              {t("cta")}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/home/HomeHyroxPromo.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/home/HomeHyroxPromo.tsx src/components/home/HomeHyroxPromo.test.tsx
git commit -m "feat(home): HYROX 誘導カードを追加"
```

---

## Task 12: ホームに HomeHyroxPromo を挿入

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Modify: `src/app/[locale]/page.test.tsx`

- [ ] **Step 1: テストを更新**

`src/app/[locale]/page.test.tsx` に、HomeHyroxPromo が描画されるアサーションを追加。既存テストが各セクションを mock している場合は同様に mock し、レンダリング結果に含まれることを確認:

```tsx
vi.mock("@/components/home/HomeHyroxPromo", () => ({
  default: () => <div data-testid="home-hyrox-promo" />,
}));

it("HYROX 誘導カードを描画する", async () => {
  const { default: Home } = await import("./page");
  const element = await Home({ params: Promise.resolve({ locale: "ja" }) });
  render(element);
  expect(screen.getByTestId("home-hyrox-promo")).toBeInTheDocument();
});
```

（既存 `page.test.tsx` の mock/レンダリング方式に合わせること。`screen` 未 import の場合は追加。）

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/app/[locale]/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/app/[locale]/page.tsx` の import に追加:

```tsx
import HomeHyroxPromo from "@/components/home/HomeHyroxPromo";
```

JSX の `<HomeServices />` と `<HomePricing />` の間に挿入:

```tsx
        <HomeServices />
        <HomeHyroxPromo />
        <HomePricing />
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/[locale]/page.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/[locale]/page.tsx src/app/[locale]/page.test.tsx
git commit -m "feat(home): HYROX 誘導カードをホームに挿入"
```

---

## Task 13: グローバルナビに HYROX を追加

**Files:**
- Modify: `src/components/home/HomeNavigation.tsx`
- Modify: `src/components/home/HomeNavigation.test.tsx`

- [ ] **Step 1: テストを追加**

`src/components/home/HomeNavigation.test.tsx` に追加:

```tsx
it("ナビに HYROX ページリンクがある", () => {
  renderWithIntl(<HomeNavigation />);
  const links = screen.getAllByRole("link", { name: "HYROX" });
  expect(links.length).toBeGreaterThan(0);
  expect(links[0]).toHaveAttribute("href", "/hyrox");
});
```

（既存テストの import/レンダリング方式に合わせる。`HomeNavigation` は `usePathname`/`useActiveSection` を使うため、既存テストと同じセットアップを流用。）

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/home/HomeNavigation.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/components/home/HomeNavigation.tsx` の `NAV_ITEMS` に、`services` の直後へ追加:

```tsx
  { id: "services", kind: "anchor", href: "/#services" },
  { id: "hyrox", kind: "page", href: "/hyrox" },
  { id: "pricing", kind: "anchor", href: "/#pricing" },
```

`SECTION_IDS` は変更しない（別ページのため active 追跡対象外）。

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/home/HomeNavigation.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/home/HomeNavigation.tsx src/components/home/HomeNavigation.test.tsx
git commit -m "feat(nav): グローバルナビに HYROX を追加"
```

---

## Task 14: フッターに /hyrox リンクを追加

**Files:**
- Modify: `src/components/home/HomeFooter.tsx`
- Modify: `src/components/home/HomeFooter.test.tsx`

- [ ] **Step 1: 現状確認 → テストを追加**

まず `src/components/home/HomeFooter.tsx` を読み、`tokushoho` リンク（`next-intl` の `Link href="/tokushoho"`）の描画箇所を特定する。`HomeFooter.test.tsx` に追加:

```tsx
it("フッターに HYROX ページへのリンクがある", () => {
  renderWithIntl(<HomeFooter />);
  const link = screen.getByRole("link", { name: "HYROX" });
  expect(link).toHaveAttribute("href", "/hyrox");
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/home/HomeFooter.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`tokushoho` の `Link` と同じブロック内に、同じスタイルで HYROX リンクを追加。ラベルは固定文字列「HYROX」で ja/en 共通のため翻訳キーを増やさずベタ書きで可。スタイルは既存 `tokushoho` リンクに一致させる:

```tsx
<Link href="/hyrox" className="<tokushoho と同じ className>">
  HYROX
</Link>
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/home/HomeFooter.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/home/HomeFooter.tsx src/components/home/HomeFooter.test.tsx
git commit -m "feat(footer): フッターに HYROX リンクを追加"
```

---

## Task 15: HomeFacility の trainingArea を /hyrox 相互リンク化

**Files:**
- Modify: `src/components/home/HomeFacility.tsx`
- Modify: `src/components/home/HomeFacility.test.tsx`

- [ ] **Step 1: テストを追加**

`HomeFacility.test.tsx` に追加（name 正規表現は `messages` の `HomeFacility.features.trainingArea` 実値に合わせる）:

```tsx
it("trainingArea 機能が /hyrox へリンクしている", () => {
  renderWithIntl(<HomeFacility />);
  const link = screen.getByRole("link", { name: /トレーニングエリア|Training Area/i });
  expect(link).toHaveAttribute("href", "/hyrox");
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/home/HomeFacility.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/components/home/HomeFacility.tsx` 冒頭 import に追加:

```tsx
import { Link } from "@/i18n/navigation";
```

`FEATURE_KEYS.map(...)` 内で、`trainingArea` の項目のみラベルを `/hyrox` への `Link` でラップする。該当の `<span>{t(\`features.${feature.key}\`)}</span>` ＋ note ブロックを次のように分岐:

```tsx
{feature.key === "trainingArea" ? (
  <Link
    href="/hyrox"
    className="text-text-light text-sm lg:text-base hover:text-accent transition-colors"
  >
    {t(`features.${feature.key}`)}
    <span className="text-accent/60 text-xs ml-2 tracking-wider">→</span>
  </Link>
) : (
  <>
    <span className="text-text-light text-sm lg:text-base">
      {t(`features.${feature.key}`)}
    </span>
    {feature.hasNote && (
      <span className="text-accent/60 text-xs ml-2 tracking-wider">
        {t("features.preparing")}
      </span>
    )}
  </>
)}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/components/home/HomeFacility.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/home/HomeFacility.tsx src/components/home/HomeFacility.test.tsx
git commit -m "feat(facility): trainingArea を /hyrox へ相互リンク化"
```

---

## Task 16: sitemap に /hyrox を追加

**Files:**
- Modify: `src/constants/routes.ts`
- Modify: `src/app/sitemap.test.ts`

- [ ] **Step 1: テストを追加**

`src/app/sitemap.test.ts` に追加（既存の `sitemap()` 呼び出し方式に合わせる）:

```ts
it("/hyrox を ja/en alternates 付きで含む", async () => {
  const entries = await sitemap();
  const hyrox = entries.find((e) => e.url === "http://localhost:3000/hyrox");
  expect(hyrox).toBeDefined();
  expect(hyrox?.alternates?.languages?.en).toBe("http://localhost:3000/en/hyrox");
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/app/sitemap.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/constants/routes.ts` の `SITEMAP_ROUTES` に追加（`/about` の後）:

```ts
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/hyrox", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tokushoho", priority: 0.2, changeFrequency: "yearly" },
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/sitemap.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/constants/routes.ts src/app/sitemap.test.ts
git commit -m "feat(seo): sitemap に /hyrox を追加"
```

---

## Task 17: 全体検証

- [ ] **Step 1: 全テスト＋カバレッジ**

Run: `npx vitest run --coverage`
Expected: 全 PASS、カバレッジ statements/branches/functions/lines = 100%

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 4: ビルド**

Run: `npm run build`
Expected: 成功（`/hyrox` と `/en/hyrox` が生成される）

- [ ] **Step 5: 手動確認はユーザーが実施**

ローカルで `npm run dev` を起動し、ユーザーが以下を確認:
- `/hyrox` と `/en/hyrox` の表示（Hero / What is HYROX / 8 Stations / Program）
- ホームの HomeServices と HomePricing の間に誘導カードが表示され、`/hyrox` に遷移
- グローバルナビ・フッター・施設の trainingArea から `/hyrox` に遷移
- ja/en 切替で文言が変わる
- レスポンシブ（375 / 768 / 1440）

---

## Self-Review メモ

- **Spec coverage**: ルーティング(Task 10) / ナビ(13) / 誘導カード(11,12) / Facility 相互リンク(15) / フッター(14) / sitemap(16) / next-intl 静的(1) / メタデータ(10) / 構造化データ ExerciseGym＋Service(7,8) / Coming Soon プレースホルダ(1,6) / 各セクション UI(3-6) を網羅。
- **Placeholder scan**: コンテンツの「準備中/Coming Soon」は仕様上の意図的プレースホルダ。計画自体に TODO/TBD は無し。
- **Type consistency**: メッセージキー（`HyroxPage.*`, `HomeHyroxPromo.*`）は Task 1 で確定し各コンポーネントで同一参照。`buildExerciseGym(locale: Locale)` の型は Task 7 で定義し Task 10 で使用。
- **未確定依存**: 実コピー・写真・料金はコンテンツ確定後に messages とプレースホルダ画像を差し替えるのみ（構造変更不要）。
