# 「はじめての方へ」ページ新設 + ナビ常設 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **コミットは司令塔の OK が来るまで絶対にしない**(オーナー方針)。各タスクの末尾はコミットではなく「テスト緑の確認」で止める。

**Goal:** `/first-visit`(ja)/`/en/first-visit`(en)を新設し、ナビの先頭に常設リンクを足して、初めての人が予約前に迷う点を1ページで解消する。

**Architecture:** 設計書 `docs/superpowers/specs/2026-10-01-szb-428-first-visit-design.md` に従う。ページは Server Component の `page.tsx` が小さな Client Component(セクション単位)を並べる。値(受付開始日・人数の例・リンク先・1人あたり料金の計算)は `src/constants/firstVisit.ts` に集約し、料金は既存 `COURT_PRICES` から計算する(文言に金額を直書きしない)。

**Tech Stack:** Next.js 16 App Router / next-intl / Tailwind v4 / Framer Motion(`__mocks__/framer-motion.tsx` にエイリアス済み)/ Vitest + Testing Library。新しい依存なし。

## Global Constraints

- TDD(Red→Green→Refactor)。`strict`、`any` 禁止、`React.FC` 禁止、`import type`。
- カバレッジ 100%(statements/branches/functions/lines)。`vitest.config.ts` の除外追加・`istanbul ignore` 新規追加・`.only/.skip` は禁止。
- 書かない: **天井・照明**(オーナー方針: ネガティブな施設情報は書かない)、「駐車場なし」(→「近隣のコインパーキングをご利用ください」)、「説明役は付きません」、早朝の解錠など入館の具体手順(「予約時間になったらそのまま入館できます」のみ)、ボール貸出の有無、受付開始の**時刻**、キャンセル規定の中身(「LaBOLA の規定に従う」)、他主催者の会。
- 書いてよい: 年中無休、シャワーなし、コインパーキング案内、パドル1本¥500(1コート6本まで)、ノーマーキングシューズ(貸出なし。「体育館履き」は使わない)、受付開始は一般14日前・PBT CLUB会員30日前、支払いは LaBOLA での事前Web決済(クレジットカード・PayPay)。
- 人数の例は「ダブルスなら4人で割ると」の割り算の例。人数上限の規定とは書かない。
- 1人参加は「施設主催のイベントへ。日程は最新情報をご確認ください」。#510 の体験会表示は今回は出さない。
- `messages/ja.json`・`en.json` は**追記のみ**(`Reserve` ブロックの直後に `FirstVisit` を挿入、`Navigation` と `Metadata` に項目追加)。無関係な整形をしない。
- `/reserve`・`HomePricing`・`CourtPriceTable` は変更しない。
- PBT CLUB への入口は暫定で `/news/pbt-club-membership`(#429 マージ後に `PBT_CLUB_LINK_PATH` を `/pbt-club` に1行で切替)。
- コミット規約: 日本語の Conventional Commits(ただしコミットは OK 後)。

## File Structure

| ファイル | 責務 |
|---|---|
| `src/constants/firstVisit.ts`(+`.test.ts`) | パス定数・受付開始日・人数の例・`parseYen`/`perPersonYen`/`formatYen`/`perPersonRows` |
| `src/components/firstVisit/FirstVisitSection.tsx`(+test) | 見出し(kicker+h2)と控えめなリビールの共通枠 |
| `src/components/firstVisit/FirstVisitHero.tsx`(+test) | h1・結論先出しのリード・ルール確認の導線・予約 CTA |
| `src/components/firstVisit/FirstVisitFlow.tsx`(+test) | ご利用の流れ(4ステップの `ol`) |
| `src/components/firstVisit/FirstVisitFacts.tsx`(+test) | 持ち物・レンタル・受付開始日・キャンセル・施設などの `dl` |
| `src/components/firstVisit/FirstVisitPricing.tsx`(+test) | `CourtPriceTable` 再利用 + 4人で割った1人あたり表 |
| `src/components/firstVisit/FirstVisitNext.tsx`(+test) | 次の入口(予約 / HYROX / PBT CLUB) |
| `src/components/firstVisit/FirstVisitFaq.tsx`(+test) | FAQ(`details`)+ FAQPage 構造化データ |
| `src/app/[locale]/first-visit/page.tsx`(+test) | メタデータ・パンくず・各セクション組み立て |
| `src/constants/navigation.ts` | `NAV_ITEMS` 先頭に `firstVisit` |
| `src/constants/routes.ts` | `SITEMAP_ROUTES` に `/first-visit` |
| `src/components/home/HomeUsageFlow.tsx` | 末尾に「はじめての方へ」リンク1本 |
| `messages/ja.json` / `en.json` | `FirstVisit`、`Navigation.firstVisit(Ja)`、`Metadata.firstVisit`、`HomeUsageFlow.firstVisitLink` |

---

### Task 1: 定数と1人あたり料金の計算

**Files:**
- Create: `src/constants/firstVisit.ts`
- Test: `src/constants/firstVisit.test.ts`

**Interfaces:**
- Produces: `FIRST_VISIT_PATH`, `HYROX_PATH`, `PBT_CLUB_LINK_PATH`, `BEGINNER_GUIDE_PATH`, `PARTY_SIZE_EXAMPLE`, `BOOKING_WINDOW_DAYS`, `parseYen(price: string): number`, `perPersonYen(priceYen: number, partySize: number): number`, `formatYen(amount: number): string`, `interface PerPersonRow { timeSlot: string; weekday: string; weekend: string }`, `perPersonRows(partySize?: number): readonly PerPersonRow[]`

- [ ] **Step 1: 失敗するテストを書く** — `src/constants/firstVisit.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { COURT_PRICES } from "@/constants/pricing";
import {
  BOOKING_WINDOW_DAYS,
  FIRST_VISIT_PATH,
  PARTY_SIZE_EXAMPLE,
  formatYen,
  parseYen,
  perPersonRows,
  perPersonYen,
} from "./firstVisit";

describe("firstVisit 定数", () => {
  it("パスと受付開始日(公開済みニュースの値)を持つ", () => {
    expect(FIRST_VISIT_PATH).toBe("/first-visit");
    expect(BOOKING_WINDOW_DAYS).toEqual({ general: 14, member: 30 });
    expect(PARTY_SIZE_EXAMPLE).toBe(4);
  });
});

describe("parseYen", () => {
  it("料金表の表記を数値にする", () => {
    expect(parseYen("¥4,980")).toBe(4980);
  });
  it("数字が無い文字列は例外にする", () => {
    expect(() => parseYen("無料")).toThrow("金額を読み取れません");
  });
});

describe("perPersonYen", () => {
  it.each([
    [4980, 1250],
    [5980, 1500],
    [7980, 2000],
  ])("4人で割った %i 円は10円単位に丸めて %i 円", (price, expected) => {
    expect(perPersonYen(price, 4)).toBe(expected);
  });
  it.each([0, -1, 1.5])("人数 %s は例外にする", (size) => {
    expect(() => perPersonYen(4980, size)).toThrow(RangeError);
  });
});

describe("formatYen", () => {
  it("¥とカンマ区切りで表す", () => {
    expect(formatYen(1250)).toBe("¥1,250");
  });
});

describe("perPersonRows", () => {
  it("COURT_PRICES の全行を既定4人で割った表を返す", () => {
    const rows = perPersonRows();
    expect(rows.map((r) => r.timeSlot)).toEqual(
      COURT_PRICES.map((r) => r.timeSlot),
    );
    expect(rows[0]).toEqual({
      timeSlot: "6:00-9:00",
      weekday: "¥1,250",
      weekend: "¥2,000",
    });
  });
  it("人数を指定できる", () => {
    expect(perPersonRows(2)[0].weekday).toBe("¥2,490");
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/constants/firstVisit.test.ts` / Expected: FAIL(モジュールが無い)

- [ ] **Step 3: 最小実装** — `src/constants/firstVisit.ts`

```ts
import { COURT_PRICES } from "@/constants/pricing";

export const FIRST_VISIT_PATH = "/first-visit";
export const HYROX_PATH = "/hyrox";

// PBT CLUB への入口。暫定で告知ニュース。#429 の /pbt-club がマージされたらここ1行を切り替える。
export const PBT_CLUB_LINK_PATH = "/news/pbt-club-membership";

// ルール・始め方の確認先(公開済みコラム「ピックルボールの始め方」)。
export const BEGINNER_GUIDE_PATH = "/columns/pickleball-tv-first-step";

// 「ダブルスなら4人で割ると」の例の人数。人数上限の規定ではない。
export const PARTY_SIZE_EXAMPLE = 4;

// 予約の受付開始日(何日前から)。出典: ニュース pbt-club-membership(2026-08-03)。時刻は書かない。
export const BOOKING_WINDOW_DAYS = { general: 14, member: 30 } as const;

export function parseYen(price: string): number {
  const digits = price.replace(/[^0-9]/g, "");
  if (digits === "") throw new Error(`金額を読み取れません: ${price}`);
  return Number(digits);
}

// 人数で割り、10円単位に丸める(例: 4,980円/4人 = 1,245 → 1,250)。
export function perPersonYen(priceYen: number, partySize: number): number {
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new RangeError(`人数は1以上の整数: ${partySize}`);
  }
  return Math.round(priceYen / partySize / 10) * 10;
}

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("en-US")}`;
}

export interface PerPersonRow {
  timeSlot: string;
  weekday: string;
  weekend: string;
}

export function perPersonRows(
  partySize: number = PARTY_SIZE_EXAMPLE,
): readonly PerPersonRow[] {
  return COURT_PRICES.map((row) => ({
    timeSlot: row.timeSlot,
    weekday: formatYen(perPersonYen(parseYen(row.weekday), partySize)),
    weekend: formatYen(perPersonYen(parseYen(row.weekend), partySize)),
  }));
}
```

- [ ] **Step 4: 緑を確認** — Run: `npx vitest run src/constants/firstVisit.test.ts` / Expected: PASS

---

### Task 2: メッセージ(ja/en)とナビ・サイトマップ・ホームリンクの文言

**Files:**
- Modify: `messages/ja.json`, `messages/en.json`(追記のみ)
- Test: `src/i18n/firstVisitMessages.test.ts`(新規)

**Interfaces:**
- **実装メモ(2026-10-01)**: `flow.steps` / `facts.items` / `next.items` / `faq.items` は配列ではなく、固定キーのオブジェクト(`steps.{reserve,pay,enter,play}`、`items.{bring,rental,bookingOpens,cancel,solo,hours,facility,car,late}`、`next.items.{reserve,hyrox,pbtClub}`、`faq.items.{allBeginners,solo,bring,bookingOpens,cancel,payment,car}`)にした。コンポーネントはキー配列で map し、型ガードの分岐を持たない。
- Produces(以降のタスクが使うキー。ja/en 同一構造): `FirstVisit.hero.{kicker,title,lead,rulesNote,rulesLink,cta}`、`FirstVisit.flow.{heading,headingEn,steps[4]{title,description}}`、`FirstVisit.facts.{heading,headingEn,items[]{label,value}}`(value は ICU `{general}` `{member}` を含む行あり)、`FirstVisit.pricing.{heading,headingEn,intro,perPersonLabel,timeSlot,weekday,weekend,note}`、`FirstVisit.next.{heading,headingEn,items[3]{key,title,description,cta}}`、`FirstVisit.faq.{heading,headingEn,items[]{question,answer}}`、`Navigation.firstVisit` / `firstVisitJa`、`Metadata.firstVisit.{title,description}`、`HomeUsageFlow.firstVisitLink`

- [ ] **Step 1: 失敗するテストを書く** — `src/i18n/firstVisitMessages.test.ts`

```ts
import { describe, it, expect } from "vitest";
import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";

const FORBIDDEN = [
  "天井",
  "照明",
  "ceiling",
  "lighting",
  "駐車場なし",
  "説明役",
  "体育館",
];

function flatten(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flatten);
  }
  return [];
}

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shape(v)]),
    );
  }
  return typeof value;
}

describe("FirstVisit メッセージ", () => {
  it("ja と en は同じ構造を持つ", () => {
    expect(shape(enMessages.FirstVisit)).toEqual(shape(jaMessages.FirstVisit));
  });

  it("方針で書かないと決めた語を含まない(ja/en)", () => {
    for (const messages of [jaMessages, enMessages]) {
      const text = flatten(messages.FirstVisit).join("\n");
      for (const word of FORBIDDEN) {
        expect(text).not.toContain(word);
      }
    }
  });

  it("ナビ・メタデータ・ホームリンクのキーが ja/en にある", () => {
    for (const messages of [jaMessages, enMessages]) {
      expect(messages.Navigation.firstVisit).toBe("FIRST VISIT");
      expect(messages.Metadata.firstVisit.title).not.toBe("");
      expect(messages.Metadata.firstVisit.description).not.toBe("");
      expect(messages.HomeUsageFlow.firstVisitLink).not.toBe("");
    }
    expect(jaMessages.Navigation.firstVisitJa).toBe("はじめての方へ");
    expect(enMessages.Navigation.firstVisitJa).toBe("");
  });

  it("受付開始日と1人参加の文言を含む", () => {
    const ja = flatten(jaMessages.FirstVisit).join("\n");
    expect(ja).toContain("{general}日前");
    expect(ja).toContain("施設主催のイベント");
    expect(ja).toContain("コインパーキング");
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/i18n/firstVisitMessages.test.ts` / Expected: FAIL(`FirstVisit` が undefined)

- [ ] **Step 3: メッセージを追記する**

`messages/ja.json`:
- `Navigation` の `"access": "ACCESS",` の直後に `"firstVisit": "FIRST VISIT",` を、`"accessJa": "アクセス",` の直後に `"firstVisitJa": "はじめての方へ",` を挿入。
- `Metadata` の `"reserve": {…},` の直後に次を挿入:
```json
    "firstVisit": {
      "title": "はじめての方へ｜ご利用の流れ・持ち物・料金の目安",
      "description": "ピックルボールが初めての方・全員初心者のグループへ。ご利用の流れ、持ち物とレンタル、4人で割った1人あたり料金の目安、予約の受付開始日までを1ページでご案内します。本八幡駅徒歩1分、6:00–23:00・年中無休。"
    },
```
- `HomeUsageFlow` の `"steps": {…}` の閉じ括弧の後ろに `"firstVisitLink": "はじめての方へ詳しく"` を追加(直前の要素に `,` を付ける)。
- `Reserve` ブロック全体の直後に次の `FirstVisit` ブロックを挿入:

```json
  "FirstVisit": {
    "hero": {
      "kicker": "FIRST VISIT",
      "title": "はじめての方へ",
      "lead": "ピックルボールが初めてでも、全員初心者のグループでも楽しめます。持ち物はノーマーキングシューズだけ。予約はオンラインで、当日は予約時間になったらそのまま入館できます。",
      "rulesNote": "ルールは事前に確認できます。",
      "rulesLink": "ピックルボールの始め方を読む",
      "cta": "コートを予約する"
    },
    "flow": {
      "heading": "ご利用の流れ",
      "headingEn": "HOW IT WORKS",
      "steps": [
        { "title": "予約する", "description": "予約サイトで日時を選びます。コートは1時間単位で借りられます。" },
        { "title": "オンラインで支払う", "description": "予約時に、クレジットカードまたは PayPay で事前にお支払いいただきます。" },
        { "title": "入館する", "description": "本八幡駅から徒歩1分。予約時間になったらそのまま入館できます。" },
        { "title": "プレーする", "description": "ノーマーキングシューズに履き替えてプレー。パドルはレンタルもあります。" }
      ]
    },
    "facts": {
      "heading": "ご利用の前に",
      "headingEn": "GOOD TO KNOW",
      "items": [
        { "label": "持ち物", "value": "ノーマーキングシューズ(シューズの貸出はありません)" },
        { "label": "レンタル", "value": "パドル 1本 ¥500(1コートにつき6本まで)" },
        { "label": "予約の受付開始", "value": "一般のご予約は{general}日前から、PBT CLUB会員は{member}日前からです。" },
        { "label": "キャンセル・変更", "value": "予約システム(LaBOLA)の規定に従います。予約時にご確認ください。" },
        { "label": "1人で参加したい", "value": "1人での参加は施設主催のイベントへ。日程は最新情報をご確認ください。" },
        { "label": "営業時間", "value": "6:00–23:00・年中無休" },
        { "label": "施設", "value": "全天候型インドア・空調完備。デコターフのコート3面。男女別更衣室・ラウンジ・自動販売機があります。シャワーはありません。" },
        { "label": "お車の方", "value": "近隣のコインパーキングをご利用ください。" },
        { "label": "遅れたとき", "value": "開始時刻に遅れても、ご予約枠の時間内でのご利用となります。" }
      ]
    },
    "pricing": {
      "heading": "料金の目安",
      "headingEn": "PRICING",
      "intro": "料金は1コート・1時間あたりです(税込)。ダブルスなら4人で割ると、1人あたりの目安は次のとおりです。",
      "perPersonLabel": "4人で割った1人あたり(1時間)",
      "timeSlot": "時間帯",
      "weekday": "平日",
      "weekend": "週末・祝日",
      "note": "4人で割った一例で、人数の上限を定めるものではありません。レンタル用品は別料金です。"
    },
    "next": {
      "heading": "次の一歩",
      "headingEn": "NEXT STEP",
      "items": [
        { "key": "reserve", "title": "コートを予約する", "description": "空き状況の確認と予約はこちらから。", "cta": "予約案内へ" },
        { "key": "hyrox", "title": "HYROX を試す", "description": "体験・クラス・エリア利用のご案内です。", "cta": "HYROX を見る" },
        { "key": "pbtClub", "title": "PBT CLUB", "description": "よく使う方向けの月額会員制度です。", "cta": "PBT CLUB を見る" }
      ]
    },
    "faq": {
      "heading": "よくある質問",
      "headingEn": "FAQ",
      "items": [
        { "question": "全員初心者でも大丈夫ですか?", "answer": "はい。ルールは事前に確認でき、初めての方向けの体験・トライアルや少人数制レッスンもご用意しています。" },
        { "question": "1人でも参加できますか?", "answer": "1人での参加は施設主催のイベントへ。日程は最新情報をご確認ください。" },
        { "question": "持ち物は何が必要ですか?", "answer": "ノーマーキングシューズをご持参ください(貸出はありません)。パドルは1本 ¥500 でレンタルできます。" },
        { "question": "何日前から予約できますか?", "answer": "一般のご予約は{general}日前から、PBT CLUB会員は{member}日前からです。" },
        { "question": "キャンセルはできますか?", "answer": "予約システム(LaBOLA)の規定に従います。予約時にご確認ください。" },
        { "question": "支払い方法は?", "answer": "予約時にオンラインで事前にお支払いいただきます(クレジットカード・PayPay)。" },
        { "question": "お車で行けますか?", "answer": "近隣のコインパーキングをご利用ください。" }
      ]
    }
  },
```

`messages/en.json`: 同じ位置に同じ構造で英訳を追記。`Navigation.firstVisit` = `"FIRST VISIT"`、`firstVisitJa` = `""`、`Metadata.firstVisit` = `{ "title": "First Visit — How it works, what to bring, pricing", "description": "A one-page guide for first-timers and all-beginner groups: how it works, what to bring and rent, per-person price estimates, and when booking opens. 1 min from Motoyawata Station, open 6:00–23:00, every day." }`、`HomeUsageFlow.firstVisitLink` = `"New here? Read the first-visit guide"`。`FirstVisit` の英訳(キーは ja と同一):
  - hero: kicker `FIRST VISIT` / title `First Visit` / lead `New to pickleball, or a group of total beginners? You'll have a great time. All you bring is non-marking shoes. Book online, and on the day just walk in at your booked time.` / rulesNote `You can check the rules beforehand.` / rulesLink `Read the beginner's guide (Japanese)` / cta `Book a court`
  - flow: heading `How it works` / headingEn `HOW IT WORKS` / steps: `Book` ("Pick your date and time on the booking site. Courts are rented by the hour.") / `Pay online` ("Pay in advance when you book, by credit card or PayPay.") / `Walk in` ("One minute on foot from Motoyawata Station. Just walk in at your booked time.") / `Play` ("Change into non-marking shoes and play. Rental paddles are available.")
  - facts: heading `Good to know` / headingEn `GOOD TO KNOW` / items(label→value): `What to bring`→`Non-marking shoes (rental shoes are not available)`; `Rentals`→`Paddles ¥500 each (up to 6 per court)`; `When booking opens`→`General bookings open {general} days ahead; PBT CLUB members {member} days ahead.`; `Cancel or change`→`Follows the booking system's (LaBOLA) policy. Please check when you book.`; `Coming alone`→`To join on your own, look for our facility-hosted events. Please check for the latest schedule.`; `Hours`→`6:00–23:00, open every day`; `Facility`→`All-weather indoor with air conditioning. Three DecoTurf courts. Men's and women's changing rooms, a lounge and vending machines. There are no showers.`; `By car`→`Please use a nearby coin parking lot.`; `Running late`→`If you arrive after the start time, you can still use the rest of your booked slot.`
  - pricing: heading `Pricing guide` / headingEn `PRICING` / intro `Prices are per court, per hour (tax included). Split among four for doubles, the per-person estimate is as follows.` / perPersonLabel `Per person when split 4 ways (1 hour)` / timeSlot `Time` / weekday `Weekday` / weekend `Weekend / holiday` / note `This is one example split four ways, not a cap on group size. Rentals are extra.`
  - next: heading `Next step` / headingEn `NEXT STEP` / items: reserve (`Book a court` / `Check availability and book.` / `Booking guide`), hyrox (`Try HYROX` / `Trials, classes and area rental.` / `See HYROX`), pbtClub (`PBT CLUB` / `A monthly membership for regular players.` / `See PBT CLUB`)
  - faq: heading `FAQ` / headingEn `FAQ` / 7件を ja と同順で英訳(Are all-beginner groups OK? / Can I come alone? / What should I bring? / How far ahead can I book? / Can I cancel? / How do I pay? / Can I come by car?)。回答は facts と同じ事実のみ。

- [ ] **Step 4: 緑を確認** — Run: `npx vitest run src/i18n/firstVisitMessages.test.ts` / Expected: PASS

---

### Task 3: セクション枠・Hero・流れ・「ご利用の前に」・料金・次の入口・FAQ(コンポーネント)

**Files:**
- Create: `src/components/firstVisit/FirstVisitSection.tsx`, `FirstVisitHero.tsx`, `FirstVisitFlow.tsx`, `FirstVisitFacts.tsx`, `FirstVisitPricing.tsx`, `FirstVisitNext.tsx`, `FirstVisitFaq.tsx` と、それぞれの `.test.tsx`

**Interfaces:**
- Consumes: Task 1 の定数・関数、Task 2 のメッセージキー、`CourtPriceTable`(`pbtClubLocation` 必須 prop)、`trackCtaClick(key: CtaKey, location: string, label?: string)`(`"reserveEntry"` を使う)、`revealInitial`・`EASE`(`@/constants/motion`)、`buildFaqPage`・`StructuredData`(`data` prop)
- Produces: 各 `default export`。`FirstVisitSection` は props `{ id: string; kicker: string; heading: string; children: ReactNode }`。他は props なし。

各コンポーネントは次の方針で、**テストを先に書いて(RED)→ 最小実装(GREEN)**の順で作る。テストは `renderWithIntl`(`@/test-utils/intl-wrapper`)で ja を描画し、en は構造一致を Task 2 のテストで担保する。

- [ ] **Step 1: `FirstVisitSection` のテスト→実装**
  - テスト: `heading` が h2、`kicker` が表示、`id` の `section` が `aria-labelledby` で h2 に結びつく、子要素が描画される。
  - 実装:
```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";

import { EASE, revealInitial } from "@/constants/motion";

import type { ReactNode } from "react";

interface FirstVisitSectionProps {
  id: string;
  kicker: string;
  heading: string;
  children: ReactNode;
}

export default function FirstVisitSection({
  id,
  kicker,
  heading,
  children,
}: FirstVisitSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="bg-deep-black text-text-light"
    >
      <motion.div
        className="mx-auto max-w-5xl border-t border-white/10 px-6 py-12 lg:px-12 lg:py-16"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <p className="text-[10px] tracking-[0.3em] text-accent">{kicker}</p>
        <h2
          id={titleId}
          className="mt-2 font-sans text-xl font-black tracking-[0.08em] sm:text-2xl"
        >
          {heading}
        </h2>
        <div className="mt-8">{children}</div>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: `FirstVisitHero` のテスト→実装**
  - テスト: h1「はじめての方へ」/ リード文 / `FIRST VISIT` kicker / ルールの導線リンク(`href` が `BEGINNER_GUIDE_PATH`)/ CTA リンクの `href` が `/reserve` / CTA クリックで `trackCtaClick("reserveEntry", "first_visit_hero", "コートを予約する")` が呼ばれる(`@/lib/analytics/trackEvent` を `vi.mock`)。
  - 実装の骨子: `pt-[calc(7rem+var(--promo-banner-h))]` で固定ヘッダー分を空ける(`ReserveHero` と同じ)。左寄せ・`max-w-5xl`。ルール導線は `next/link`(コラムは日本語のみで、`/en/columns/...` が 404 になるのを避けるため。理由をコメントに書く)。CTA は `@/i18n/navigation` の `Link` + `RESERVE_PATH`。h1 は `font-sans font-black text-4xl sm:text-5xl tracking-[0.08em]`(和文に Orbitron のグリフが無いため `font-serif` は使わない)。

- [ ] **Step 3: `FirstVisitFlow` のテスト→実装**
  - テスト: `FirstVisitSection` の見出し「ご利用の流れ」、`ol` に4つの `li`、各 h3 が `["予約する","オンラインで支払う","入館する","プレーする"]`、連番 `01`〜`04` は `aria-hidden`、入館の説明が「予約時間になったらそのまま入館できます」を含む。
  - 実装: `t.raw("steps")` を配列として検証してから map(`ReserveFaq` の `isFaqItem` と同じ型ガード方式。`isFlowStep`)。`HomeUsageFlow` と同じ番号つきの罫線カード。`md:grid-cols-4`。

- [ ] **Step 4: `FirstVisitFacts` のテスト→実装**
  - テスト: `dl` に9項目、ラベル `持ち物`/`レンタル`/…が `dt`、値が `dd`。「予約の受付開始」の値が `一般のご予約は14日前から、PBT CLUB会員は30日前からです。`(`BOOKING_WINDOW_DAYS` から埋まる)。「お車の方」に「コインパーキング」。値のどこにも「天井」「照明」「駐車場なし」が出ない。
  - 実装: `t("items.N.value", BOOKING_WINDOW_DAYS)` ではなく、`t.raw("items")` から `label`/`value` を取り出し、ICU 展開が要る行のために `t(\`items.${i}.value\`, BOOKING_WINDOW_DAYS)` で描画する(インデックスで取得。`items` の長さは `t.raw` の配列長)。`dl` は `grid sm:grid-cols-[10rem_1fr]`、行ごとに `border-t border-white/10`。

- [ ] **Step 5: `FirstVisitPricing` のテスト→実装**
  - テスト: 見出し「料金の目安」/ `COURT_PRICES` の金額(例 `¥4,980`)が表に出る(`CourtPriceTable` 再利用)/ 1人あたり表に `¥1,250` `¥1,500` `¥2,000` が出る/ 注記に「人数の上限を定めるものではありません」/ 「上限」という表現が「4人まで」などの規定として出ない。
  - 実装: `<FirstVisitSection id="pricing" …><CourtPriceTable pbtClubLocation="first_visit_pricing" />` の下に `perPersonRows()` の `table`(列: 時間帯 / 平日 / 週末・祝日、`caption` に `perPersonLabel`)と注記。

- [ ] **Step 6: `FirstVisitNext` のテスト→実装**
  - テスト: 3つの入口の `href` が `/reserve`(`RESERVE_PATH`)・`/hyrox`・`PBT_CLUB_LINK_PATH`。見出しと各 CTA 文言。予約への入口のクリックで `trackCtaClick("reserveEntry","first_visit_next",…)`。
  - 実装: `items` を `key` で `href` に対応づける定数マップ(`NEXT_HREFS: Record<"reserve"|"hyrox"|"pbtClub", string>`)。内部リンクは `@/i18n/navigation` の `Link`。

- [ ] **Step 7: `FirstVisitFaq` のテスト→実装**
  - テスト: 見出し「よくある質問」/ 7問が `details` で出る/ 質問「何日前から予約できますか?」の答えに「14日前」「30日前」/ `StructuredData` に FAQPage が出る(`script[type="application/ld+json"]` の JSON を parse し `mainEntity.length === 7`、回答テキストが画面と一致)。
  - 実装: `ReserveFaq` と同じ形(`isFaqItem` 型ガード)。ただし回答に `{general}` `{member}` があるので `t(\`items.${i}.answer\`, BOOKING_WINDOW_DAYS)` で展開した文字列を `FaqItem` に詰め、同じ配列を表示と `buildFaqPage` の両方に渡す(表示と構造化データを一致させる)。

- [ ] **Step 8: 緑を確認** — Run: `npx vitest run src/components/firstVisit` / Expected: PASS

---

### Task 4: ページ(`/first-visit`)とサイトマップ

**Files:**
- Create: `src/app/[locale]/first-visit/page.tsx`, `src/app/[locale]/first-visit/page.test.tsx`
- Modify: `src/constants/routes.ts`、`src/app/sitemap.test.ts`

**Interfaces:**
- Consumes: Task 3 の各コンポーネント、`HomeNavigation`/`HomeFooter`、`buildBreadcrumb`、`buildPageOpenGraph`、`parseLocale`、`isCmsColumnsEnabled`

- [ ] **Step 1: 失敗するテストを書く** — `page.test.tsx` は `reserve/page.test.tsx` と同じ構成で、子コンポーネントを `vi.mock` する。
  - `generateMetadata`: ja で canonical が `http://localhost:3000/first-visit`、alternates `{ ja, en: /en/first-visit, x-default }`、`openGraph.locale` が `ja_JP`。en で `/en/first-visit`・`en_US`。不正 locale(`fr`)で `{}`、`getTranslations` を呼ばない。title は `translated:firstVisit.title`。
  - ページ: 各セクション(`Hero`/`Flow`/`Facts`/`Pricing`/`Next`/`Faq`)がこの順で描画される、`HomeNavigation` に `showColumns` が渡る、不正 locale で `NEXT_NOT_FOUND`。
  - `sitemap.test.ts`: ja に `${PROD_URL}/first-visit`、en 側に `${PROD_URL}/en/first-visit` を `toContain` する行を追加。

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run "src/app/[locale]/first-visit" src/app/sitemap.test.ts` / Expected: FAIL

- [ ] **Step 3: 実装**
  - `page.tsx`: `reserve/page.tsx` の `generateMetadata` を踏襲し `reserve` → `firstVisit`、パスを `FIRST_VISIT_PATH` に。本体は `<main className="bg-deep-black min-h-screen">` に `StructuredData(buildBreadcrumb(locale, [{ name: "First Visit", path: FIRST_VISIT_PATH }]))` → `HomeNavigation` → Hero → Flow → Facts → Pricing → Next → Faq → `HomeFooter`。`notFound`/`setRequestLocale` も同じ。
  - `routes.ts`: `SITEMAP_ROUTES` の `/reserve` 行の直後に `{ path: "/first-visit", priority: 0.8, changeFrequency: "monthly" }`。

- [ ] **Step 4: 緑を確認** — Run: `npx vitest run "src/app/[locale]/first-visit" src/app/sitemap.test.ts src/app/pageOpenGraphContract.test.ts` / Expected: PASS(`pageOpenGraphContract` が全ページ走査型なら新ページも契約を満たすこと)

---

### Task 5: ナビ常設とホームのリンク

**Files:**
- Modify: `src/constants/navigation.ts`、`src/components/home/HomeUsageFlow.tsx`
- Modify(テスト): `src/components/home/HomeNavigation.test.tsx`、`MobileMenu.test.tsx`、`HomeFooter.test.tsx`(必要なら)、`HomeUsageFlow.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `Navigation.firstVisit(Ja)`・`HomeUsageFlow.firstVisitLink`、Task 1 の `FIRST_VISIT_PATH`

- [ ] **Step 1: 失敗するテストを書く**
  - `HomeNavigation.test.tsx`: `NAV_ITEMS` 配列の先頭に `{ label: "FIRST VISIT", href: "/first-visit" }` を追加、「8つの…」を「9つの…」に直す。新規テスト「FIRST VISIT がナビの先頭(CONCEPT の前)に出る」: `nav.querySelectorAll("a")` の href の先頭が `/first-visit`。
  - `MobileMenu.test.tsx`: `NAV` 配列の先頭に `{ name: "FIRST VISIT", href: "/first-visit" }`(`rows.length toBe NAV.length` が追従する)。
  - `HomeFooter` のナビ項目テストがあれば同様に更新。
  - `HomeUsageFlow.test.tsx`: 「はじめての方へ詳しく」の `link` が `/first-visit` を指す。
- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/components/home` / Expected: FAIL
- [ ] **Step 3: 実装**
  - `navigation.ts`: `NAV_ITEMS` の先頭に `{ id: "firstVisit", kind: "page", href: "/first-visit" },`。
  - `HomeUsageFlow.tsx`: `ol` の直後に `Link`(`@/i18n/navigation`)で `FIRST_VISIT_PATH` へ。小さなテキストリンク(`mt-8 inline-block text-xs tracking-[0.2em] text-accent hover:underline`)。ファイル冒頭コメントの「新規CTAは置かない」に「補助の導線(テキストリンク)は置く」旨を一文だけ足して矛盾を避ける。
- [ ] **Step 4: 緑を確認** — Run: `npx vitest run src/components/home src/constants` / Expected: PASS

---

### Task 6: 全体検証・実測・証跡

- [ ] **Step 1:** `npm run test:coverage` → 100%・閾値エラーなし。`npm run lint`、`npx tsc --noEmit`、`npm run build`(ページが生成されること)。
- [ ] **Step 2:** `.env.local` を `cp /Users/tsutsumi.akihiro/dev/bigban/.env.local ./.env.local` で用意し(中身は出力しない)、`npx next dev -p 3208` で起動。
- [ ] **Step 3:** `/first-visit` を **375px と 1440px** でスクリーンショット(`.superpowers/evidence/szb-428/`)。`/en/first-visit` も 375px で1枚。ナビは **1280px** で `/`・`/first-visit` を撮り、10項目で溢れないか確認(溢れるなら `HomeNavigation.tsx` の `xl:` ナビの `gap-8` を `gap-5 2xl:gap-8` のように詰めて再確認。変更したらそのテストも更新)。モバイルメニューに先頭項目が出ることも撮る。
- [ ] **Step 4:** 横スクロールが出ていないこと(`document.documentElement.scrollWidth <= innerWidth`)、キーボードで FAQ・リンクを操作できること、`prefers-reduced-motion` で内容が消えないことを確認。
- [ ] **Step 5:** 司令塔へ確認依頼(要約・証跡の絶対パス・テスト/カバレッジ/lint/型の結果)。**ここで止まって待つ。コミットしない。**

---

## Self-Review(計画 ↔ 設計書)

- 設計書 §3 の各セクション → Hero/Flow/Facts/Pricing/Next/Faq(Task 3)。「施設について」は Facts に統合(天井・照明の節は設けない)。
- §4 ナビ先頭・xl 実測・ホームのリンク → Task 5/6。ヒーロー3択は範囲外。
- §5 定数(`COURT_SPEC` は削除済み)→ Task 1。
- §6 メッセージ・メタデータ・sitemap・構造化データ → Task 2/3/4。en は同構造の英訳(Task 2 のテストで構造一致を担保)。
- §7 テスト → 各タスク。E2E/axe は既存の仕組みに `/first-visit` を足せる場合のみ(Task 6 の確認時に既存 e2e の一覧を見て判断し、足す場合は別途司令塔に報告)。
- 型の整合: `perPersonRows` の戻りは `PerPersonRow`、`FirstVisitPricing` が消費。`BOOKING_WINDOW_DAYS` は `{ general, member }` で ICU 変数名と一致。
- 未確定のまま書かないもの(ボール・解錠手順・時刻・規定の中身・天井照明)は Global Constraints で明示。
