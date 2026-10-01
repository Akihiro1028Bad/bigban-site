# 貸切・法人ページ + 問い合わせ種別「貸切・法人」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 貸切・法人の専用ページ `/private`(ja/en)を新設し、問い合わせフォームに種別「貸切・法人」を追加して `/about?category=private#contact` でプリセレクトできるようにする。

**Architecture:** 種別の値一覧を `src/constants/contact.ts` に集約し、API・about ページ・フォームで共有する。`/about`(force-dynamic)の `page.tsx` が検証済みの `searchParams.category` を `AboutContent` の `initialCategory` に渡す。`/private` は reserve/hyrox と同じ構成(サーバー page + クライアントの小部品)。導線はトップ料金注記・フッター・sitemap。

**Tech Stack:** Next.js 16 App Router / next-intl / Framer Motion / Vitest + Testing Library。**新しい依存は追加しない。**

## Global Constraints

設計書 `docs/superpowers/specs/2026-10-01-szb-436-private-corporate-design.md` より。

- 料金・実績・電話番号・折り返し日数・支払い/キャンセル条件・人数の数字・「企業イベント」「大会利用」の語を**ページに載せない**。料金は「お問い合わせください」。
- ヘッダーメニュー(`NAV_ITEMS`)は変更しない。導線はトップ料金注記とフッターのみ。
- `messages/ja.json`・`en.json` は追加と指定キーの更新のみ。既存箇所の整形をしない。
- TypeScript strict・`any` 禁止・`import type`・`React.FC` 禁止。カバレッジ 100%(除外追加・`istanbul ignore` 新設・`.only/.skip` 禁止)。
- アニメーションは `useReducedMotion` + `revealInitial`(`@/constants/motion`)、リビールは `whileInView` + `once: true`。
- **コミットは司令塔の OK が出るまでしない**(各タスクの「コミット」ステップは OK 後にまとめて行う。日本語の Conventional Commits、末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`)。
- ディスク残が少ない: `npm ci` は1回だけ。`coverage/`・`.next/` は検証のたびに削除する。

---

## ファイル構成

| 区分 | ファイル | 役割 |
|---|---|---|
| 新規 | `src/constants/contact.ts` / `.test.ts` | 種別の値一覧・型・判定関数 |
| 新規 | `src/app/[locale]/private/page.tsx` / `page.test.tsx` | メタデータ・パンくず・組み立て |
| 新規 | `src/components/private/PrivateHero.tsx` / `.test.tsx` | 見出しとリード |
| 新規 | `src/components/private/PrivateDetails.tsx` / `.test.tsx` | できること・ご利用の目安・ご利用の流れ |
| 新規 | `src/components/private/PrivateCta.tsx` / `.test.tsx` | フォームへの CTA |
| 変更 | `src/app/api/contact/route.ts` / `route.test.ts` | `private` の受理 |
| 変更 | `src/app/[locale]/about/page.tsx` / `page.test.tsx` | `searchParams.category` の検証 |
| 変更 | `src/app/[locale]/about/AboutContent.tsx` / `about.test.tsx` | `initialCategory`・選択肢追加 |
| 変更 | `src/components/home/HomePricing.tsx` / `.test.tsx` | 注記リンクを `/private` へ |
| 変更 | `src/components/home/HomeFooter.tsx` / `.test.tsx` | フッターに「貸切・法人」 |
| 変更 | `src/constants/routes.ts` / `src/app/sitemap.test.ts` | sitemap に `/private` |
| 変更 | `messages/ja.json` / `messages/en.json` | 文言 |

---

### Task 1: 種別の値一覧と API(`private` の受理)

**Files:**
- Create: `src/constants/contact.ts`, `src/constants/contact.test.ts`
- Modify: `src/app/api/contact/route.ts`, `src/app/api/contact/route.test.ts`

**Interfaces:**
- Produces: `CONTACT_CATEGORY_VALUES`(`readonly ["court","lesson","private","press","other"]`)、`type ContactCategory`、`isContactCategory(value: unknown): value is ContactCategory`

- [ ] **Step 1: 失敗するテストを書く**

`src/constants/contact.test.ts`:

```ts
import { describe, it, expect } from "vitest";

import { CONTACT_CATEGORY_VALUES, isContactCategory } from "./contact";

describe("contact categories", () => {
  it("貸切・法人(private)を含む5種別を持つ", () => {
    expect([...CONTACT_CATEGORY_VALUES]).toEqual([
      "court",
      "lesson",
      "private",
      "press",
      "other",
    ]);
  });

  it("有効な種別は true", () => {
    for (const value of CONTACT_CATEGORY_VALUES) {
      expect(isContactCategory(value)).toBe(true);
    }
  });

  it("未知の文字列・空文字・文字列以外は false", () => {
    expect(isContactCategory("unknown")).toBe(false);
    expect(isContactCategory("")).toBe(false);
    expect(isContactCategory(undefined)).toBe(false);
    expect(isContactCategory(["private"])).toBe(false);
  });
});
```

`src/app/api/contact/route.test.ts` の `describe("POST /api/contact", ...)` 内(最初の `it` の直後)に追加:

```ts
  it("種別 private(貸切・法人)を受理し、件名と本文にラベルを入れる", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_123" }, error: null });

    const { POST } = await import("./route");
    const response = await POST(
      createRequest({ ...VALID_BODY, category: "private" }),
    );

    expect(response.status).toBe(201);
    const adminArg = mockSend.mock.calls[0][0];
    expect(adminArg.subject).toBe("【貸切・法人】山田太郎様からのお問い合わせ");
    expect(adminArg.text).toContain("カテゴリ: 貸切・法人");
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/constants/contact.test.ts src/app/api/contact/route.test.ts`
Expected: FAIL(`./contact` が無い / `private` が 400)

- [ ] **Step 3: 実装**

`src/constants/contact.ts`:

```ts
/** 問い合わせ種別の値。API・フォーム・/about のプリセレクトで共有する単一ソース。 */
export const CONTACT_CATEGORY_VALUES = [
  "court",
  "lesson",
  "private",
  "press",
  "other",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORY_VALUES)[number];

export function isContactCategory(value: unknown): value is ContactCategory {
  return (
    typeof value === "string" &&
    (CONTACT_CATEGORY_VALUES as readonly string[]).includes(value)
  );
}
```

`src/app/api/contact/route.ts` を次のように変更(先頭の import 追加、`VALID_CATEGORIES` 削除、`CATEGORY_LABELS` の型変更、検証と `as string` の置換):

```ts
import { isContactCategory, type ContactCategory } from "@/constants/contact";
```

```ts
const CATEGORY_LABELS: Record<ContactCategory, string> = {
  court: "コート予約",
  lesson: "レッスン",
  private: "貸切・法人",
  press: "取材",
  other: "その他",
};
```

```ts
  if (!isContactCategory(category)) {
    return NextResponse.json(
      { success: false, error: "カテゴリを選択してください" },
      { status: 400 },
    );
  }
```

```ts
  const categoryLabel = CATEGORY_LABELS[category];
```

(`const VALID_CATEGORIES = ...` の行と、`// category is validated against VALID_CATEGORIES ...` のコメント・`as string` は削除する。`category` は `body.category?.trim() ?? ""` のままで、空文字は `isContactCategory` が弾く。)

- [ ] **Step 4: 通過を確認**

Run: `npx vitest run src/constants/contact.test.ts src/app/api/contact/route.test.ts`
Expected: PASS(既存の不正カテゴリ 400 のテストも通る)

- [ ] **Step 5: コミット(司令塔の OK 後)**

```bash
git add src/constants/contact.ts src/constants/contact.test.ts src/app/api/contact/route.ts src/app/api/contact/route.test.ts
git commit -m "feat: 問い合わせ種別に貸切・法人(private)を追加"
```

---

### Task 2: フォームの選択肢とプリセレクト

**Files:**
- Modify: `src/app/[locale]/about/AboutContent.tsx`, `src/app/[locale]/about/about.test.tsx`, `src/app/[locale]/about/page.tsx`, `src/app/[locale]/about/page.test.tsx`, `messages/ja.json`, `messages/en.json`

**Interfaces:**
- Consumes: `ContactCategory`, `isContactCategory`(Task 1)
- Produces: `AboutContent` の新 prop `initialCategory?: ContactCategory | ""`(既定 `""`)

- [ ] **Step 1: 失敗するテストを書く**

`about.test.tsx` の `describe("AboutPage", ...)` 内に追加(`renderWithIntl` は既存):

```tsx
  it("お問い合わせ種別に「貸切・法人」の選択肢がある(JP/EN)", () => {
    renderWithIntl(<AboutPage />);
    expect(
      screen.getByRole("option", { name: "貸切・法人" }),
    ).toHaveValue("private");
  });

  it("EN では Private / Corporate の選択肢が出る", () => {
    renderWithIntl(<AboutPage />, "en");
    expect(
      screen.getByRole("option", { name: "Private / Corporate" }),
    ).toHaveValue("private");
  });

  it("initialCategory=private なら種別が「貸切・法人」で始まる", () => {
    renderWithIntl(<AboutPage initialCategory="private" />);
    expect(screen.getByLabelText("お問い合わせ種別")).toHaveValue("private");
  });

  it("initialCategory 未指定なら種別は未選択で始まる", () => {
    renderWithIntl(<AboutPage />);
    expect(screen.getByLabelText("お問い合わせ種別")).toHaveValue("");
  });
```

`page.test.tsx`:
1. 既存の `AboutPage({ params: ... })` 呼び出し 3 箇所(「localeを設定し…」「不正 locale」「CMS フラグ ON」)に `searchParams: Promise.resolve({}),` を追加する。
2. `./AboutContent` のモックを props を記録するものに変える:

```tsx
const aboutContentMock = vi.fn((_props: { initialCategory?: string }) => null);
vi.mock("./AboutContent", () => ({
  default: (props: { initialCategory?: string }) => aboutContentMock(props),
}));
```

3. `describe("About Page", ...)` 内に追加:

```tsx
  it("有効な category を initialCategory として渡す", async () => {
    const { default: AboutPage } = await import("./page");
    const element = await AboutPage({
      params: Promise.resolve({ locale: "ja" }),
      searchParams: Promise.resolve({ category: "private" }),
    });
    render(element);
    expect(aboutContentMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialCategory: "private" }),
    );
  });

  it("不正な category・配列は無視して未選択にする", async () => {
    const { default: AboutPage } = await import("./page");
    for (const category of ["unknown", ["private", "court"]]) {
      const element = await AboutPage({
        params: Promise.resolve({ locale: "ja" }),
        searchParams: Promise.resolve({ category }),
      });
      render(element);
      expect(aboutContentMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ initialCategory: "" }),
      );
    }
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run "src/app/[locale]/about"`
Expected: FAIL(選択肢が無い / `initialCategory` が渡らない)

- [ ] **Step 3: 実装**

`messages/ja.json` の `About.contact` に `"categoryLesson": "レッスンについて",` の次の行へ追加:

```json
      "categoryPrivate": "貸切・法人",
```

`messages/en.json` の `About.contact` に `"categoryLesson": "About Lessons",` の次の行へ追加:

```json
      "categoryPrivate": "Private / Corporate",
```

`AboutContent.tsx`:

```tsx
import { type ContactCategory } from "@/constants/contact";
```

(`import type` 規約に合わせ、既存の `import type { ... }` 群へ `import type { ContactCategory } from "@/constants/contact";` として追加する。)

`useCategories` の `lesson` の次に追加:

```tsx
    { value: "private", label: t("contact.categoryPrivate") },
```

`AboutContentProps` に追加:

```tsx
  /** `/about?category=` で指定された種別(検証済み)。未指定は "" = 未選択。 */
  initialCategory?: ContactCategory | "";
```

関数の引数分割代入に `initialCategory = "",` を追加し、`<select ... defaultValue="">` を `defaultValue={initialCategory}` に変更する。

`page.tsx`:

```tsx
import { isContactCategory } from "@/constants/contact";
```

```tsx
interface AboutPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string | string[] }>;
}
```

(`generateMetadata` は `{ params }: AboutPageProps` のまま。型が合わないので `generateMetadata` の引数型を `Pick<AboutPageProps, "params">` に変更する。)

`AboutPage` のシグネチャを `{ params, searchParams }: AboutPageProps` にし、`setRequestLocale(locale);` の後に:

```tsx
  const { category } = await searchParams;
  const initialCategory = isContactCategory(category) ? category : "";
```

`<AboutContent ... />` に `initialCategory={initialCategory}` を渡す。

- [ ] **Step 4: 通過を確認**

Run: `npx vitest run "src/app/[locale]/about"`
Expected: PASS

- [ ] **Step 5: コミット(司令塔の OK 後)**

```bash
git add "src/app/[locale]/about" messages/ja.json messages/en.json
git commit -m "feat: お問い合わせ種別「貸切・法人」の選択肢と URL でのプリセレクトを追加"
```

---

### Task 3: `/private` ページ

**Files:**
- Create: `src/app/[locale]/private/page.tsx`, `page.test.tsx`, `src/components/private/PrivateHero.tsx`, `PrivateDetails.tsx`, `PrivateCta.tsx`(各 `.test.tsx`)
- Modify: `messages/ja.json`, `messages/en.json`

**Interfaces:**
- Produces: メッセージ名前空間 `Private`(`hero.{title,subtitle,lead}`、`scope.{heading,items.{court,facility,showCourt,amenities}.{title,description}}`、`guide.{heading,items.{people,hours,price}.{title,description}}`、`flow.{heading,steps.{inquiry,contact,confirm,use}.{title,description}}`、`cta.{title,description,button}`)と `Metadata.private.{title,description}`
- Produces: `PRIVATE_CONTACT_HREF = "/about?category=private#contact"`(`PrivateCta.tsx` から export。Task 4 では使わない)

- [ ] **Step 0: 営業時間の差し込みヘルパ(develop #515 で営業時間が 6:00–25:00 に変更されたため、時刻は手書きしない)**

テスト `src/lib/businessHoursDisplay.test.ts`:

```ts
import { describe, it, expect } from "vitest";

import { BUSINESS_HOURS_DISPLAY } from "@/constants/site";

import { businessHoursDisplayFor } from "./businessHoursDisplay";

describe("businessHoursDisplayFor", () => {
  it("ja は日本語表記(25:00)", () => {
    expect(businessHoursDisplayFor("ja")).toEqual(BUSINESS_HOURS_DISPLAY.ja);
  });

  it("ja 以外は英語表記(1:00 AM)", () => {
    expect(businessHoursDisplayFor("en")).toEqual(BUSINESS_HOURS_DISPLAY.en);
  });
});
```

実装 `src/lib/businessHoursDisplay.ts`:

```ts
import { BUSINESS_HOURS_DISPLAY } from "@/constants/site";

/** 本文・メタ description の `{open}` `{close}` に差し込む営業時間表記(単一ソースは site.ts)。 */
export function businessHoursDisplayFor(locale: string): {
  readonly open: string;
  readonly close: string;
} {
  return locale === "ja" ? BUSINESS_HOURS_DISPLAY.ja : BUSINESS_HOURS_DISPLAY.en;
}
```

Run: `npx vitest run src/lib/businessHoursDisplay.test.ts`(実装前に FAIL、実装後に PASS を確認)

- [ ] **Step 1: 文言を追加する(messages)**

`messages/ja.json`: トップレベルに新しい名前空間 `"Private"` を、`"Reserve": { ... }` ブロックの直後(閉じ `},` の次の行)に追加する。`Metadata` には `"reserve"` ブロックの直後に `"private"` を追加する。

```json
  "Private": {
    "hero": {
      "title": "PRIVATE & CORPORATE",
      "subtitle": "貸切・法人利用",
      "lead": "3面のコートや、トレーニングエリア・ラウンジスペースを含む施設全体の貸切を承ります。まずはご希望の日時とご人数をお知らせください。"
    },
    "scope": {
      "heading": "ご利用いただける内容",
      "items": {
        "court": {
          "title": "コートの貸切",
          "description": "3面のコートを、コート単位でも施設全体でも貸切にできます。サーフェスはデコターフです。"
        },
        "facility": {
          "title": "施設全体の貸切",
          "description": "HYROX公式8種目に対応したトレーニングエリアやラウンジスペースを含む、施設全体の貸切もご相談ください。"
        },
        "showCourt": {
          "title": "ショーコート形式",
          "description": "レイアウトを変更して、1面のショーコートとしてもご利用いただけます。"
        },
        "amenities": {
          "title": "設備",
          "description": "ラウンジスペース、男女別更衣室、自動販売機をご利用いただけます。"
        }
      }
    },
    "guide": {
      "heading": "人数・時間帯・料金",
      "items": {
        "people": {
          "title": "ご人数",
          "description": "ご人数に応じて、ご利用いただくコートの面数や範囲をご提案します。まずはおおよその人数をお知らせください。"
        },
        "hours": {
          "title": "時間帯",
          "description": "営業時間 {open}–{close}(毎日)の中で、ご希望の日時をご相談ください。"
        },
        "price": {
          "title": "料金",
          "description": "お問い合わせください。ご希望の内容に合わせてご案内します。"
        }
      }
    },
    "flow": {
      "heading": "ご利用の流れ",
      "steps": {
        "inquiry": {
          "title": "お問い合わせ",
          "description": "フォームに、ご希望の日時・ご人数・ご利用目的をご記入のうえ送信してください。"
        },
        "contact": {
          "title": "ご連絡",
          "description": "担当者からメールでご連絡します。"
        },
        "confirm": {
          "title": "内容のご確認",
          "description": "料金・お支払い・キャンセルなどの条件は、お問い合わせの際にご案内します。"
        },
        "use": {
          "title": "ご利用",
          "description": "ご予定の日時にお越しください。"
        }
      }
    },
    "cta": {
      "title": "貸切・法人利用のご相談",
      "description": "ご希望の日時・ご人数・ご利用目的をご記入ください。",
      "button": "お問い合わせフォームへ"
    }
  },
```

```json
    "private": {
      "title": "貸切・法人",
      "description": "THE PICKLE BANG THEORY の貸切・法人利用のご案内。3面のコート、トレーニングエリア、ラウンジスペースを含む施設全体の貸切をご相談いただけます。本八幡駅徒歩1分、毎日{open}–{close}営業。"
    },
```

`messages/en.json`(同じ位置):

```json
  "Private": {
    "hero": {
      "title": "PRIVATE & CORPORATE",
      "subtitle": "Private & Corporate Use",
      "lead": "We take private bookings of our three courts, or the whole facility including the training area and lounge. Start by telling us your preferred date and number of guests."
    },
    "scope": {
      "heading": "What you can book",
      "items": {
        "court": {
          "title": "Court rental",
          "description": "Reserve our three courts, either individually or together with the whole facility. The surface is DecoTurf."
        },
        "facility": {
          "title": "Whole-facility rental",
          "description": "Ask us about renting the whole facility, including the HYROX training area (built for the eight official HYROX stations) and the lounge."
        },
        "showCourt": {
          "title": "Show-court layout",
          "description": "The layout can be changed to a single show court."
        },
        "amenities": {
          "title": "Amenities",
          "description": "A lounge, separate changing rooms for men and women, and a vending machine are available."
        }
      }
    },
    "guide": {
      "heading": "Guests, hours & pricing",
      "items": {
        "people": {
          "title": "Number of guests",
          "description": "We will suggest how many courts and which areas to use based on your group size. Please tell us roughly how many people are coming."
        },
        "hours": {
          "title": "Hours",
          "description": "Tell us your preferred date and time within our opening hours, {open}–{close}, every day."
        },
        "price": {
          "title": "Pricing",
          "description": "Please contact us. We will guide you based on your plans."
        }
      }
    },
    "flow": {
      "heading": "How it works",
      "steps": {
        "inquiry": {
          "title": "Inquiry",
          "description": "Send the form with your preferred date, number of guests and purpose."
        },
        "contact": {
          "title": "We reply",
          "description": "Our staff will reply by email."
        },
        "confirm": {
          "title": "Confirm the details",
          "description": "We will explain pricing, payment and cancellation terms when you contact us."
        },
        "use": {
          "title": "Your event",
          "description": "Come to the facility at the agreed time."
        }
      }
    },
    "cta": {
      "title": "Plan a private or corporate booking",
      "description": "Please include your preferred date, number of guests and purpose.",
      "button": "Go to the inquiry form"
    }
  },
```

```json
    "private": {
      "title": "Private & Corporate",
      "description": "Private and corporate bookings at THE PICKLE BANG THEORY — our three courts, or the whole facility including the training area and lounge. 1 min from Motoyawata Station, open {open}–{close} every day."
    },
```

- [ ] **Step 2: コンポーネントの失敗するテストを書く**

`src/components/private/PrivateHero.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import PrivateHero from "./PrivateHero";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PrivateHero", () => {
  it("h1 に PRIVATE & CORPORATE と和文サブタイトル・リードを表示する", () => {
    renderWithIntl(<PrivateHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: /PRIVATE & CORPORATE/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("貸切・法人利用")).toBeInTheDocument();
    expect(screen.getByText(/ご希望の日時とご人数をお知らせください/)).toBeInTheDocument();
  });

  it("EN でも表示する", () => {
    renderWithIntl(<PrivateHero />, "en");
    expect(screen.getByText("Private & Corporate Use")).toBeInTheDocument();
  });
});
```

`src/components/private/PrivateDetails.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import PrivateDetails from "./PrivateDetails";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PrivateDetails", () => {
  it("3つの見出し(できること・人数時間帯料金・流れ)を h2 で表示する", () => {
    renderWithIntl(<PrivateDetails />);
    for (const name of ["ご利用いただける内容", "人数・時間帯・料金", "ご利用の流れ"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  it("できること4項目を表示する", () => {
    renderWithIntl(<PrivateDetails />);
    for (const name of ["コートの貸切", "施設全体の貸切", "ショーコート形式", "設備"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
  });

  it("営業時間は site.ts の表記(6:00–25:00 / 6:00 AM–1:00 AM)を差し込む", () => {
    renderWithIntl(<PrivateDetails />);
    expect(screen.getByText(/営業時間 6:00–25:00（?\(?毎日/)).toBeInTheDocument();
  });

  it("EN の営業時間は 12 時間表記", () => {
    renderWithIntl(<PrivateDetails />, "en");
    expect(screen.getByText(/6:00 AM–1:00 AM, every day/)).toBeInTheDocument();
  });

  it("料金は「お問い合わせください」とだけ案内する", () => {
    renderWithIntl(<PrivateDetails />);
    expect(screen.getByText(/^お問い合わせください。/)).toBeInTheDocument();
  });

  it("流れは番号付きの4ステップで表示する", () => {
    renderWithIntl(<PrivateDetails />);
    const steps = screen.getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent("01");
    expect(steps[0]).toHaveTextContent("お問い合わせ");
    expect(steps[3]).toHaveTextContent("ご利用");
  });

  it("電話番号・料金額・実績を示す語を出さない", () => {
    const { container } = renderWithIntl(<PrivateDetails />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d{2,4}-\d{2,4}-\d{3,4}/);
    expect(text).not.toMatch(/[¥￥]\s?\d|\d\s?円/);
    expect(text).not.toMatch(/実績|導入事例|企業イベント|大会利用/);
  });

  it("EN でも表示する", () => {
    renderWithIntl(<PrivateDetails />, "en");
    expect(
      screen.getByRole("heading", { level: 2, name: "How it works" }),
    ).toBeInTheDocument();
  });
});
```

`src/components/private/PrivateCta.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import PrivateCta, { PRIVATE_CONTACT_HREF } from "./PrivateCta";
import jaMessages from "../../../messages/ja.json";

import type React from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

describe("PrivateCta", () => {
  it("種別をプリセレクトするフォームへのリンクを出す", () => {
    expect(PRIVATE_CONTACT_HREF).toBe("/about?category=private#contact");
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <PrivateCta />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("link", { name: "お問い合わせフォームへ" }),
    ).toHaveAttribute("href", PRIVATE_CONTACT_HREF);
    expect(screen.getByText("ご希望の日時・ご人数・ご利用目的をご記入ください。")).toBeInTheDocument();
  });

  it("クリックで content_click(location=private_cta)を計測する", async () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <PrivateCta />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole("link", { name: "お問い合わせフォームへ" }));
    expect(trackCtaClick).toHaveBeenCalledWith("contentClick", "private_cta", "contact");
  });
});
```

- [ ] **Step 3: 失敗を確認**

Run: `npx vitest run src/components/private`
Expected: FAIL(コンポーネントが無い)

- [ ] **Step 4: コンポーネントを実装**

`src/components/private/PrivateHero.tsx`:

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { EASE, revealInitial } from "@/constants/motion";

export default function PrivateHero() {
  const t = useTranslations("Private.hero");
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="pt-[calc(7rem+var(--promo-banner-h))] pb-10 lg:pt-[calc(8rem+var(--promo-banner-h))] lg:pb-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center"
          initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <h1 className="font-serif text-[clamp(1.5rem,8.2vw,3rem)] leading-none sm:text-6xl lg:text-7xl font-black tracking-[0.04em] sm:tracking-[0.1em] text-text-light">
            {t("title")}
          </h1>
          <p className="mt-4 text-sm sm:text-base tracking-[0.25em] text-text-gray">
            {t("subtitle")}
          </p>
          <div className="mx-auto mt-5 w-14 h-[3px] bg-accent" />
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-relaxed text-text-gray sm:text-base">
            {t("lead")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
```

`src/components/private/PrivateDetails.tsx`:

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";

import { EASE, revealInitial } from "@/constants/motion";
import { businessHoursDisplayFor } from "@/lib/businessHoursDisplay";

import type { ReactNode } from "react";

const SCOPE_KEYS = ["court", "facility", "showCourt", "amenities"] as const;
const GUIDE_KEYS = ["people", "hours", "price"] as const;
const FLOW_KEYS = ["inquiry", "contact", "confirm", "use"] as const;

interface RevealSectionProps {
  heading: string;
  children: ReactNode;
}

function RevealSection({ heading, children }: RevealSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      className="mx-auto max-w-7xl px-6 pb-14 lg:px-12 lg:pb-20"
      initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 1.0, ease: EASE }}
    >
      <h2 className="text-xs tracking-[0.3em] text-accent">{heading}</h2>
      <div className="mt-8">{children}</div>
    </motion.section>
  );
}

export default function PrivateDetails() {
  const t = useTranslations("Private");
  const hours = businessHoursDisplayFor(useLocale());

  return (
    <>
      <RevealSection heading={t("scope.heading")}>
        <ul className="grid gap-6 sm:grid-cols-2">
          {SCOPE_KEYS.map((key) => (
            <li key={key} className="border-t border-white/10 pt-5">
              <h3 className="text-base font-bold text-text-light">
                {t(`scope.items.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-gray">
                {t(`scope.items.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
      </RevealSection>

      <RevealSection heading={t("guide.heading")}>
        <dl className="divide-y divide-white/10 border-y border-white/10">
          {GUIDE_KEYS.map((key) => (
            <div key={key} className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm font-bold text-text-light">
                {t(`guide.items.${key}.title`)}
              </dt>
              <dd className="text-sm leading-relaxed text-text-gray">
                {t(`guide.items.${key}.description`, hours)}
              </dd>
            </div>
          ))}
        </dl>
      </RevealSection>

      <RevealSection heading={t("flow.heading")}>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_KEYS.map((key, index) => (
            <li key={key} className="border-t border-white/10 pt-5">
              <span className="font-serif text-sm tracking-wider text-accent/60">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-base font-bold text-text-light">
                {t(`flow.steps.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-gray">
                {t(`flow.steps.${key}.description`)}
              </p>
            </li>
          ))}
        </ol>
      </RevealSection>
    </>
  );
}
```

`src/components/private/PrivateCta.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

/** 問い合わせフォームを「貸切・法人」種別で開く(/about は searchParams.category を検証して使う)。 */
export const PRIVATE_CONTACT_HREF = "/about?category=private#contact";

export default function PrivateCta() {
  const t = useTranslations("Private.cta");

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20 text-center lg:px-12 lg:pb-28">
      <h2 className="font-serif text-2xl font-bold text-text-light sm:text-3xl">
        {t("title")}
      </h2>
      <p className="mt-4 text-sm text-text-gray">{t("description")}</p>
      <Link
        href={PRIVATE_CONTACT_HREF}
        onClick={() => trackCtaClick("contentClick", "private_cta", "contact")}
        className="mt-8 inline-block bg-accent px-8 py-3 text-sm font-semibold tracking-[0.15em] text-deep-black transition-colors hover:bg-accent/90"
      >
        {t("button")}
      </Link>
    </section>
  );
}
```

- [ ] **Step 5: コンポーネントテストの通過を確認**

Run: `npx vitest run src/components/private`
Expected: PASS

- [ ] **Step 6: ページの失敗するテストを書く**

`src/app/[locale]/private/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockGetTranslations = vi.fn();
const buildBreadcrumbMock = vi.fn().mockReturnValue({ "@type": "BreadcrumbList" });

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/home/HomeNavigation", () => ({
  default: ({ showColumns }: { showColumns?: boolean }) => (
    <nav data-testid="home-navigation" data-show-columns={showColumns} />
  ),
}));
vi.mock("@/components/home/HomeFooter", () => ({
  default: () => <footer data-testid="home-footer" />,
}));
vi.mock("@/config/featureFlags", () => ({ isCmsColumnsEnabled: () => true }));
vi.mock("@/components/private/PrivateHero", () => ({
  default: () => <section data-testid="private-hero" />,
}));
vi.mock("@/components/private/PrivateDetails", () => ({
  default: () => <section data-testid="private-details" />,
}));
vi.mock("@/components/private/PrivateCta", () => ({
  default: () => <section data-testid="private-cta" />,
}));
vi.mock("@/components/StructuredData", () => ({
  default: ({ data }: { data: { "@type": string } }) => (
    <script type="application/ld+json" data-type={data["@type"]} />
  ),
}));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: (...args: unknown[]) => buildBreadcrumbMock(...args),
}));

function buildMockT() {
  return vi.fn((key: string, _values?: Record<string, string>) => `translated:${key}`);
}

describe("PrivatePage generateMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ja: canonical=/private、alternates に ja/en/x-default", async () => {
    const mockT = buildMockT();
    mockGetTranslations.mockResolvedValue(mockT);
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ja" }) });
    expect(metadata.title).toBe("translated:private.title");
    expect(metadata.description).toBe("translated:private.description");
    expect(mockT).toHaveBeenCalledWith("private.description", { open: "6:00", close: "25:00" });
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/private");
    expect(metadata.alternates?.languages).toEqual({
      ja: "http://localhost:3000/private",
      en: "http://localhost:3000/en/private",
      "x-default": "http://localhost:3000/private",
    });
    expect(metadata.openGraph?.locale).toBe("ja_JP");
  });

  it("en: canonical=/en/private", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/en/private");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });
});

describe("PrivatePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ja: 各セクションとパンくず(貸切・法人)を描画する", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { default: PrivatePage } = await import("./page");
    render(await PrivatePage({ params: Promise.resolve({ locale: "ja" }) }));
    expect(screen.getByTestId("home-navigation")).toHaveAttribute("data-show-columns", "true");
    expect(screen.getByTestId("private-hero")).toBeInTheDocument();
    expect(screen.getByTestId("private-details")).toBeInTheDocument();
    expect(screen.getByTestId("private-cta")).toBeInTheDocument();
    expect(screen.getByTestId("home-footer")).toBeInTheDocument();
    expect(buildBreadcrumbMock).toHaveBeenCalledWith("ja", [
      { name: "貸切・法人", path: "/private" },
    ]);
  });

  it("en: パンくず名は Private & Corporate", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { default: PrivatePage } = await import("./page");
    render(await PrivatePage({ params: Promise.resolve({ locale: "en" }) }));
    expect(buildBreadcrumbMock).toHaveBeenCalledWith("en", [
      { name: "Private & Corporate", path: "/private" },
    ]);
  });

  it("不正 locale で notFound", async () => {
    const { default: PrivatePage } = await import("./page");
    await expect(
      PrivatePage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
```

- [ ] **Step 7: 失敗を確認**

Run: `npx vitest run "src/app/[locale]/private"`
Expected: FAIL(`./page` が無い)

- [ ] **Step 8: ページを実装**

`src/app/[locale]/private/page.tsx`(パンくず名は `Metadata.private.title` と同じ文言を直接持つ。構造化データは翻訳関数を通さずロケール別定数にする):

```tsx
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import StructuredData from "@/components/StructuredData";
import HomeFooter from "@/components/home/HomeFooter";
import HomeNavigation from "@/components/home/HomeNavigation";
import PrivateCta from "@/components/private/PrivateCta";
import PrivateDetails from "@/components/private/PrivateDetails";
import PrivateHero from "@/components/private/PrivateHero";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { SITE_URL } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { businessHoursDisplayFor } from "@/lib/businessHoursDisplay";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";
import { buildBreadcrumb } from "@/lib/structured-data";

import type { Metadata } from "next";

interface PrivatePageProps {
  params: Promise<{ locale: string }>;
}

const BREADCRUMB_NAME = { ja: "貸切・法人", en: "Private & Corporate" } as const;

export async function generateMetadata({
  params,
}: PrivatePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/private` : `${SITE_URL}/${locale}/private`;

  return {
    title: t("private.title"),
    description: t("private.description", businessHoursDisplayFor(locale)),
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
    }),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/private`,
        en: `${SITE_URL}/en/private`,
        "x-default": `${SITE_URL}/private`,
      },
    },
  };
}

export default async function PrivatePage({ params }: PrivatePageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <main className="bg-deep-black min-h-screen">
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: BREADCRUMB_NAME[locale], path: "/private" },
        ])}
      />
      <HomeNavigation showColumns={isCmsColumnsEnabled()} />
      <PrivateHero />
      <PrivateDetails />
      <PrivateCta />
      <HomeFooter />
    </main>
  );
}
```

(`parseLocale` の戻り値は `"ja" | "en"` なので `BREADCRUMB_NAME[locale]` は型安全。違う場合は戻り値の型に合わせる。)

- [ ] **Step 9: ページテストと規約テストの通過を確認**

Run: `npx vitest run "src/app/[locale]/private" src/components/private src/app/pageOpenGraphContract.test.ts`
Expected: PASS(`pageOpenGraphContract` は `src/app/**/page.tsx` を自動検査する)

- [ ] **Step 10: コミット(司令塔の OK 後)**

```bash
git add "src/app/[locale]/private" src/components/private messages/ja.json messages/en.json
git commit -m "feat: 貸切・法人の専用ページ /private(ja/en)を追加"
```

---

### Task 4: 導線(料金注記・フッター・sitemap)

**Files:**
- Modify: `src/components/home/HomePricing.tsx`, `HomePricing.test.tsx`, `src/components/home/HomeFooter.tsx`, `HomeFooter.test.tsx`, `src/constants/routes.ts`, `src/app/sitemap.test.ts`, `messages/ja.json`, `messages/en.json`

**Interfaces:**
- Consumes: ページ `/private`(Task 3)

- [ ] **Step 1: 失敗するテストを書く / 更新する**

`HomePricing.test.tsx`:
- 「貸切・法人利用の案内とリンクを表示する」(`getByText("お問い合わせ")` / `href` が `/about#contact`)を次に置換:

```tsx
  it("貸切・法人利用の案内リンクは専用ページ /private を指す", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const link = screen.getByRole("link", { name: "貸切・法人のご案内" });
    expect(link).toHaveAttribute("href", "/private");
  });
```

- 「貸切・法人利用のお問い合わせリンクは維持される」(`a[href="/about#contact"]` の存在)を次に置換:

```tsx
  it("貸切・法人リンクのクリックは従来どおり price イベントで計測する", async () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    await userEvent.click(screen.getByRole("link", { name: "貸切・法人のご案内" }));
    expect(trackCtaClick).toHaveBeenCalledWith("price", "home_pricing");
  });
```

`HomeFooter.test.tsx`(contributors のテストの次に追加):

```tsx
  it("貸切・法人ページへのリンクを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole("link", { name: "貸切・法人" })).toHaveAttribute("href", "/private");
  });
```

`sitemap.test.ts`:
- 14 エントリのテスト名と値を更新: 「静的ページ7つ + ニュース一覧1つ を ja/en それぞれ = 16エントリ（slugなし時）」、`toHaveLength(16)`、`expect(urls).toContain(`${PROD_URL}/private`);` を追加。
- 追加:

```ts
  it("/private を ja/en alternates 付きで含む", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();

    const privatePage = entries.find((e) => e.url === `${PROD_URL}/private`);
    expect(privatePage?.alternates?.languages?.en).toBe(`${PROD_URL}/en/private`);
    expect(entries.map((e) => e.url)).toContain(`${PROD_URL}/en/private`);
  });
```

- ほかに件数や静的エントリ一覧を固定しているテストがあれば同様に更新する(`grep -n "toHaveLength\|staticEntries" src/app/sitemap.test.ts` で確認)。

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/home/HomePricing.test.tsx src/components/home/HomeFooter.test.tsx src/app/sitemap.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`HomePricing.tsx` の貸切の `<Link>`:`href="/about#contact"` → `href="/private"`(`onClick` と `className` は据え置き)。

`messages/ja.json` の `HomePricing`(3キーのみ更新):

```json
    "privateFacilityNote": "トレーニングエリアやラウンジスペースを含む施設全ての貸切、法人利用をご希望の場合は",
    "contactUs": "貸切・法人のご案内",
    "pleaseContact": "をご覧ください。",
```

`messages/en.json` の `HomePricing`:

```json
    "privateFacilityNote": "For full facility private bookings including the training area and lounge, or corporate use, see",
    "contactUs": "Private & Corporate details",
    "pleaseContact": ".",
```

`HomeFooter.tsx` の下段リンク列で `/contributors` の `<Link>` の直後に追加:

```tsx
            <Link
              href="/private"
              className="text-xs text-text-gray hover:text-text-light transition-colors"
            >
              {tFooter("privateCorporate")}
            </Link>
```

`messages/ja.json` の `HomeFooter` に `"contributors"` の次の行へ `"privateCorporate": "貸切・法人",`、`messages/en.json` に `"privateCorporate": "Private & Corporate",` を追加。

`src/constants/routes.ts` の `SITEMAP_ROUTES` で `/contributors` の前に追加:

```ts
  { path: "/private", priority: 0.6, changeFrequency: "monthly" },
```

- [ ] **Step 4: 通過を確認**

Run: `npx vitest run src/components/home src/app/sitemap.test.ts`
Expected: PASS

- [ ] **Step 5: コミット(司令塔の OK 後)**

```bash
git add src/components/home src/constants/routes.ts src/app/sitemap.test.ts messages/ja.json messages/en.json
git commit -m "feat: 料金注記・フッター・sitemap から貸切・法人ページへ導線を追加"
```

---

### Task 5: 検証と証跡

**Files:** なし(確認のみ。証跡は `.superpowers/evidence/szb-436/`、コミットしない)

- [ ] **Step 1: 全体検証**

Run: `npm run test:coverage`
Expected: 全テスト PASS、カバレッジ 100%・閾値エラーなし

Run: `npm run lint` と `npx tsc --noEmit`
Expected: エラー 0

Run: `npm run build`
Expected: 成功(`/private` が ja/en で生成される。`/about` は dynamic のまま)

終わったら: `rm -rf coverage .next`

- [ ] **Step 2: 動作確認の証跡**

`.env.local` をコピー(`cp /Users/tsutsumi.akihiro/dev/bigban/.env.local ./.env.local`、中身はログに出さない)し、`npx next dev -p 3212` で起動する。次を **375px と 1440px** でスクリーンショットし、`.superpowers/evidence/szb-436/` に保存する:

- `http://localhost:3212/private`(ja)と `/en/private`
- `http://localhost:3212/about?category=private#contact`(種別が「貸切・法人」で始まる)
- トップ `http://localhost:3212/#pricing`(注記リンクが「貸切・法人のご案内」)とフッター

手順どおりに「`/private` の CTA → フォーム → 種別が選択済み」まで辿り、フォームは送信しない(メールが飛ぶため)。確認後に dev サーバーを止める。

- [ ] **Step 3: 司令塔へ「確認依頼」**

変更の要約・証跡の絶対パス・テスト/カバレッジ/lint/型/ビルドの結果を送り、止まって OK を待つ。OK 後に Task 1〜4 のコミット(設計書・計画書も含める)→ push → PR(向き先 `feature/site-zero-base`、`Refs #436`)。

---

## Self-Review

- **設計の網羅**: §3.1(種別・API・計測)= Task 1・2、§3.2(プリセレクト)= Task 2、§3.3(ページ・メタ・パンくず)= Task 3、§3.4(導線・sitemap)= Task 4、§3.5(CTA 計測)= Task 3 の `PrivateCta`、§5(テスト・禁止事項の回帰)= 各 Task + `PrivateDetails.test`。このリポジトリには `e2e/` ディレクトリが無く(`playwright.config.ts` のみ)、axe 対象ページの一覧も無いため E2E の追加はしない。
- **プレースホルダ**: なし(文言・コードはすべて記載)。人数の数字・用途例示・折り返し日数は設計書 §6 の既定どおり載せていない。
- **型・名前の一貫性**: `ContactCategory` / `isContactCategory` / `initialCategory` / `PRIVATE_CONTACT_HREF` / 名前空間 `Private` / `Metadata.private` / `HomeFooter.privateCorporate` を全タスクで同じ表記にした。
