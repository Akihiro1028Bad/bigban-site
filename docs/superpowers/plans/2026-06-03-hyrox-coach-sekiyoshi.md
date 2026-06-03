# HYROX コーチ紹介＋実写ギャラリー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HYROXページに担当コーチ「関吉大亮」紹介セクションと実写アクションギャラリーを追加し、提供画像を最適化配置する。

**Architecture:** 既存 `/hyrox`（HyroxContent が各セクションを合成）に新コンポーネント `HyroxCoach` / `HyroxGallery` を追加し、`HyroxStations` に雰囲気バンド画像を追加。文言は `HyroxPage` 名前空間（ja/en）に追加。画像は `public/images/hyrox/` に最適化配置し `next/image` で配信。

**Tech Stack:** Next.js 16 App Router, TypeScript(strict), Tailwind v4, Framer Motion, next-intl, Vitest + RTL, sips(画像処理)。

参照仕様書: `docs/superpowers/specs/2026-06-03-hyrox-coach-sekiyoshi-design.md`

---

## ファイル構成

| 種別 | パス | 責務 |
|---|---|---|
| 新規 | `public/images/hyrox/*.jpg`（8点） | 最適化済み画像 |
| 変更 | `messages/ja.json` / `messages/en.json` | `HyroxPage.coach` / `HyroxPage.gallery` / `stations.bandAlt` 追加 |
| 新規 | `src/components/hyrox/HyroxCoach.tsx`(+test) | コーチ紹介 |
| 新規 | `src/components/hyrox/HyroxGallery.tsx`(+test) | IN ACTION ギャラリー |
| 変更 | `src/components/hyrox/HyroxStations.tsx`(+test) | 雰囲気バンド画像追加 |
| 変更 | `src/app/[locale]/hyrox/HyroxContent.tsx` | 新セクション挿入 |

テストは `renderWithIntl`（`@/test-utils/intl-wrapper`、既定 ja）を使用。`next/image` のモックは不要（既存 hyrox テストと同方針）。

---

## Task 1: 画像の最適化・配置

**Files:**
- Create: `public/images/hyrox/coach-portrait.jpg`, `coach-apac.jpg`, `action-sandbag-carry.jpg`, `action-lunge.jpg`, `action-sled-push.jpg`, `action-row.jpg`, `action-sled-pull.jpg`, `action-finish.jpg`, `arena-band.jpg`

- [ ] **Step 1: 出力ディレクトリ作成**

Run:
```bash
mkdir -p public/images/hyrox && ls -d public/images/hyrox
```
Expected: `public/images/hyrox`

- [ ] **Step 2: 画像を変換・リサイズして配置**（HEICは回転＋JPEG変換）

Run:
```bash
SRC=~/Desktop/【共有】関吉さん; OUT=public/images/hyrox
sips -Z 1800 -s format jpeg "$SRC/260520-OKB 68_Original.JPG" --out "$OUT/coach-portrait.jpg"
sips -r 90 -Z 1800 -s format jpeg "$SRC/IMG_6780.HEIC" --out "$OUT/coach-apac.jpg"
sips -Z 1800 -s format jpeg "$SRC/44DD94C1-D1C5-4BFB-BF3A-7C3C18BCEBEB.jpg" --out "$OUT/action-sandbag-carry.jpg"
sips -Z 1800 -s format jpeg "$SRC/IMG_7643.JPG" --out "$OUT/action-lunge.jpg"
sips -Z 1800 -s format jpeg "$SRC/IMG_4472.JPG" --out "$OUT/action-sled-push.jpg"
sips -Z 1800 -s format jpeg "$SRC/IMG_7646.JPG" --out "$OUT/action-row.jpg"
sips -Z 1800 -s format jpeg "$SRC/IMG_1825.JPG" --out "$OUT/action-sled-pull.jpg"
sips -Z 1800 -s format jpeg "$SRC/IMG_5812.JPG" --out "$OUT/action-finish.jpg"
sips -Z 1800 -s format jpeg "$SRC/IMG_5801.JPG" --out "$OUT/arena-band.jpg"
ls -la "$OUT"
```
Expected: 9枚の jpg が生成される。

- [ ] **Step 3: coach-apac.jpg の向きを目視確認**

`coach-apac.jpg`（#13）が**正立（人物が直立・テキスト水平）**かを開いて確認。横倒しなら `sips -r 270 ...` で再生成して上書き。

- [ ] **Step 4: Commit**

```bash
git add public/images/hyrox
git commit -m "feat(hyrox): コーチ/実写画像を最適化して配置"
```

---

## Task 2: i18n メッセージ追加（HyroxPage.coach / gallery / stations.bandAlt）

**Files:**
- Modify: `messages/ja.json`
- Modify: `messages/en.json`

- [ ] **Step 1: ja.json の `HyroxPage.stations` に `bandAlt` を追加**

`"preparing": "準備中",` の直後に追加:

```json
      "bandAlt": "HYROX大会のアリーナ",
```

- [ ] **Step 2: ja.json の `HyroxPage` に `coach` と `gallery` を追加**（`program` ブロックの後、`HyroxPage` 閉じ括弧の直前）

`"program": { ... }` の閉じ `}` の後にカンマを付け、続けて追加:

```json
    "coach": {
      "eyebrow": "COACH",
      "name": "関吉大亮",
      "nameEn": "DAISUKE SEKIYOSHI",
      "role": "HYROX担当コーチ",
      "titles": [
        "HYROX Japan アンバサダー",
        "HYROX PRO アスリート",
        "元スパルタンレース日本代表（2017–2023 / 2018 日韓シリーズ総合優勝）"
      ],
      "stats": {
        "pbLabel": "PERSONAL BEST",
        "pbValue": "1:01:45",
        "racesLabel": "RACES / SEASONS",
        "racesValue": "18 / 3",
        "apacLabel": "STAGE",
        "apacValue": "APAC CHAMP.",
        "signatureLabel": "SIGNATURE",
        "signatureValue": "WALL BALLS"
      },
      "bio": "日本のHYROXシーンを切り拓いてきたPROアスリート。スパルタンレース日本代表として世界を転戦し、現在はHYROX Japanアンバサダーとして競技の普及を牽引。ストイックな鍛錬で限界を更新し続ける。",
      "instagram": "@syugyou_sou",
      "instagramAria": "関吉大亮のInstagramを開く（新しいタブ）",
      "portraitAlt": "HYROX担当コーチ 関吉大亮",
      "apacAlt": "HYROX APAC選手権での関吉大亮"
    },
    "gallery": {
      "title": "IN ACTION",
      "titleJa": "実戦の現場",
      "items": [
        { "alt": "サンドバッグキャリー" },
        { "alt": "サンドバッグランジ" },
        { "alt": "スレッドプッシュ" },
        { "alt": "ローイング" },
        { "alt": "スレッドプル" },
        { "alt": "フィニッシュへ走る関吉大亮" }
      ]
    }
```

- [ ] **Step 3: en.json の `HyroxPage.stations` に `bandAlt` を追加**

`"preparing"` 行の直後に追加:

```json
      "bandAlt": "HYROX competition arena",
```

- [ ] **Step 4: en.json の `HyroxPage` に `coach` と `gallery` を追加**（`program` ブロックの後）

```json
    "coach": {
      "eyebrow": "COACH",
      "name": "DAISUKE SEKIYOSHI",
      "nameEn": "関吉大亮",
      "role": "HYROX COACH",
      "titles": [
        "HYROX Japan Ambassador",
        "HYROX PRO Athlete",
        "Former Spartan Race Team Japan (2017–2023 / 2018 Japan-Korea Series Champion)"
      ],
      "stats": {
        "pbLabel": "PERSONAL BEST",
        "pbValue": "1:01:45",
        "racesLabel": "RACES / SEASONS",
        "racesValue": "18 / 3",
        "apacLabel": "STAGE",
        "apacValue": "APAC CHAMP.",
        "signatureLabel": "SIGNATURE",
        "signatureValue": "WALL BALLS"
      },
      "bio": "A PRO athlete who helped pioneer Japan's HYROX scene. He raced worldwide with Spartan Race Team Japan and now drives the sport's growth as a HYROX Japan ambassador, relentlessly pushing his limits through disciplined training.",
      "instagram": "@syugyou_sou",
      "instagramAria": "Open Daisuke Sekiyoshi's Instagram (new tab)",
      "portraitAlt": "HYROX Coach Daisuke Sekiyoshi",
      "apacAlt": "Daisuke Sekiyoshi at the HYROX APAC Championships"
    },
    "gallery": {
      "title": "IN ACTION",
      "titleJa": "On the race floor",
      "items": [
        { "alt": "Sandbag carry" },
        { "alt": "Sandbag lunges" },
        { "alt": "Sled push" },
        { "alt": "Rowing" },
        { "alt": "Sled pull" },
        { "alt": "Daisuke Sekiyoshi running to the finish" }
      ]
    }
```

- [ ] **Step 5: JSON 妥当性確認**

Run: `python3 -c "import json; json.load(open('messages/ja.json')); json.load(open('messages/en.json')); print('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add messages/ja.json messages/en.json
git commit -m "feat(hyrox): コーチ/ギャラリー用 i18n を追加"
```

---

## Task 3: HyroxCoach コンポーネント

**Files:**
- Create: `src/components/hyrox/HyroxCoach.tsx`
- Test: `src/components/hyrox/HyroxCoach.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxCoach from "./HyroxCoach";

describe("HyroxCoach", () => {
  it("コーチ名と肩書きを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByRole("heading", { name: "関吉大亮" })
    ).toBeInTheDocument();
    expect(screen.getByText("HYROX担当コーチ")).toBeInTheDocument();
  });

  it("称号と数値スタッツを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(screen.getByText("HYROX Japan アンバサダー")).toBeInTheDocument();
    expect(screen.getByText("1:01:45")).toBeInTheDocument();
    expect(screen.getByText("WALL BALLS")).toBeInTheDocument();
  });

  it("Instagram への外部リンクを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    const link = screen.getByRole("link", { name: /Instagram/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.instagram.com/syugyou_sou/"
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("ポートレート画像に alt を設定する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByAltText("HYROX担当コーチ 関吉大亮")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/hyrox/HyroxCoach.test.tsx`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: 実装**

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EXTERNAL_LINK_PROPS } from "@/constants/site";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const INSTAGRAM_URL = "https://www.instagram.com/syugyou_sou/";

export default function HyroxCoach() {
  const t = useTranslations("HyroxPage.coach");
  const titles = t.raw("titles") as string[];
  const stats = [
    { label: t("stats.pbLabel"), value: t("stats.pbValue") },
    { label: t("stats.racesLabel"), value: t("stats.racesValue") },
    { label: t("stats.apacLabel"), value: t("stats.apacValue") },
    { label: t("stats.signatureLabel"), value: t("stats.signatureValue") },
  ];

  return (
    <section className="bg-deep-black py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16 lg:px-12">
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden border border-accent/20 border-t-2 border-t-accent">
            <Image
              src="/images/hyrox/coach-portrait.jpg"
              alt={t("portraitAlt")}
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-5 -right-3 hidden aspect-[4/3] w-32 overflow-hidden border border-accent/30 sm:block lg:w-40">
            <Image
              src="/images/hyrox/coach-apac.jpg"
              alt={t("apacAlt")}
              fill
              sizes="160px"
              className="object-cover"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
        >
          <p className="mb-4 text-[10px] tracking-[0.4em] text-accent">
            {t("eyebrow")}
          </p>
          <h2 className="font-serif text-4xl font-black tracking-[0.08em] text-text-light sm:text-5xl">
            {t("name")}
          </h2>
          <p className="mt-2 text-xs tracking-[0.3em] text-text-gray">
            {t("nameEn")}
          </p>
          <p className="mt-1 text-xs tracking-[0.2em] text-accent/80">
            {t("role")}
          </p>
          <div className="mt-5 h-[3px] w-14 bg-accent" />

          <ul className="mt-6 space-y-2">
            {titles.map((title) => (
              <li
                key={title}
                className="relative pl-5 text-sm leading-relaxed text-text-light/85 before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:bg-accent"
              >
                {title}
              </li>
            ))}
          </ul>

          <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[10px] tracking-[0.2em] text-text-gray">
                  {s.label}
                </dt>
                <dd className="mt-1 font-serif text-lg text-accent sm:text-xl">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-sm leading-relaxed text-text-light/75">
            {t("bio")}
          </p>

          <a
            href={INSTAGRAM_URL}
            {...EXTERNAL_LINK_PROPS}
            aria-label={t("instagramAria")}
            className="mt-6 inline-flex items-center gap-2 text-xs tracking-[0.2em] text-accent transition-colors hover:text-accent/80"
          >
            Instagram {t("instagram")}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/hyrox/HyroxCoach.test.tsx`
Expected: PASS（4件）

- [ ] **Step 5: Commit**

```bash
git add src/components/hyrox/HyroxCoach.tsx src/components/hyrox/HyroxCoach.test.tsx
git commit -m "feat(hyrox): コーチ紹介 HyroxCoach を追加"
```

---

## Task 4: HyroxGallery コンポーネント

**Files:**
- Create: `src/components/hyrox/HyroxGallery.tsx`
- Test: `src/components/hyrox/HyroxGallery.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxGallery from "./HyroxGallery";

describe("HyroxGallery", () => {
  it("IN ACTION 見出しを表示する", () => {
    renderWithIntl(<HyroxGallery />);
    expect(
      screen.getByRole("heading", { name: "IN ACTION" })
    ).toBeInTheDocument();
  });

  it("6枚のアクション画像を表示する", () => {
    renderWithIntl(<HyroxGallery />);
    expect(screen.getAllByRole("img")).toHaveLength(6);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/hyrox/HyroxGallery.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const IMAGE_SRCS = [
  "/images/hyrox/action-sandbag-carry.jpg",
  "/images/hyrox/action-lunge.jpg",
  "/images/hyrox/action-sled-push.jpg",
  "/images/hyrox/action-row.jpg",
  "/images/hyrox/action-sled-pull.jpg",
  "/images/hyrox/action-finish.jpg",
] as const;

export default function HyroxGallery() {
  const t = useTranslations("HyroxPage.gallery");
  const items = t.raw("items") as { alt: string }[];

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
          <h2 className="font-serif text-4xl font-black tracking-[0.15em] text-text-light sm:text-5xl lg:text-6xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mt-4 h-[3px] w-14 bg-accent" />
        </motion.div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {IMAGE_SRCS.map((src, idx) => (
            <motion.div
              key={src}
              className="relative aspect-[4/5] overflow-hidden"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, delay: idx * 0.05, ease: EASE }}
            >
              <Image
                src={src}
                alt={items[idx]?.alt ?? ""}
                fill
                sizes="(min-width: 1024px) 33vw, 50vw"
                loading="lazy"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/hyrox/HyroxGallery.test.tsx`
Expected: PASS（2件）

- [ ] **Step 5: Commit**

```bash
git add src/components/hyrox/HyroxGallery.tsx src/components/hyrox/HyroxGallery.test.tsx
git commit -m "feat(hyrox): 実写ギャラリー HyroxGallery を追加"
```

---

## Task 5: HyroxStations に雰囲気バンド画像を追加

**Files:**
- Modify: `src/components/hyrox/HyroxStations.tsx`
- Modify: `src/components/hyrox/HyroxStations.test.tsx`

- [ ] **Step 1: テストにバンド画像の検証を追加**

`HyroxStations.test.tsx` の `describe` 内末尾に追加:

```tsx
  it("雰囲気バンド画像を表示する", () => {
    renderWithIntl(<HyroxStations />);
    expect(screen.getByAltText("HYROX大会のアリーナ")).toBeInTheDocument();
  });
```

ファイル冒頭の import に `Image` 系は不要（screen のみ）。先頭で `import Image from "next/image";` は追加しない（テストでは使わない）。

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/components/hyrox/HyroxStations.test.tsx`
Expected: FAIL（バンド未実装）

- [ ] **Step 3: 実装（HyroxStations.tsx）**

冒頭 import に `next/image` を追加:

```tsx
import Image from "next/image";
```

見出しの `motion.div`（`{t("titleJa")}` と罫線を含むブロック）の閉じ `</motion.div>` の直後、`<div className="grid ...">` の前に、バンドを挿入:

```tsx
        <motion.div
          className="relative mb-12 aspect-[21/9] w-full overflow-hidden border-t-2 border-t-accent"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <Image
            src="/images/hyrox/arena-band.jpg"
            alt={t("bandAlt")}
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-deep-black/80 to-transparent" />
        </motion.div>
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/components/hyrox/HyroxStations.test.tsx`
Expected: PASS（3件）

- [ ] **Step 5: Commit**

```bash
git add src/components/hyrox/HyroxStations.tsx src/components/hyrox/HyroxStations.test.tsx
git commit -m "feat(hyrox): Stations に雰囲気バンド画像を追加"
```

---

## Task 6: HyroxContent に新セクションを挿入

**Files:**
- Modify: `src/app/[locale]/hyrox/HyroxContent.tsx`

- [ ] **Step 1: テスト不要（合成のみ）。import と挿入を行う**

`HyroxContent.tsx` を以下に更新:

```tsx
"use client";

import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import HyroxHero from "@/components/hyrox/HyroxHero";
import HyroxIntro from "@/components/hyrox/HyroxIntro";
import HyroxCoach from "@/components/hyrox/HyroxCoach";
import HyroxStations from "@/components/hyrox/HyroxStations";
import HyroxGallery from "@/components/hyrox/HyroxGallery";
import HyroxProgram from "@/components/hyrox/HyroxProgram";

export default function HyroxContent() {
  return (
    <>
      <HomeNavigation />
      <main>
        <HyroxHero />
        <HyroxIntro />
        <HyroxCoach />
        <HyroxStations />
        <HyroxGallery />
        <HyroxProgram />
      </main>
      <HomeFooter />
    </>
  );
}
```

- [ ] **Step 2: 既存の HyroxContent テストが通ることを確認**

Run: `npx vitest run "src/app/[locale]/hyrox/HyroxContent.test.tsx"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/hyrox/HyroxContent.tsx"
git commit -m "feat(hyrox): コーチ/ギャラリーをページに挿入"
```

---

## Task 7: 全体検証

- [ ] **Step 1: 型チェック**

Run: `rm -rf .next/dev/types .next/types && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 2: 全テスト**

Run: `npx vitest run`
Expected: 全テスト PASS

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 4: ブラウザ確認（手動）**

`npm run dev` を起動し http://localhost:3000/hyrox（ja）/ http://localhost:3000/en/hyrox（en）で、Hero → What is HYROX → COACH（関吉大亮）→ Stations（バンド画像）→ IN ACTION → Program の順に表示され、画像が崩れず、#13(APAC) が正立していることを確認。

---

## 完了条件
- `/hyrox`（ja/en）に COACH セクションと IN ACTION ギャラリーが表示される
- Stations に雰囲気バンド画像が表示される
- 画像は `public/images/hyrox/` に最適化配置され、`next/image` で表示される
- Hero は変更されていない
- 全テスト PASS、`tsc` クリーン、`lint` クリーン
