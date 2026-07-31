# 支援者ウォール(/contributors)実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** クラウドファンディング支援者の掲載ページ `/contributors` を新設し、リターンで約束したウェブ掲載(お名前＋リンク)を果たす。

**Architecture:** 静的データ(`src/constants/contributors.ts`)を Server Component の `page.tsx` が読み、Client Component の `ContributorsContent` が描画する。既存の `/tokushoho` と同じ構成(page = メタデータ＋構造化データ、Content = ナビ＋本文＋フッター)を踏襲する。デザインは罫線・枠・番号を持たず、グリッドの整列と余白量だけで構成する。

**Tech Stack:** Next.js 16 App Router / TypeScript strict / Tailwind CSS v4 / next-intl / Vitest + React Testing Library

**設計書:** `docs/superpowers/specs/2026-07-31-contributors-wall-design.md`

## Global Constraints

- TDD 必須。Red → Green → Refactor。実装より先にテストを書く。
- カバレッジ 100%(statements / branches / functions / lines)。
- `any` 禁止。`React.FC` 禁止。型のみの import は `import type`。
- コンポーネントは `PascalCase.tsx`、テストは同階層に `ComponentName.test.tsx`。
- Server Component 既定。`"use client"` は対話・hooks・ブラウザ API が要る場合のみ。
- 画像は必ず `next/image`。
- 支援者の住所・電話番号・メールアドレス・郵便番号・支援金額・応援コメントは**リポジトリに持ち込まない**。
- 支援者の外部リンクは必ず `rel="sponsored nofollow noopener noreferrer"` かつ `target="_blank"`。
- 配色トークン: `bg-deep-black` / `text-text-light` / `text-text-gray` / `bg-accent`(#F6FF54)。
- 見出しは `font-serif`(= Orbitron)。
- コミットは Conventional Commits(`feat:` / `test:` / `refactor:` / `chore:`)。命令形。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/constants/contributors.ts` | 支援者データの単一の情報源。型定義と `byTier`。 |
| `src/constants/contributors.test.ts` | 上記の単体テスト。 |
| `src/components/contributors/ContributorLogo.tsx` | ロゴ1点の描画。面積の正規化だけを行う。 |
| `src/components/contributors/ContributorLogo.test.tsx` | 同テスト。 |
| `src/components/contributors/ContributorsContent.tsx` | ページ本体(ナビ＋ウォール＋フッター)。 |
| `src/components/contributors/ContributorsContent.test.tsx` | 同テスト。 |
| `src/app/[locale]/contributors/page.tsx` | メタデータ・構造化データ・Content の呼び出し。 |
| `src/app/[locale]/contributors/page.test.tsx` | `generateMetadata` のテスト。 |
| `messages/ja.json` / `messages/en.json` | 見出し・リード文・メタデータ・フッター文言。 |
| `src/constants/routes.ts` | `SITEMAP_ROUTES` に `/contributors` を追加。 |
| `src/components/home/HomeFooter.tsx` | フッターに支援者ウォールへのリンクを追加。 |

既存の `public/contributors/logos/` の3ファイルはそのまま使う。

---

## Task 1: 支援者データ層

**Files:**
- Create: `src/constants/contributors.ts`
- Create: `src/constants/contributors.test.ts`
- Reference: `src/app/contributors-proto/data.ts`(コピー元。Task 6 で削除する)

**Interfaces:**
- Produces: `ContributorTier`(`"large" | "medium" | "small"`), `ContributorLogoAsset`(`{ src: string; alt: string; aspect: number }`), `Contributor`(`{ id: string; tier: ContributorTier; name: string; url?: string; logo?: ContributorLogoAsset }`), `CONTRIBUTORS: readonly Contributor[]`, `byTier(tier: ContributorTier): readonly Contributor[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/constants/contributors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CONTRIBUTORS, byTier } from "./contributors";

describe("CONTRIBUTORS", () => {
  it("id が重複しない", () => {
    const ids = CONTRIBUTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("掲載名が空の支援者を持たない", () => {
    for (const c of CONTRIBUTORS) {
      expect(c.name.trim()).not.toBe("");
    }
  });

  it("リンクは全て https で始まる", () => {
    for (const c of CONTRIBUTORS) {
      if (c.url) expect(c.url.startsWith("https://")).toBe(true);
    }
  });

  it("ロゴを持つ支援者は 3 件(焼肉やまと・谷根千ラボ東京・ピックルボールワン)", () => {
    const withLogo = CONTRIBUTORS.filter((c) => c.logo);
    expect(withLogo.map((c) => c.id)).toEqual([
      "yamato",
      "yanesen-lab",
      "pickleball-one",
    ]);
  });

  it("ロゴの縦横比は正の数", () => {
    for (const c of CONTRIBUTORS) {
      if (c.logo) expect(c.logo.aspect).toBeGreaterThan(0);
    }
  });
});

describe("byTier", () => {
  it("指定ランクだけを定義順のまま返す", () => {
    const large = byTier("large");
    expect(large.length).toBeGreaterThan(0);
    for (const c of large) expect(c.tier).toBe("large");
    expect(large[0].id).toBe("yamato");
  });

  it("3 ランクの合計が全件と一致する", () => {
    const total =
      byTier("large").length + byTier("medium").length + byTier("small").length;
    expect(total).toBe(CONTRIBUTORS.length);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/constants/contributors.test.ts`
Expected: FAIL — `Failed to resolve import "./contributors"`

- [ ] **Step 3: データファイルを作る**

`src/app/contributors-proto/data.ts` を `src/constants/contributors.ts` にコピーし、以下を適用する。

```bash
cp src/app/contributors-proto/data.ts src/constants/contributors.ts
```

コピー後、`src/constants/contributors.ts` に次の編集を加える。

1. 冒頭の JSDoc を差し替える:

```ts
/**
 * 支援者ウォール(/contributors)の掲載データ。
 *
 * クラウドファンディングの支援者エクスポートから、掲載に必要な項目だけを抜き出したもの。
 * 住所・電話番号・メールアドレス・郵便番号・支援金額は意図的に一切持ち込まない。
 * 応援コメントもリターンの約束(お名前＋リンクの掲載)に含まれないため持たない。
 *
 * 設計書: docs/superpowers/specs/2026-07-31-contributors-wall-design.md
 */
```

2. `Contributor` インターフェースから `needsConfirmation` フィールドとその JSDoc を削除する(全件公開のため不要)。

3. データ配列内の全ての `needsConfirmation: true,` 行を削除する。掲載名の判断根拠を残したコメント(`// 備考: ...`)は**残す**。

4. 末尾の `contributorNumber` と `linkLabel` を削除する(採用デザイン 24 は通し番号もリンクラベルも使わない)。`TIER_ORDER` と `byTier` は残す。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/constants/contributors.test.ts`
Expected: PASS(7 tests)

- [ ] **Step 5: 型検査**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/constants/contributors.ts src/constants/contributors.test.ts
git commit -m "feat: 支援者ウォールの掲載データを追加"
```

---

## Task 2: ContributorLogo コンポーネント

**Files:**
- Create: `src/components/contributors/ContributorLogo.tsx`
- Create: `src/components/contributors/ContributorLogo.test.tsx`

**Interfaces:**
- Consumes: `ContributorLogoAsset` from `@/data/contributors`
- Produces: default export `ContributorLogo({ logo, height, className }: { logo: ContributorLogoAsset; height: number; className?: string })`

**背景:** 支給ロゴは縦横比が 1:1 〜 2.5:1 とばらつく。高さだけを揃えると正方形ロゴが横長ロゴの半分以下の面積になり、同じ列で明らかに弱く見える。そこで**面積**を揃える。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/contributors/ContributorLogo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ContributorLogo from "./ContributorLogo";

import type { ContributorLogoAsset } from "@/constants/contributors";

function asset(overrides: Partial<ContributorLogoAsset> = {}): ContributorLogoAsset {
  return {
    src: "/contributors/logos/sample.png",
    alt: "サンプル",
    aspect: 2,
    ...overrides,
  };
}

describe("ContributorLogo", () => {
  it("alt を持つ画像として描画する", () => {
    render(<ContributorLogo logo={asset({ alt: "焼肉やまと" })} height={40} />);

    expect(screen.getByRole("img", { name: "焼肉やまと" })).toBeInTheDocument();
  });

  it("基準縦横比(2.5)のロゴは height をそのまま使う", () => {
    render(<ContributorLogo logo={asset({ aspect: 2.5 })} height={40} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("height", "40");
    expect(img).toHaveAttribute("width", "100");
  });

  it("正方形ロゴは面積を揃えるため高さを引き上げる", () => {
    // sqrt(2.5 / 1.0) ≈ 1.58
    render(<ContributorLogo logo={asset({ aspect: 1 })} height={40} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("height", "63");
    expect(img).toHaveAttribute("width", "63");
  });

  it("極端に横長のロゴは高さを下げて面積を揃える", () => {
    // sqrt(2.5 / 6) ≈ 0.645
    render(<ContributorLogo logo={asset({ aspect: 6 })} height={40} />);

    expect(screen.getByRole("img")).toHaveAttribute("height", "26");
  });

  it("配色や下地を加工しない(反転・合成・プレートを行わない)", () => {
    const { container } = render(<ContributorLogo logo={asset()} height={40} />);
    const img = screen.getByRole("img");

    expect(img.className).not.toContain("invert");
    expect(img).not.toHaveStyle({ mixBlendMode: "screen" });
    expect(container.querySelector("[data-plate]")).toBeNull();
  });

  it("className を外側の要素へ渡す", () => {
    const { container } = render(
      <ContributorLogo logo={asset()} height={40} className="test-class" />,
    );

    expect(container.querySelector(".test-class")).not.toBeNull();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/contributors/ContributorLogo.test.tsx`
Expected: FAIL — `Failed to resolve import "./ContributorLogo"`

- [ ] **Step 3: 実装する**

`src/components/contributors/ContributorLogo.tsx`:

```tsx
import Image from "next/image";

import type { ContributorLogoAsset } from "@/constants/contributors";

/**
 * 面積を揃える基準となる縦横比。この比のロゴは指定 height がそのまま使われる。
 * 一般的な横組みロゴロックアップの比率に合わせている。
 */
const REFERENCE_ASPECT = 2.5;

interface ContributorLogoProps {
  readonly logo: ContributorLogoAsset;
  /** 基準高さ(px)。縦横比 2.5 のロゴでこの高さになる。 */
  readonly height: number;
  readonly className?: string;
}

/**
 * 支援者ロゴを支給されたまま表示する。
 *
 * 配色や下地には手を加えない(反転・合成・プレート敷きはしない)。加える正規化は
 * 大きさだけで、**高さではなく面積**を揃える。高さだけ揃えると正方形ロゴが横長ロゴの
 * 半分以下の面積になり、同じ列で明らかに弱く見えてしまうため。
 */
export default function ContributorLogo({ logo, height, className }: ContributorLogoProps) {
  const scale = Math.sqrt(REFERENCE_ASPECT / logo.aspect);
  const normalizedHeight = Math.round(height * scale);
  const width = Math.round(normalizedHeight * logo.aspect);

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <Image
        src={logo.src}
        alt={logo.alt}
        width={width}
        height={normalizedHeight}
        style={{ height: normalizedHeight, width: "auto" }}
      />
    </span>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/components/contributors/ContributorLogo.test.tsx`
Expected: PASS(6 tests)

- [ ] **Step 5: コミット**

```bash
git add src/components/contributors/ContributorLogo.tsx src/components/contributors/ContributorLogo.test.tsx
git commit -m "feat: 支援者ロゴの面積正規化コンポーネントを追加"
```

---

## Task 3: 翻訳メッセージの追加

**Files:**
- Modify: `messages/ja.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: 名前空間 `Contributors`(`title` / `titleJa` / `lede`)、`Metadata.contributors`(`title` / `description` / `keywords`)、`HomeFooter.contributors`

このタスクは Task 4・5 が参照する文言を先に用意する。

- [ ] **Step 1: ja.json に `Contributors` 名前空間を追加**

`messages/ja.json` のトップレベルに、`Tokushoho` の直後へ追加する:

```json
  "Contributors": {
    "title": "CONTRIBUTORS",
    "titleJa": "支援者ウォール",
    "lede": "THE PICKLE BANG THEORY は、この方々の手で始まりました。お名前は店内のウォールに刻まれ、この場所が続く限り残ります。"
  },
```

- [ ] **Step 2: ja.json の `Metadata` に `contributors` を追加**

`messages/ja.json` の `Metadata` オブジェクト内、`tokushoho` の直後へ追加する:

```json
    "contributors": {
      "title": "支援者ウォール",
      "description": "THE PICKLE BANG THEORY の立ち上げを支えてくださった支援者の皆さまをご紹介します。",
      "keywords": [
        "支援者",
        "クラウドファンディング",
        "THE PICKLE BANG THEORY",
        "ピックルボール",
        "市川"
      ]
    },
```

- [ ] **Step 3: ja.json の `HomeFooter` に `contributors` を追加**

`messages/ja.json` の `HomeFooter` オブジェクト内、`tokushoho` の直後へ追加する:

```json
    "contributors": "支援者ウォール",
```

- [ ] **Step 4: en.json に同じ 3 箇所を追加**

`messages/en.json` のトップレベル(`Tokushoho` の直後):

```json
  "Contributors": {
    "title": "CONTRIBUTORS",
    "titleJa": "Crowdfunding Supporters",
    "lede": "THE PICKLE BANG THEORY began with these people. Their names are engraved on the wall inside the facility, and will remain there for as long as this place stands."
  },
```

`Metadata` 内(`tokushoho` の直後):

```json
    "contributors": {
      "title": "Contributors",
      "description": "Meet the supporters who made the launch of THE PICKLE BANG THEORY possible.",
      "keywords": [
        "contributors",
        "crowdfunding",
        "THE PICKLE BANG THEORY",
        "pickleball",
        "Ichikawa"
      ]
    },
```

`HomeFooter` 内(`tokushoho` の直後):

```json
    "contributors": "Contributors",
```

- [ ] **Step 5: JSON として妥当か確認**

Run: `node -e "require('./messages/ja.json'); require('./messages/en.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 6: 既存の翻訳テストが通ることを確認**

Run: `npx vitest run src/i18n`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add messages/ja.json messages/en.json
git commit -m "feat: 支援者ウォールの翻訳メッセージを追加"
```

---

## Task 4: ContributorsContent(ページ本体)

**Files:**
- Create: `src/components/contributors/ContributorsContent.tsx`
- Create: `src/components/contributors/ContributorsContent.test.tsx`

**Interfaces:**
- Consumes: `byTier`, `Contributor` from `@/data/contributors`; `ContributorLogo` from `./ContributorLogo`; `HomeNavigation` / `HomeFooter` from `@/components/home/*`
- Produces: default export `ContributorsContent({ showColumns }: { showColumns?: boolean })`

**デザイン:** 罫線・枠・背景色・通し番号・モーションを一切持たない。区切りはグリッドの整列とセル間・ランク間の余白のみ。

**日本語の禁則:** `大洗町ビーチテニス＆ピックルボールクラブ` が「＆ピ / ックルボールクラブ」と折れるのを防ぐため、名前に `[line-break:strict]` を当てる(小書き仮名で行が始まるのを禁じる)。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/contributors/ContributorsContent.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ContributorsContent from "./ContributorsContent";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `translated:${key}`,
}));
vi.mock("@/components/home/HomeNavigation", () => ({
  default: () => <nav data-testid="nav" />,
}));
vi.mock("@/components/home/HomeFooter", () => ({
  default: () => <footer data-testid="footer" />,
}));

describe("ContributorsContent", () => {
  it("見出しと日本語サブタイトルとリード文を表示する", () => {
    render(<ContributorsContent />);

    expect(
      screen.getByRole("heading", { level: 1, name: "translated:title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("translated:titleJa")).toBeInTheDocument();
    expect(screen.getByText("translated:lede")).toBeInTheDocument();
  });

  it("ナビゲーションとフッターを表示する", () => {
    render(<ContributorsContent />);

    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("ロゴを持たない支援者は掲載名を表示する", () => {
    render(<ContributorsContent />);

    expect(screen.getByText("ピックルピーク")).toBeInTheDocument();
    expect(screen.getByText("ひろさん")).toBeInTheDocument();
    expect(screen.getByText("Suzuko K.")).toBeInTheDocument();
  });

  it("ロゴを持つ支援者は名前ではなくロゴを表示する", () => {
    render(<ContributorsContent />);

    expect(screen.getByRole("img", { name: "焼肉やまと" })).toBeInTheDocument();
    expect(screen.queryByText("焼肉やまと")).toBeNull();
  });

  it("外部リンクに sponsored / nofollow / noopener / noreferrer を付ける", () => {
    render(<ContributorsContent />);

    const link = screen.getByRole("link", { name: "ピックルピーク" });
    expect(link).toHaveAttribute("href", "https://pickle-peak.com/index.html");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual([
      "nofollow",
      "noopener",
      "noreferrer",
      "sponsored",
    ]);
  });

  it("リンクを持たない支援者はリンクにしない", () => {
    render(<ContributorsContent />);

    expect(screen.queryByRole("link", { name: "ひろさん" })).toBeNull();
  });

  it("3 つのランクをリストとして持ち、大ランクが最初に来る", () => {
    render(<ContributorsContent />);

    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(3);
    expect(within(lists[0]).getByRole("img", { name: "焼肉やまと" })).toBeInTheDocument();
  });

  it("日本語の禁則処理を掲載名に当てる", () => {
    render(<ContributorsContent />);

    const name = screen.getByText("大洗町ビーチテニス＆ピックルボールクラブ");
    expect(name.className).toContain("[line-break:strict]");
  });

  it("showColumns を HomeNavigation に渡せる", () => {
    render(<ContributorsContent showColumns />);

    expect(screen.getByTestId("nav")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/contributors/ContributorsContent.test.tsx`
Expected: FAIL — `Failed to resolve import "./ContributorsContent"`

- [ ] **Step 3: 実装する**

`src/components/contributors/ContributorsContent.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";

import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import { byTier } from "@/constants/contributors";

import ContributorLogo from "./ContributorLogo";

import type { Contributor, ContributorTier } from "@/constants/contributors";

/** 支援の対価として掲載するリンクに必要な rel(Google リンクスパムポリシー対応)。 */
const SPONSORED_REL = "sponsored nofollow noopener noreferrer";

/** ランクごとのロゴ基準高さ(px)。リターン規定の刻印サイズ差をウェブ上でも保つ。 */
const LOGO_HEIGHT: Record<ContributorTier, number> = {
  large: 78,
  medium: 48,
  small: 28,
};

/**
 * ランクごとの掲載名のクラス。`[line-break:strict]` は日本語の禁則処理で、
 * 小書き仮名(ッ・ャ 等)で行が始まるのを防ぐ。
 */
const NAME_CLASS: Record<ContributorTier, string> = {
  large:
    "text-2xl font-bold leading-[1.4] tracking-[0.02em] [line-break:strict] lg:text-3xl",
  medium: "text-lg font-semibold tracking-[0.02em] [line-break:strict] lg:text-xl",
  small: "text-[15px] leading-[1.9] text-text-light/70 [line-break:strict]",
};

/** ランクごとのセル最低高さ。ロゴと名前の行を光学的に揃える。 */
const CELL_MIN_HEIGHT: Record<ContributorTier, string> = {
  large: "min-h-24",
  medium: "min-h-16",
  small: "",
};

interface ContributorCellProps {
  readonly contributor: Contributor;
}

/** 罫線も枠も背景も持たないセル。区切りはセル間の余白だけ。 */
function ContributorCell({ contributor }: ContributorCellProps) {
  const body = contributor.logo ? (
    <ContributorLogo logo={contributor.logo} height={LOGO_HEIGHT[contributor.tier]} />
  ) : (
    <span className={NAME_CLASS[contributor.tier]}>{contributor.name}</span>
  );

  return (
    <li className={`flex items-center ${CELL_MIN_HEIGHT[contributor.tier]}`}>
      {contributor.url ? (
        <a
          href={contributor.url}
          target="_blank"
          rel={SPONSORED_REL}
          className="inline-flex items-center transition-opacity hover:opacity-60"
        >
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

interface ContributorsContentProps {
  /** COLUMN ナビリンク表示フラグ(server で isCmsColumnsEnabled() を渡す)。既定 false。 */
  readonly showColumns?: boolean;
}

/**
 * 支援者ウォール本体。
 *
 * 罫線・枠・背景色・通し番号を一切持たず、グリッドの整列と余白量だけで階層を示す。
 * ランクの呼称(大/中/小)と支援金額は表示しない。大きさの差だけでランクを表現する。
 */
export default function ContributorsContent({
  showColumns = false,
}: ContributorsContentProps) {
  const t = useTranslations("Contributors");

  return (
    <>
      <HomeNavigation showColumns={showColumns} />
      <main className="min-h-screen bg-deep-black text-text-light pt-[calc(6rem+var(--promo-banner-h))] lg:pt-[calc(7rem+var(--promo-banner-h))]">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:px-20 lg:py-32">
          <h1 className="font-serif text-3xl font-black tracking-[0.15em] sm:text-4xl lg:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mt-6 h-[3px] w-14 bg-accent" />

          <p className="mt-14 max-w-md text-sm leading-[2.4] text-text-gray">{t("lede")}</p>

          <ul className="mt-28 grid list-none gap-x-16 gap-y-20 sm:grid-cols-2 lg:mt-40 lg:grid-cols-3">
            {byTier("large").map((c) => (
              <ContributorCell key={c.id} contributor={c} />
            ))}
          </ul>

          <ul className="mt-28 grid list-none gap-x-16 gap-y-14 sm:grid-cols-2 lg:mt-40 lg:grid-cols-3">
            {byTier("medium").map((c) => (
              <ContributorCell key={c.id} contributor={c} />
            ))}
          </ul>

          <ul className="mt-28 grid list-none gap-x-16 gap-y-8 sm:grid-cols-2 lg:mt-40 lg:grid-cols-4">
            {byTier("small").map((c) => (
              <ContributorCell key={c.id} contributor={c} />
            ))}
          </ul>
        </div>
      </main>
      <HomeFooter />
    </>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/components/contributors/ContributorsContent.test.tsx`
Expected: PASS(9 tests)

- [ ] **Step 5: カバレッジを確認**

Run: `npx vitest run --coverage src/components/contributors`
Expected: `ContributorsContent.tsx` と `ContributorLogo.tsx` が statements / branches / functions / lines すべて 100%

100% に届かない場合は、不足している分岐(例: `showColumns` の既定値、`url` の有無、`logo` の有無)を突くテストを追加してから次へ進む。

- [ ] **Step 6: コミット**

```bash
git add src/components/contributors/ContributorsContent.tsx src/components/contributors/ContributorsContent.test.tsx
git commit -m "feat: 支援者ウォール本体を追加"
```

---

## Task 5: ページとメタデータ

**Files:**
- Create: `src/app/[locale]/contributors/page.tsx`
- Create: `src/app/[locale]/contributors/page.test.tsx`

**Interfaces:**
- Consumes: `ContributorsContent` from `@/components/contributors/ContributorsContent`; `buildBreadcrumb` from `@/lib/structured-data`; `isCmsColumnsEnabled` from `@/config/featureFlags`; `SITE_URL` / `OG_IMAGE` from `@/constants/site`; `parseKeywords` from `@/lib/og-utils`
- Produces: `generateMetadata`, default export `ContributorsPage`

`src/app/[locale]/tokushoho/page.tsx` と同じ構成を踏襲する。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/[locale]/contributors/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetTranslations = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
  setRequestLocale: vi.fn(),
}));

vi.mock("@/components/contributors/ContributorsContent", () => ({
  default: () => null,
}));
vi.mock("@/components/StructuredData", () => ({ default: () => null }));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: vi.fn().mockReturnValue({}),
}));

describe("Contributors generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildMockT(keywords: string[]) {
    const mockT = ((key: string) => `translated:${key}`) as unknown as {
      (key: string): string;
      raw: (key: string) => unknown;
    };
    mockT.raw = (_key: string) => keywords;
    return mockT;
  }

  it("日本語で canonical / og:url / alternates を返す", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT(["支援者", "クラウドファンディング"]));

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.keywords).toEqual(["支援者", "クラウドファンディング"]);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/contributors");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/contributors");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
    expect(metadata.alternates?.languages).toMatchObject({
      ja: "http://localhost:3000/contributors",
      en: "http://localhost:3000/en/contributors",
      "x-default": "http://localhost:3000/contributors",
    });
  });

  it("英語で canonical に /en/contributors を含める", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT(["contributors"]));

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/en/contributors");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });
});

describe("ContributorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("日本語のパンくずを組み立てる", async () => {
    const { buildBreadcrumb } = await import("@/lib/structured-data");
    const { default: ContributorsPage } = await import("./page");

    await ContributorsPage({ params: Promise.resolve({ locale: "ja" }) });

    expect(buildBreadcrumb).toHaveBeenCalledWith("ja", [
      { name: "支援者ウォール", path: "/contributors" },
    ]);
  });

  it("英語のパンくずを組み立てる", async () => {
    const { buildBreadcrumb } = await import("@/lib/structured-data");
    const { default: ContributorsPage } = await import("./page");

    await ContributorsPage({ params: Promise.resolve({ locale: "en" }) });

    expect(buildBreadcrumb).toHaveBeenCalledWith("en", [
      { name: "Contributors", path: "/contributors" },
    ]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run "src/app/[locale]/contributors/page.test.tsx"`
Expected: FAIL — `Failed to resolve import "./page"`

- [ ] **Step 3: 実装する**

`src/app/[locale]/contributors/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";

import StructuredData from "@/components/StructuredData";
import ContributorsContent from "@/components/contributors/ContributorsContent";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { SITE_URL, OG_IMAGE } from "@/constants/site";
import { parseKeywords } from "@/lib/og-utils";
import { buildBreadcrumb } from "@/lib/structured-data";

import type { Metadata } from "next";

interface ContributorsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ContributorsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("contributors.keywords"));
  const canonicalUrl =
    locale === "ja"
      ? `${SITE_URL}/contributors`
      : `${SITE_URL}/${locale}/contributors`;

  return {
    title: t("contributors.title"),
    description: t("contributors.description"),
    keywords,
    openGraph: {
      title: t("contributors.title"),
      description: t("contributors.description"),
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [OG_IMAGE],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/contributors`,
        en: `${SITE_URL}/en/contributors`,
        "x-default": `${SITE_URL}/contributors`,
      },
    },
  };
}

export default async function ContributorsPage({ params }: ContributorsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const breadcrumbName = locale === "ja" ? "支援者ウォール" : "Contributors";

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: breadcrumbName, path: "/contributors" },
        ])}
      />
      <ContributorsContent showColumns={isCmsColumnsEnabled()} />
    </>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run "src/app/[locale]/contributors/page.test.tsx"`
Expected: PASS(4 tests)

- [ ] **Step 5: 開発サーバーで実際に表示を確認**

Run: `npm run dev`
ブラウザで `http://localhost:3000/contributors` と `http://localhost:3000/en/contributors` を開く。

確認項目:
- ロゴ3点(焼肉やまと・YANESEN Lab Tokyo・PICKLEBALL ONE)が表示される
- `大洗町ビーチテニス＆ピックルボールクラブ` が「＆ピ / ックル」で折れていない
- ナビとフッターが既存ページと同じに出る
- コンソールにエラーが出ていない

- [ ] **Step 6: コミット**

```bash
git add "src/app/[locale]/contributors"
git commit -m "feat: 支援者ウォールページ(/contributors)を追加"
```

---

## Task 6: サイト内導線(sitemap・フッター)

**Files:**
- Modify: `src/constants/routes.ts`
- Modify: `src/app/sitemap.test.ts:19-31`
- Modify: `src/components/home/HomeFooter.tsx:95-104`
- Modify: `src/components/home/HomeFooter.test.tsx`

**Interfaces:**
- Consumes: `HomeFooter.contributors`(Task 3 で追加した翻訳キー)

- [ ] **Step 1: sitemap の失敗するテストを書く**

`src/app/sitemap.test.ts` の「静的ページ5つ + ニュース一覧1つ = 6エントリ（slugなし時）」テストを次のように書き換える(タイトル・件数・アサーション):

```ts
  it("静的ページ6つ + ニュース一覧1つ = 7エントリ（slugなし時）", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    expect(entries).toHaveLength(7);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${PROD_URL}`);
    expect(urls).toContain(`${PROD_URL}/about`);
    expect(urls).toContain(`${PROD_URL}/reserve`);
    expect(urls).toContain(`${PROD_URL}/hyrox`);
    expect(urls).toContain(`${PROD_URL}/tokushoho`);
    expect(urls).toContain(`${PROD_URL}/contributors`);
    expect(urls).toContain(`${PROD_URL}/news`);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/app/sitemap.test.ts`
Expected: FAIL — `expected 6 to be 7`

- [ ] **Step 3: SITEMAP_ROUTES に追加**

`src/constants/routes.ts` の `SITEMAP_ROUTES` 配列、`/tokushoho` の直前に追加する:

```ts
  { path: "/contributors", priority: 0.5, changeFrequency: "yearly" },
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/app/sitemap.test.ts`
Expected: PASS

- [ ] **Step 5: フッターの失敗するテストを書く**

`src/components/home/HomeFooter.test.tsx` の末尾、`describe("HomeFooter", ...)` の中に追加する:

`HomeFooter.test.tsx` は `NextIntlClientProvider` に実際の `messages/ja.json` を渡す方式なので、
リンク名には Task 3 で追加した**日本語の実文言**を指定する。既存の「特定商取引法リンクを表示する」
テストの直後に追加する:

```tsx
  it("支援者ウォールへのリンクを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    const link = screen.getByRole("link", { name: "支援者ウォール" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/contributors");
  });
```

- [ ] **Step 6: テストを実行して失敗を確認**

Run: `npx vitest run src/components/home/HomeFooter.test.tsx`
Expected: FAIL — 該当するリンクが見つからない

- [ ] **Step 7: フッターにリンクを追加**

`src/components/home/HomeFooter.tsx` の最下部バー、`/tokushoho` リンクの直後に追加する:

```tsx
            <Link
              href="/contributors"
              className="text-xs text-text-gray hover:text-text-light transition-colors"
            >
              {tFooter("contributors")}
            </Link>
```

- [ ] **Step 8: テストを実行して成功を確認**

Run: `npx vitest run src/components/home/HomeFooter.test.tsx src/app/sitemap.test.ts`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/constants/routes.ts src/app/sitemap.test.ts src/components/home/HomeFooter.tsx src/components/home/HomeFooter.test.tsx
git commit -m "feat: 支援者ウォールをサイトマップとフッターに結線"
```

---

## Task 7: 見た目検証ルートの撤去

**Files:**
- Delete: `src/app/contributors-proto/`(ディレクトリごと)
- Modify: `src/middleware.ts:40-43`
- Modify: `src/middleware.test.ts`

見た目検証(25案)は役目を終えたため撤去する。`public/contributors/logos/` は本実装が使うので**残す**。

- [ ] **Step 1: プロトタイプを削除**

```bash
git rm -r src/app/contributors-proto
```

- [ ] **Step 2: middleware のテストから該当ケースを削除**

`src/middleware.test.ts` から次のテストブロックを削除する:

```ts
    it("/contributors-proto は i18n ミドルウェアの対象外", async () => {
      // 支援者ウォールの見た目検証ルート(app 直下・locale 非依存)。
      // 除外しないと /ja/contributors-proto へ書き換えられ 404 になる。
      expect(await runsMiddleware("/contributors-proto")).toBe(false);
      expect(await runsMiddleware("/contributors-proto/01")).toBe(false);
    });
```

- [ ] **Step 3: middleware の matcher を元に戻す**

`src/middleware.ts` の `config` を次に置き換える:

```ts
export const config = {
  // locale 非依存のルートは i18n ルーティング対象外にする:
  //   - growth       … 管理ページ(/growth/approve)
  //   - draft-frame  … 下書きライブプレビュー iframe(route group (growth-preview)・URL=/draft-frame, #102)
  // どちらも app 直下(=[locale] 配下ではない)ため、ここで除外しないと /ja/... へ
  // 書き換えられて 404 になる。(growth-preview) 配下にルートを増やす場合も同様に追記すること。
  matcher: [
    "/((?!api|growth|draft-frame|_next/static|_next/image|favicon.ico|images|logos|.*\\..*).*)",
  ],
};
```

> 注意: `/contributors` は `[locale]` 配下の通常ページなので、matcher から除外しては**いけない**。

- [ ] **Step 4: middleware のテストが通ることを確認**

Run: `npx vitest run src/middleware.test.ts`
Expected: PASS

- [ ] **Step 5: `/contributors` が 404 にならないことを確認**

Run: `npm run dev`
ブラウザで `http://localhost:3000/contributors` を開き、200 で表示されることを確認する。

- [ ] **Step 6: コミット**

```bash
git add -A src/app/contributors-proto src/middleware.ts src/middleware.test.ts
git commit -m "chore: 支援者ウォールの見た目検証ルートを撤去"
```

---

## Task 8: 全体検証

**Files:** なし(検証のみ)

- [ ] **Step 1: 全テストを実行**

Run: `npx vitest run`
Expected: 全テスト PASS、失敗ゼロ

- [ ] **Step 2: カバレッジ閾値を確認**

Run: `npx vitest run --coverage`
Expected: statements / branches / functions / lines がいずれも 100%(閾値未達ならビルドが落ちる)

- [ ] **Step 3: 型検査**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: 本番ビルド**

Run: `npm run build`
Expected: 成功。`/[locale]/contributors` がルート一覧に出ること。

- [ ] **Step 5: ブランチをプッシュ**

```bash
gh auth status
```

`ttmakhr1028ai-art` がアクティブでない場合は先に切り替える:

```bash
gh auth switch --user ttmakhr1028ai-art
```

その後プッシュする:

```bash
git push -u origin feature/contributors-wall-proto
```

---

## 実装をブロックしない申し送り

以下は実装後に人間が処理する。コードの変更は伴わない。

1. **スプレッドシートの全件確認** — Drive 経由の読み取りが 24 名目の途中で切れており、25 名目以降が存在する可能性がある。CSV エクスポートで全件を確定し、不足があれば `src/constants/contributors.ts` に追記する。
2. **本名転記の確認** — `小野 正善`・`ひろさん`・`豊田 毅彦` など備考欄に掲載名の記載が無かった支援者について、現在の掲載名は支援者情報の「氏名」欄からの転記であり、本人が掲載を希望した名前ではない。公開前に確認する。
3. **未確定 7 名** — 設計書 §6.2 の一覧。掲載名が確定したら `src/constants/contributors.ts` を更新する。
