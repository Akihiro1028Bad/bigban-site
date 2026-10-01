# szb-508 情報の鮮度(終了イベントの自動「終了」表示)実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** microCMS の `eventEndAt` を過ぎたニュースを、描画のたびに自動で「終了」表示にし、予約先(labola.jp / tennisbear.net)へのリンクを外す。

**Architecture:** 判定(`isNewsEnded`)・リンク除去(`unlinkBookingLinks`)・文言(`endedLabels`)を `src/lib/news/` の純関数・定数に切り出し、表示部品(`NewsEndedBadge`・`NewsEndedNotice`)を `src/components/news/` に置く。既存の `NewsCard`・`HomeLatestNews`・`NewsBodyRenderer`・詳細ページに最小差分で組み込む。ホーム・一覧・詳細はすべて `force-dynamic` なので再描画の仕組みは不要。

**Tech Stack:** Next.js 16 / TypeScript strict / zod / Vitest + React Testing Library(新しい依存なし)。

## Global Constraints

- **コミット・push は司令塔の OK が出るまで絶対にしない**(オーナー方針: 動作確認が済むまでコミット禁止)。各 Task に commit ステップは置かない
- TDD(Red→Green→Refactor)。`any` 禁止・`import type`・`React.FC` 禁止・Boolean prop は `is/has/should/can` 接頭辞
- カバレッジ100%(statements/branches/functions/lines)。`vitest.config.ts` の除外追加・`istanbul ignore` の新規追加・`.only/.skip` は不可
- `messages/ja.json`・`messages/en.json` には触らない(他セッションと衝突)。文言は `src/lib/news/endedLabels.ts` に置く
- 新しい依存を足さない。diff は 400 行未満が目安
- 既存ファイルの無関係な整形をしない
- 英語表記は "Ended"。日本語は「終了」
- 予約先ドメインは `labola.jp`(サブドメイン含む)と `tennisbear.net`(サブドメイン含む)の2系統
- `eventEndAt` が無い・読めない値のときは**終了扱いにしない**(後方互換)
- テストで時刻を扱うときは固定の遠い過去(`2020-01-01T00:00:00.000Z`)と遠い未来(`2099-01-01T00:00:00.000Z`)を使い、フェイクタイマーは使わない
- 検証コマンド: `npm run test:coverage` / `npm run lint` / `npx tsc --noEmit`(依存のインストール `npm ci` はオーナーのディスク空き確保後。親リポジトリの `node_modules` への symlink は禁止)

## ファイル構成

| 種別 | パス | 責務 |
|---|---|---|
| 新規 | `src/lib/news/ended.ts` (+ `.test.ts`) | `isNewsEnded` |
| 新規 | `src/lib/news/unlinkBookingLinks.ts` (+ `.test.ts`) | `isBookingUrl` / `unlinkBookingLinks` |
| 新規 | `src/lib/news/endedLabels.ts` (+ `.test.ts`) | 文言・行き先パス |
| 新規 | `src/components/news/NewsEndedBadge.tsx` (+ `.test.tsx`) | 「終了/Ended」バッジ |
| 新規 | `src/components/news/NewsEndedNotice.tsx` (+ `.test.tsx`) | 詳細の帯 |
| 変更 | `src/lib/microcms/schema.ts` (+ `schema.test.ts`) | `eventEndAt` 追加 |
| 変更 | `__mocks__/microcms-fixtures.ts` | `RawNewsItem` に `eventEndAt` 追加 |
| 変更 | `src/components/news/NewsCard.tsx` (+ test) | バッジ(一覧・ホーム `HomeNews`・about が共用) |
| 変更 | `src/components/home/HomeLatestNews.tsx` (+ test) | バッジ(小) |
| 変更 | `src/components/news/NewsBodyRenderer.tsx` (+ test) | `shouldUnlinkBookingLinks` prop |
| 変更 | `src/app/[locale]/news/[slug]/page.tsx` (+ test) | バッジ・帯・リンク除去・externalLink |
| 新規 | `docs/operations/szb-508-change-list.md` | 変更案リスト(本番に書かない) |
| 変更 | `docs/operations/news-admin-manual.md` | `eventEndAt` の入れ方 |

---

### Task 1: `eventEndAt` をスキーマに足し、終了判定の純関数を作る

**Files:**
- Create: `src/lib/news/ended.ts`, `src/lib/news/ended.test.ts`
- Modify: `src/lib/microcms/schema.ts`(`externalLink` の直後)、`src/lib/microcms/schema.test.ts`、`__mocks__/microcms-fixtures.ts`

**Interfaces:**
- Produces: `NewsItem.eventEndAt?: string`(ISO日時文字列)/ `isNewsEnded(eventEndAt: string | undefined, now?: Date): boolean`(`now` 省略時は `new Date()`)
- 以降の Task はテストで `makeParsedNewsItem({ eventEndAt: "..." })` を使う(fixtures の `RawNewsItem` に `eventEndAt?: string | null` を足す)

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/news/ended.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isNewsEnded } from "./ended";

const NOW = new Date("2026-10-01T00:00:00.000Z");

describe("isNewsEnded", () => {
  it("eventEndAt が未設定なら終了扱いにしない", () => {
    expect(isNewsEnded(undefined, NOW)).toBe(false);
  });

  it("空文字は終了扱いにしない", () => {
    expect(isNewsEnded("", NOW)).toBe(false);
  });

  it("日時として読めない値は終了扱いにしない", () => {
    expect(isNewsEnded("not-a-date", NOW)).toBe(false);
  });

  it("終了日時を過ぎていれば終了", () => {
    expect(isNewsEnded("2026-09-30T14:59:00.000Z", NOW)).toBe(true);
  });

  it("終了日時が未来なら終了ではない", () => {
    expect(isNewsEnded("2026-10-01T00:00:01.000Z", NOW)).toBe(false);
  });

  it("終了日時ちょうどは終了ではない(過ぎたら終了)", () => {
    expect(isNewsEnded("2026-10-01T00:00:00.000Z", NOW)).toBe(false);
  });

  it("now を省略すると現在時刻で判定する", () => {
    expect(isNewsEnded("2020-01-01T00:00:00.000Z")).toBe(true);
    expect(isNewsEnded("2099-01-01T00:00:00.000Z")).toBe(false);
  });
});
```

`src/lib/microcms/schema.test.ts` の末尾に追記(既存の `validItem` を使う):

```ts
describe("newsItemSchema eventEndAt", () => {
  it("eventEndAt を文字列として受け取る", () => {
    const parsed = newsItemSchema.parse({
      ...validItem,
      eventEndAt: "2026-09-23T14:59:00.000Z",
    });
    expect(parsed.eventEndAt).toBe("2026-09-23T14:59:00.000Z");
  });

  it("eventEndAt が無いとき undefined になる(後方互換)", () => {
    const parsed = newsItemSchema.parse(validItem);
    expect(parsed.eventEndAt).toBeUndefined();
  });

  it("eventEndAt が null のとき undefined に正規化される", () => {
    const parsed = newsItemSchema.parse({ ...validItem, eventEndAt: null });
    expect(parsed.eventEndAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/news/ended.test.ts src/lib/microcms/schema.test.ts`
Expected: FAIL(`./ended` が無い / `eventEndAt` が undefined のまま)

- [ ] **Step 3: 最小実装**

`src/lib/news/ended.ts`:

```ts
/**
 * ニュースの終了判定。
 * `eventEndAt`(microCMS の日時。UTC の ISO 文字列)を過ぎていれば true。
 * - 未設定・空・読めない値は false(誤って「終了」と表示しない側へ倒す)
 * - 終了日時ちょうどは false(過ぎたら true)
 */
export function isNewsEnded(
  eventEndAt: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!eventEndAt) return false;
  const endMs = Date.parse(eventEndAt);
  if (Number.isNaN(endMs)) return false;
  return now.getTime() > endMs;
}
```

`src/lib/microcms/schema.ts` の `newsItemSchema` の `externalLink` の直後に追加:

```ts
  // 終了日時(microCMS の「日時」フィールド。任意)。過ぎると「終了」表示になる。
  eventEndAt: optionalString,
```

`__mocks__/microcms-fixtures.ts` の `RawNewsItem` の `externalLink?` の直後に追加:

```ts
  eventEndAt?: string | null;
```

- [ ] **Step 4: 通ることを確認**

Run: `npx vitest run src/lib/news/ended.test.ts src/lib/microcms/schema.test.ts && npx tsc --noEmit`
Expected: PASS

---

### Task 2: 文言定数と予約先リンクの除去

**Files:**
- Create: `src/lib/news/endedLabels.ts`, `src/lib/news/endedLabels.test.ts`, `src/lib/news/unlinkBookingLinks.ts`, `src/lib/news/unlinkBookingLinks.test.ts`

**Interfaces:**
- Produces:
  - `endedLabels.ts`: `getEndedLabels(locale: "ja" | "en"): { badge: string; message: string; newsLabel: string; reserveLabel: string; separator: string; suffix: string; newsHref: string; reserveHref: string }`
  - `unlinkBookingLinks.ts`: `isBookingUrl(url: string): boolean` / `unlinkBookingLinks(html: string): string`(サニタイズ済み HTML を受け取り、予約先宛て `<a>` のタグだけを外して中身を残す)

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/news/endedLabels.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getEndedLabels } from "./endedLabels";

describe("getEndedLabels", () => {
  it("日本語", () => {
    const labels = getEndedLabels("ja");
    expect(labels.badge).toBe("終了");
    expect(labels.message).toBe(
      "このイベントは終了しました。最新の開催情報は",
    );
    expect(labels.newsLabel).toBe("ニュース一覧");
    expect(labels.reserveLabel).toBe("予約ページ");
    expect(labels.newsHref).toBe("/news");
    expect(labels.reserveHref).toBe("/reserve");
  });

  it("英語はロケール接頭辞つきの行き先", () => {
    const labels = getEndedLabels("en");
    expect(labels.badge).toBe("Ended");
    expect(labels.newsHref).toBe("/en/news");
    expect(labels.reserveHref).toBe("/en/reserve");
  });
});
```

`src/lib/news/unlinkBookingLinks.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isBookingUrl, unlinkBookingLinks } from "./unlinkBookingLinks";

describe("isBookingUrl", () => {
  it.each([
    "https://yoyaku.labola.jp/r/shop/3473/",
    "https://labola.jp/",
    "https://www.tennisbear.net/events/123",
    "https://tennisbear.net/",
  ])("予約先: %s", (url) => {
    expect(isBookingUrl(url)).toBe(true);
  });

  it.each([
    "https://www.thepicklebang.com/reserve",
    "https://www.instagram.com/p/abc/",
    "https://evil-labola.jp.example.com/",
    "https://notlabola.jp/",
    "not a url",
    "/reserve",
  ])("予約先ではない: %s", (url) => {
    expect(isBookingUrl(url)).toBe(false);
  });
});

describe("unlinkBookingLinks", () => {
  it("予約先宛ての <a> はテキストだけ残す", () => {
    const html =
      '<p><a href="https://yoyaku.labola.jp/r/shop/3473/" target="_blank" rel="noopener">予約はこちら</a></p>';
    expect(unlinkBookingLinks(html)).toBe("<p>予約はこちら</p>");
  });

  it("テニスベア宛てもテキストだけ残す", () => {
    expect(
      unlinkBookingLinks(
        '<a href="https://www.tennisbear.net/events/1">申込</a>',
      ),
    ).toBe("申込");
  });

  it("中の装飾タグは保持する", () => {
    expect(
      unlinkBookingLinks(
        '<a href="https://labola.jp/x"><strong>今すぐ</strong>予約</a>',
      ),
    ).toBe("<strong>今すぐ</strong>予約");
  });

  it("サイト内リンク・SNS・その他の外部リンクは変更しない", () => {
    const html =
      '<a href="https://www.thepicklebang.com/reserve">予約</a><a href="https://www.instagram.com/x/">IG</a>';
    expect(unlinkBookingLinks(html)).toBe(html);
  });

  it("href の無い <a> は変更しない", () => {
    const html = '<a class="note">注</a>';
    expect(unlinkBookingLinks(html)).toBe(html);
  });

  it("複数のリンクを個別に判定する", () => {
    const html =
      '<a href="https://labola.jp/a">A</a>と<a href="https://www.thepicklebang.com/news">B</a>と<a href="https://www.tennisbear.net/c">C</a>';
    expect(unlinkBookingLinks(html)).toBe(
      'Aと<a href="https://www.thepicklebang.com/news">B</a>とC',
    );
  });

  it("リンクの無い HTML はそのまま返す", () => {
    expect(unlinkBookingLinks("<p>本文</p>")).toBe("<p>本文</p>");
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/news/endedLabels.test.ts src/lib/news/unlinkBookingLinks.test.ts`
Expected: FAIL(モジュールが無い)

- [ ] **Step 3: 最小実装**

`src/lib/news/endedLabels.ts`:

```ts
type Locale = "ja" | "en";

export interface EndedLabels {
  badge: string;
  message: string;
  newsLabel: string;
  reserveLabel: string;
  separator: string;
  suffix: string;
  newsHref: string;
  reserveHref: string;
}

const LABELS: Record<Locale, EndedLabels> = {
  ja: {
    badge: "終了",
    message: "このイベントは終了しました。最新の開催情報は",
    newsLabel: "ニュース一覧",
    reserveLabel: "予約ページ",
    separator: "・",
    suffix: "をご確認ください。",
    newsHref: "/news",
    reserveHref: "/reserve",
  },
  en: {
    badge: "Ended",
    message: "This event has ended. Check the latest information on the ",
    newsLabel: "News",
    reserveLabel: "Reserve",
    separator: " or ",
    suffix: " page.",
    newsHref: "/en/news",
    reserveHref: "/en/reserve",
  },
};

/** 「終了」表示まわりの文言。詳細ページの既存流儀(ロケール分岐)に合わせて集約する。 */
export function getEndedLabels(locale: Locale): EndedLabels {
  return LABELS[locale];
}
```

`src/lib/news/unlinkBookingLinks.ts`:

```ts
// 終了したイベントの本文から外す、予約先ドメイン(サブドメイン含む)。
const BOOKING_HOSTS = ["labola.jp", "tennisbear.net"] as const;

// サニタイズ済み HTML を対象にする。属性値に `>` が入らない前提
// (DOMPurify のシリアライズで `&gt;` になる)。
const ANCHOR_RE = /<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF_RE = /\bhref="([^"]*)"/i;

export function isBookingUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return BOOKING_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

/**
 * 予約先ドメイン宛ての <a> タグを外し、中身(テキスト・装飾)だけを残す。
 * サイト内リンク・SNS・その他の外部リンクには触れない。
 */
export function unlinkBookingLinks(html: string): string {
  return html.replace(ANCHOR_RE, (whole, attrs: string, inner: string) => {
    const href = HREF_RE.exec(attrs)?.[1];
    return href && isBookingUrl(href) ? inner : whole;
  });
}
```

- [ ] **Step 4: 通ることを確認**

Run: `npx vitest run src/lib/news/endedLabels.test.ts src/lib/news/unlinkBookingLinks.test.ts`
Expected: PASS

---

### Task 3: バッジ・帯の部品と、一覧カード・ホーム最新ニュースへの組み込み

**Files:**
- Create: `src/components/news/NewsEndedBadge.tsx`(+ `.test.tsx`)、`src/components/news/NewsEndedNotice.tsx`(+ `.test.tsx`)
- Modify: `src/components/news/NewsCard.tsx`、`src/components/news/NewsCard.test.tsx`、`src/components/home/HomeLatestNews.tsx`、`src/components/home/HomeLatestNews.test.tsx`

**Interfaces:**
- Consumes: `isNewsEnded(eventEndAt, now?)`、`getEndedLabels(locale)`(Task 1・2)
- Produces:
  - `NewsEndedBadge({ locale, className? })` — 「終了/Ended」の `<span>`
  - `NewsEndedNotice({ locale })` — 詳細用の帯(`role="note"`、ニュース一覧・予約ページへの2リンク)

- [ ] **Step 1: 失敗するテストを書く**

`src/components/news/NewsEndedBadge.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { NewsEndedBadge } from "./NewsEndedBadge";

describe("NewsEndedBadge", () => {
  it("日本語は「終了」", () => {
    render(<NewsEndedBadge locale="ja" />);
    expect(screen.getByText("終了")).toBeInTheDocument();
  });

  it("英語は Ended", () => {
    render(<NewsEndedBadge locale="en" />);
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });

  it("className を追加できる", () => {
    render(<NewsEndedBadge locale="ja" className="extra" />);
    expect(screen.getByText("終了")).toHaveClass("extra");
  });
});
```

`src/components/news/NewsEndedNotice.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { NewsEndedNotice } from "./NewsEndedNotice";

describe("NewsEndedNotice", () => {
  it("日本語: 終了の告知とニュース一覧・予約ページへのリンク", () => {
    render(<NewsEndedNotice locale="ja" />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("このイベントは終了しました。");
    expect(screen.getByRole("link", { name: "ニュース一覧" })).toHaveAttribute(
      "href",
      "/news",
    );
    expect(screen.getByRole("link", { name: "予約ページ" })).toHaveAttribute(
      "href",
      "/reserve",
    );
  });

  it("英語: ロケール接頭辞つきのリンク", () => {
    render(<NewsEndedNotice locale="en" />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "This event has ended.",
    );
    expect(screen.getByRole("link", { name: "News" })).toHaveAttribute(
      "href",
      "/en/news",
    );
    expect(screen.getByRole("link", { name: "Reserve" })).toHaveAttribute(
      "href",
      "/en/reserve",
    );
  });
});
```

`src/components/news/NewsCard.test.tsx` の `describe("NewsCard", ...)` の中に追記:

```tsx
  it("eventEndAt を過ぎた記事に「終了」バッジを出す", () => {
    render(
      <NewsCard
        item={makeParsedNewsItem({ eventEndAt: "2020-01-01T00:00:00.000Z" })}
        locale="ja"
      />,
    );
    expect(screen.getByText("終了")).toBeInTheDocument();
  });

  it("英語では Ended バッジ", () => {
    render(
      <NewsCard
        item={makeParsedNewsItem({ eventEndAt: "2020-01-01T00:00:00.000Z" })}
        locale="en"
      />,
    );
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });

  it("eventEndAt が未来・未設定ならバッジを出さない", () => {
    const { rerender } = render(
      <NewsCard
        item={makeParsedNewsItem({ eventEndAt: "2099-01-01T00:00:00.000Z" })}
        locale="ja"
      />,
    );
    expect(screen.queryByText("終了")).toBeNull();
    rerender(<NewsCard item={makeParsedNewsItem()} locale="ja" />);
    expect(screen.queryByText("終了")).toBeNull();
  });
```

`src/components/home/HomeLatestNews.test.tsx` の `describe("HomeLatestNews", ...)` の中に追記(既存テストの `getNewsListMock.mockResolvedValue({ contents: [...] })` の形に合わせる。`renderHomeLatestNews` は既存):

```tsx
  it("終了した記事に「終了」バッジを出し、未終了の記事には出さない", async () => {
    getNewsListMock.mockResolvedValue({
      contents: [
        makeParsedNewsItem({
          id: "ended",
          slug: "ended",
          title: "終わった告知",
          eventEndAt: "2020-01-01T00:00:00.000Z",
        }),
        makeParsedNewsItem({
          id: "live",
          slug: "live",
          title: "開催中の告知",
          eventEndAt: "2099-01-01T00:00:00.000Z",
        }),
      ],
      totalCount: 2,
      offset: 0,
      limit: 3,
    });
    await renderHomeLatestNews("ja");
    expect(screen.getAllByText("終了")).toHaveLength(1);
  });

  it("英語では Ended バッジ", async () => {
    getNewsListMock.mockResolvedValue({
      contents: [
        makeParsedNewsItem({
          id: "ended",
          slug: "ended",
          eventEndAt: "2020-01-01T00:00:00.000Z",
        }),
      ],
      totalCount: 1,
      offset: 0,
      limit: 3,
    });
    await renderHomeLatestNews("en");
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/news/NewsEndedBadge.test.tsx src/components/news/NewsEndedNotice.test.tsx src/components/news/NewsCard.test.tsx src/components/home/HomeLatestNews.test.tsx`
Expected: FAIL(部品が無い / バッジが出ない)

- [ ] **Step 3: 実装**

`src/components/news/NewsEndedBadge.tsx`:

```tsx
import { getEndedLabels } from "@/lib/news/endedLabels";

type Locale = "ja" | "en";

interface NewsEndedBadgeProps {
  locale: Locale;
  className?: string;
}

/** 終了したニュースに付ける「終了/Ended」バッジ。カテゴリ色と区別するため灰色の枠にする。 */
export function NewsEndedBadge({ locale, className }: NewsEndedBadgeProps) {
  const base =
    "inline-block whitespace-nowrap px-2 py-0.5 border border-text-gray text-text-gray";
  return (
    <span className={className ? `${base} ${className}` : base}>
      {getEndedLabels(locale).badge}
    </span>
  );
}
```

`src/components/news/NewsEndedNotice.tsx`:

```tsx
import Link from "next/link";

import { getEndedLabels } from "@/lib/news/endedLabels";

type Locale = "ja" | "en";

interface NewsEndedNoticeProps {
  locale: Locale;
}

const LINK_CLASS =
  "text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

/** 終了したニュース詳細の本文冒頭に出す帯。最新の開催情報への行き先を示す。 */
export function NewsEndedNotice({ locale }: NewsEndedNoticeProps) {
  const labels = getEndedLabels(locale);
  return (
    <div
      role="note"
      className="mb-8 border border-text-gray/40 bg-text-gray/10 px-5 py-4 text-sm lg:text-base text-text-light"
    >
      {labels.message}
      <Link href={labels.newsHref} className={LINK_CLASS}>
        {labels.newsLabel}
      </Link>
      {labels.separator}
      <Link href={labels.reserveHref} className={LINK_CLASS}>
        {labels.reserveLabel}
      </Link>
      {labels.suffix}
    </div>
  );
}
```

`src/components/news/NewsCard.tsx`:
- import を追加(`@/` 群): `import { isNewsEnded } from "@/lib/news/ended";` と `import { NewsEndedBadge } from "./NewsEndedBadge";`(兄弟 import)
- `const date = formatDate(dateIso);` の次の行に `const isEnded = isNewsEnded(item.eventEndAt);`
- 日付 `<time ...>` の直前(カテゴリ `{cats.length > 0 && (...)}` ブロックの直後)に追加:

```tsx
          {isEnded && <NewsEndedBadge locale={locale} />}
```

`src/components/home/HomeLatestNews.tsx`:
- import 追加: `import { NewsEndedBadge } from "@/components/news/NewsEndedBadge";` と `import { isNewsEnded } from "@/lib/news/ended";`
- `items.map` 内の `const category = ...` の次の行に `const isEnded = isNewsEnded(item.eventEndAt);`
- `{category && (...)}` ブロックの直後に追加(1行に収める帯なので小さい文字サイズ):

```tsx
                    {isEnded && (
                      <NewsEndedBadge
                        locale={locale}
                        className="px-1.5 text-[9px] tracking-wider sm:text-[10px]"
                      />
                    )}
```

- [ ] **Step 4: 通ることを確認**

Run: `npx vitest run src/components/news src/components/home/HomeLatestNews.test.tsx src/components/home/HomeNews.test.tsx`
Expected: PASS(既存テストも含めて緑。`HomeNews` は `NewsCard` を使うので追加変更なし)

---

### Task 4: 詳細ページと本文レンダラーへの組み込み

**Files:**
- Modify: `src/components/news/NewsBodyRenderer.tsx`、`src/components/news/NewsBodyRenderer.test.tsx`、`src/app/[locale]/news/[slug]/page.tsx`、`src/app/[locale]/news/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: `isNewsEnded`・`unlinkBookingLinks`・`isBookingUrl`・`NewsEndedBadge`・`NewsEndedNotice`(Task 1〜3)
- Produces: `NewsBodyRenderer` に任意 prop `shouldUnlinkBookingLinks?: boolean`(既定 `false`)

- [ ] **Step 1: 失敗するテストを書く**

`src/components/news/NewsBodyRenderer.test.tsx` の末尾に追記(ファイル先頭で `render`・`screen` を import 済みか確認し、無ければ追加):

```tsx
describe("NewsBodyRenderer shouldUnlinkBookingLinks", () => {
  const html =
    '<p><a href="https://yoyaku.labola.jp/r/shop/3473/">予約はこちら</a> <a href="https://www.thepicklebang.com/reserve">予約ページ</a></p>';

  it("既定では予約先リンクを残す", () => {
    render(<NewsBodyRenderer displayMode="html" bodyHtml={html} body="" />);
    expect(screen.getByRole("link", { name: "予約はこちら" })).toBeInTheDocument();
  });

  it("true なら予約先リンクだけ外し、テキストは残す", () => {
    render(
      <NewsBodyRenderer
        displayMode="html"
        bodyHtml={html}
        body=""
        shouldUnlinkBookingLinks
      />,
    );
    expect(screen.queryByRole("link", { name: "予約はこちら" })).toBeNull();
    expect(screen.getByText(/予約はこちら/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "予約ページ" })).toBeInTheDocument();
  });

  it("リッチテキスト本文でも外す", () => {
    render(
      <NewsBodyRenderer
        displayMode="rich"
        bodyHtml=""
        body={html}
        shouldUnlinkBookingLinks
      />,
    );
    expect(screen.queryByRole("link", { name: "予約はこちら" })).toBeNull();
  });
});
```

`src/app/[locale]/news/[slug]/page.test.tsx` の `describe("NewsDetailPage", ...)` の中に追記:

```tsx
  describe("終了したイベント(eventEndAt)", () => {
    const ENDED = "2020-01-01T00:00:00.000Z";
    const LIVE = "2099-01-01T00:00:00.000Z";
    const bookingBody =
      '<p><a href="https://yoyaku.labola.jp/r/shop/3473/">LaBOLAで申込</a> <a href="https://www.thepicklebang.com/reserve">予約ページ</a></p>';

    it("終了で、バッジ・帯が出て、予約先リンクが外れる", async () => {
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({ slug: "ended", eventEndAt: ENDED, bodyHtml: bookingBody }),
      );
      await renderPage({ locale: "ja", slug: "ended" });

      expect(screen.getByText("終了")).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent(
        "このイベントは終了しました。",
      );
      expect(screen.queryByRole("link", { name: "LaBOLAで申込" })).toBeNull();
      expect(screen.getByText(/LaBOLAで申込/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "予約ページ" })).toBeInTheDocument();
    });

    it("英語は Ended と英語の帯", async () => {
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({ locale: "en", slug: "ended", eventEndAt: ENDED }),
      );
      await renderPage({ locale: "en", slug: "ended" });
      expect(screen.getByText("Ended")).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent("This event has ended.");
    });

    it("未終了・未設定では何も変わらない", async () => {
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({ slug: "live", eventEndAt: LIVE, bodyHtml: bookingBody }),
      );
      await renderPage({ locale: "ja", slug: "live" });
      expect(screen.queryByText("終了")).toBeNull();
      expect(screen.queryByRole("note")).toBeNull();
      expect(screen.getByRole("link", { name: "LaBOLAで申込" })).toBeInTheDocument();
    });

    it("終了時、予約先の externalLink ボタンは出さない", async () => {
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({
          slug: "ended-ext",
          eventEndAt: ENDED,
          externalLink: {
            label: "テニスベアで申込",
            url: "https://www.tennisbear.net/events/1",
          },
        }),
      );
      await renderPage({ locale: "ja", slug: "ended-ext" });
      expect(screen.queryByRole("link", { name: /テニスベアで申込/ })).toBeNull();
    });

    it("終了しても、予約先以外の externalLink ボタンは残す", async () => {
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({
          slug: "ended-other",
          eventEndAt: ENDED,
          externalLink: {
            label: "開催レポート",
            url: "https://www.instagram.com/p/abc/",
          },
        }),
      );
      await renderPage({ locale: "ja", slug: "ended-other" });
      expect(screen.getByRole("link", { name: /開催レポート/ })).toBeInTheDocument();
    });

    it("未終了なら予約先の externalLink ボタンを出す", async () => {
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({
          slug: "live-ext",
          eventEndAt: LIVE,
          externalLink: {
            label: "テニスベアで申込",
            url: "https://www.tennisbear.net/events/1",
          },
        }),
      );
      await renderPage({ locale: "ja", slug: "live-ext" });
      expect(screen.getByRole("link", { name: /テニスベアで申込/ })).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/news/NewsBodyRenderer.test.tsx "src/app/[locale]/news/[slug]/page.test.tsx"`
Expected: FAIL(prop が無視される / バッジ・帯が出ない)

- [ ] **Step 3: 実装**

`src/components/news/NewsBodyRenderer.tsx`:
- import 追加(`@/lib/news/sanitize` の import の直後): `import { unlinkBookingLinks } from "@/lib/news/unlinkBookingLinks";`
- `NewsBodyRendererProps` に `shouldUnlinkBookingLinks?: boolean;` を追加
- `NewsBodyRenderer` の引数に `shouldUnlinkBookingLinks = false,` を追加
- `handleBodyClick` の定義の直前に追加:

```tsx
  // サニタイズ後に、終了イベントでは予約先リンクを外す。
  const prepareHtml = (
    raw: string,
    config: typeof STRICT_HTML_CONFIG | typeof RICH_EDITOR_CONFIG,
  ): string => {
    const safe = sanitizeNewsHtml(raw, config, { isFirstImageLcp });
    return shouldUnlinkBookingLinks ? unlinkBookingLinks(safe) : safe;
  };
```

- `renderBody(` の4つの呼び出し(`sanitizeNewsHtml(bodyHtml, STRICT_HTML_CONFIG, { isFirstImageLcp })` と `sanitizeNewsHtml(body, RICH_EDITOR_CONFIG, { isFirstImageLcp })`)を、それぞれ `prepareHtml(bodyHtml, STRICT_HTML_CONFIG)` / `prepareHtml(body, RICH_EDITOR_CONFIG)` に置き換える

`src/app/[locale]/news/[slug]/page.tsx`:
- import 追加: `import { NewsEndedBadge } from "@/components/news/NewsEndedBadge";`、`import { NewsEndedNotice } from "@/components/news/NewsEndedNotice";`(既存の `NewsBodyRenderer` import の近く)、`import { isNewsEnded } from "@/lib/news/ended";`、`import { isBookingUrl } from "@/lib/news/unlinkBookingLinks";`(`@/lib/news/label` の近く)
- `const cats = resolveCategories(item.category);` の次に追加:

```tsx
  const isEnded = isNewsEnded(item.eventEndAt);
  // 終了したイベントでは、予約先への申込ボタンを出さない。
  const shouldShowExternalLink =
    item.externalLink !== undefined &&
    !(isEnded && isBookingUrl(item.externalLink.url));
```

- カテゴリ行の `<time ...>` の直前に `{isEnded && <NewsEndedBadge locale={locale} />}` を追加
- 本文ラッパー `<div className="mt-10">` の中、`<NewsBodyRenderer` の直前に `{isEnded && <NewsEndedNotice locale={locale} />}` を追加し、`NewsBodyRenderer` に `shouldUnlinkBookingLinks={isEnded}` を渡す
- `{item.externalLink && (` を `{shouldShowExternalLink && item.externalLink && (` に変更(型の絞り込みのため `item.externalLink` も残す)

- [ ] **Step 4: 通ることを確認**

Run: `npx vitest run src/components/news/NewsBodyRenderer.test.tsx "src/app/[locale]/news/[slug]/page.test.tsx"`
Expected: PASS(既存テストも緑)

---

### Task 5: 運用成果物(手順書・変更案リスト)

**Files:**
- Modify: `docs/operations/news-admin-manual.md`(「予約投稿」節の前に新節を追加)
- Create: `docs/operations/szb-508-change-list.md`

- [ ] **Step 1: 手順書に「終了日(eventEndAt)」の節を追加**

`## 予約投稿` の直前に、次の内容の節を入れる:

```markdown
## 終了日(eventEndAt)を入れる — 終わったイベントを自動で「終了」表示にする

イベント・期間つきのお知らせ(お盆・シルバーウィークなど)には、**終了日時**を入れておくと、その日時を過ぎたあと自動で次のように変わります。手作業で【終了】を題名に足す必要はありません。

- 一覧・ホームのカードと記事に「終了」(英語は "Ended")のバッジが付く
- 記事の本文冒頭に「このイベントは終了しました。最新の開催情報は…」の帯が出る
- 本文中の LaBOLA・テニスベア宛てのリンクが、文字だけを残して外れる
- 記事末尾の外部リンクボタンが LaBOLA・テニスベア宛てなら消える

### 入れ方
1. 記事の編集画面で「終了日時(eventEndAt)」を選ぶ
2. **イベントの最終日の 23:59**(日本時間)を入れる(例: 8月22日開催なら 2026/08/22 23:59)
3. 期間のお知らせ(お盆など)も、最終日の 23:59 を入れる
4. 日英の記事は別のレコードなので、**英語版にも同じ日時を入れる**
5. 開催の終了と関係のない記事(会員制度の案内・設備の紹介など)は**空のまま**にする(空なら何も変わりません)

### 注意
- 日時を過ぎると反映は自動です(再公開や再デプロイは不要)
- 「公開」前の下書きプレビューでも、日時を過去にすれば終了後の見え方を確かめられます
- 題名に手で入れた【終了】は、終了日時を入れたら外してかまいません(二重表示になるため)

### 初回だけ: フィールドの追加(管理者)
microCMS の管理画面 → news API → API スキーマ → フィールドを追加 → 種類「日時」→ フィールドID `eventEndAt`、表示名「終了日時」、**必須にしない**。
```

- [ ] **Step 2: 変更案リストを作成**

`docs/operations/szb-508-change-list.md` に、本番には書き込まない前提で次を記す:

```markdown
# szb-508 変更案リスト(microCMS 本番は人間が反映する)

起票: 2026-10-01 / issue #508 / 設計: `docs/superpowers/specs/2026-10-01-szb-508-freshness-design.md`

> 前提: microCMS の news に `eventEndAt`(日時・必須にしない)を追加し、コードが本番に出たあとに入力する。開催日は反映前に各記事の本文で再確認する。日英は別レコードなので両方に入れる。

## A. eventEndAt に入れる値(終了6本・日英で8件)
| slug | 言語 | 入れる値(JST) | 備考 |
|---|---|---|---|
| silver-week-2026 | ja | 2026-09-23 23:59 | 期間(9/19〜23)の最終日 |
| picklerox-2026 | ja・en | 2026-08-23 23:59 | 申込枠(テニスベア/LaBOLA)のリンクが自動で外れる |
| ppt-vol4-kuroburudon-2026 | ja・en | 2026-08-22 23:59 | 申込枠(テニスベア)のリンクが自動で外れる |
| obon-2026 | ja | 2026-08-16 23:59 | 期間(8/11〜16)の最終日 |
| ppt-vol3-natsumatsuri-2026 | ja | 2026-07-19 23:59 | 申込枠(テニスベア)のリンクが自動で外れる。同じ大会の開催報告記事(ppt-vol3-summer-festival-report)は告知ではないので空のまま |
| medalist-morning-free-campaign | ja | 2026-08-31 23:59 | 対象の木曜6:00練習会自体も終了済み |

手打ちの【終了】付きの記事にも入れておく(題名の【終了】は入力後に外してよい):
| slug | 言語 | 入れる値(JST) |
|---|---|---|
| hyrox-osaka-early-access-simulation | ja | 2026-09-26 23:59 |
| early-morning-pickleball-dupr35 | ja | 本文で最終開催日を確認して入力 |

## B. 本文の手直し案(公開は人間のみ。書き直しは `npm run growth:body-diff` を通す)
1. **silver-week-2026**: 本文リンク「体験会…9月19日・22日・27日」が、10月版に書き換わった体験会記事(hyrox-morning-trial-class-2026)を指していて食い違う。リンク文言を現在の記事に合う表現にするか、終了済みなのでリンクを削除する
2. **hyrox-official-training-gym(英語版)**: `/en/columns/hyrox-beginners-guide`(404)へのリンクを外すか、日本語記事へ張り替える(#511 の範囲と重なるため調整)
3. **pbt-club-membership(英語版)**: 題が「8月1日開始」のまま(日本語版は9/17改稿済み)。日本語版に合わせて更新

## C. 期限つきコラム(コードは変更しない。microCMS で改稿)
| 記事 | 内容 | 期限・タイミング |
|---|---|---|
| pickleball-funabashi-guide | 「2026年10月下旬に開業予定」の他施設(TAROKO 下総中山)を軸にした構成 | **10月下旬の開業後に更新**。開業の事実を確認してから書き直す |
| pickleball-chiba-guide | 同じ「開業予定(10月下旬)」の記述 | 同上 |
| summer-indoor-pickleball-motoyawata | 夏の季節記事(今は秋) | 季節を問わない題への改稿、または秋冬向けへの置き換え |

改稿の進め方: 既存記事との検索意図の重なり(カニバリ)と、消えた要素(リンク・見出し・表)のチェックを必ず通す。未確定の日時・料金は断定せず「最新情報をご確認ください」と促す。
```

(開催日は R7 調査 `docs/research/2026-10-site-zero-base/R7-content-ia.md` の表に基づく。入力前に本文で再確認する旨を表の前提に書いてある。)

- [ ] **Step 3: 体裁の確認**

Run: `grep -n "eventEndAt" docs/operations/news-admin-manual.md docs/operations/szb-508-change-list.md | head`
Expected: 両ファイルに記述がある

---

### Task 6: 全体検証と動作確認の証跡

**前提:** `npm ci` はオーナーのディスク空き確保後(司令塔が連絡)。それまでは Task 1〜5 のコード・テストを書き終えたところで待つ。

- [ ] **Step 1: 全体検証**

Run: `npm run test:coverage && npm run lint && npx tsc --noEmit`
Expected: 全テスト緑・カバレッジ100%(閾値エラーなし)・lint エラーなし・型エラーなし。必要なら `npm run build` も実行

- [ ] **Step 2: 動作確認用データでの表示**

本番には書けないため、ローカルの dev サーバー(`npx next dev -p 3203`、`.env.local` は `cp /Users/tsutsumi.akihiro/dev/bigban/.env.local ./.env.local`)で、`/news`・`/news/<終了日時を過去にしたプレビュー記事>`・ホームを開く。microCMS の下書きに `eventEndAt` を入れられない間は、取得結果を一時的に差し替えた状態(コミットしない)で確認する。

- [ ] **Step 3: 証跡の保存**

`.superpowers/evidence/szb-508/` に、モバイル 375px とデスクトップ 1440px のスクリーンショット(一覧カード・ホーム最新ニュース・詳細の帯・リンクが外れた本文・終了なしの記事)を保存する。

- [ ] **Step 4: 司令塔へ「確認依頼」**

変更の要約、証跡の絶対パス、テスト・カバレッジ・lint・型の結果を送って止まる。コミットは OK の後。

---

## 自己レビュー(計画 vs 設計書)

- 設計 §2(`eventEndAt`・判定): Task 1 / §3(表示 B 案: バッジ・帯・リンク除去・externalLink): Task 2〜4 / §4(部品構成): ファイル構成表と一致 / §5(JSON-LD・キャッシュ・プレビュー): 変更なしのためコード Task なし(キャッシュは `force-dynamic` に依存。Task 6 の動作確認で再描画を確認) / §7(テスト): 各 Task / §8(運用成果物): Task 5
- 型・名前の整合: `isNewsEnded(eventEndAt, now?)`・`getEndedLabels(locale)`・`isBookingUrl`・`unlinkBookingLinks`・`NewsEndedBadge({locale, className?})`・`NewsEndedNotice({locale})`・`shouldUnlinkBookingLinks` は全 Task で同一
