# 支援者ウォール(Wall of Cosmic Contributors)設計書

- 起票日: 2026-07-31
- 対象: クラウドファンディング支援者の掲載ページ新設
- 見た目検証: `/contributors-proto`(25案。**採用は 24 GRID OF AIR**)。本実装完了後にルートごと削除する。
- 関連正典: `CLAUDE.md`(TDD 必須・100% カバレッジ・App Router 規約・Tailwind v4)

---

## 0. サマリ

クラウドファンディングのリターン「PBT 店内の支援者ウォールに掲載＆ウェブ掲載(リンク付き)」の**ウェブ側**を果たすページを新設する。

| 項目 | 決定 |
|---|---|
| URL | `/contributors`(en は `/en/contributors`) |
| デザイン | 24 GRID OF AIR — 罫線・枠・背景・番号を一切持たず、整列と余白量だけで構成 |
| データ | リポジトリ内の静的データ(`src/constants/contributors.ts`) |
| 掲載内容 | 掲載名・外部リンク・ロゴ画像のみ |
| 導線 | フッターにリンク(グローバルナビは追加しない) |

---

## 1. 背景

### 1.1 リターンで約束した内容

支援者エクスポートの リターン説明文より、ウェブ掲載として約束しているのは以下のみ。

- お名前の掲載
- ご希望のページへのリンク掲載
- 掲載期間: 2026年8月1日から事業が存続する限り

刻印サイズ(小 10cm / 中 15cm / 大 20cm)とバナーサイズ(小 120×60px / 中 180×70px / 大 260×90px)がランクごとに規定されている。**ウェブ側でもランク差を大きさで表現する**ことでこの規定と整合させる。

### 1.2 応援コメントを載せない理由

リターンに含まれていない。また実名・第三者名を含むコメントがあり、本人の別途了解なく転載できない。

### 1.3 データの実態

| 項目 | 実態 |
|---|---|
| 支援者数 | 24名(スプレッドシートの読み取り可能範囲。末尾が切れているため**要全件確認**) |
| ロゴ提出 | 3件のみ(焼肉やまと / 谷根千ラボ東京 / 株式会社ピックルボールワン) |
| 掲載名 | 備考欄の自由記述。依頼文・相談・問い合わせが混在し、7名が未確定 |

**ロゴが 24名中 3件しかない**ことが設計を決めている。ロゴ主体のグリッドを組むと 21個の空箱を名前で埋めることになり破綻する。したがって**名前を主役に据え、ロゴは「たまたま器を持っている支援者」として例外的に扱う**。

---

## 2. デザイン(24 GRID OF AIR)

### 2.1 方針

罫線・枠・背景色・通し番号・モーションを**一切持たない**。区切りは以下の2つだけ。

1. 厳格なグリッドによる整列の規律
2. セル間・ランク間の非常に大きな余白

### 2.2 構造

```
[見出し]  CONTRIBUTORS            ← Orbitron(font-serif) font-black tracking-[0.15em]
          支援者ウォール            ← text-xs tracking-[0.25em] text-text-gray
          ▬▬                      ← h-[3px] w-14 bg-accent

  (余白 mt-28 / lg:mt-40)

[大ランク] 3カラム gap-x-16 gap-y-20   名前 text-2xl〜3xl / ロゴ height=78
  (余白 mt-28 / lg:mt-40)
[中ランク] 3カラム gap-x-16 gap-y-14   名前 text-lg〜xl  / ロゴ height=48
  (余白 mt-28 / lg:mt-40)
[小ランク] 4カラム gap-x-16 gap-y-8    名前 text-[15px]  / ロゴ height=28
```

見出しはトップページのセクション見出し(`HomeConcept` / `HomeServices`)と同一の組み方にし、サイト内で一貫させる。

### 2.3 ランク名を出さない

「大/中/小」も金額も表示しない。大きさの差だけでランクを表現し、支援額の序列を露骨にしない。

### 2.4 実装時の修正点(プロトタイプからの差分)

- **日本語の禁則処理**: プロトタイプでは `大洗町ビーチテニス＆ピックルボールクラブ` が「＆ピ / ックルボールクラブ」と不自然な位置で折れる。`word-break: keep-all` 系の指定、または `overflow-wrap` の調整で解消する。
- **`prefers-reduced-motion`**: モーションを持たない設計のため対応不要。

---

## 3. データモデル

`src/constants/contributors.ts` に静的定義する。クラファンは終了済みで件数が固定のため CMS 化しない。

```ts
export type ContributorTier = "large" | "medium" | "small";

export interface ContributorLogoAsset {
  readonly src: string;
  readonly alt: string;
  /** 縦横比 (width / height)。面積を揃えるために使う。 */
  readonly aspect: number;
}

export interface Contributor {
  readonly id: string;
  readonly tier: ContributorTier;
  readonly name: string;
  readonly url?: string;
  readonly logo?: ContributorLogoAsset;
}
```

### 3.1 持ち込まない項目

住所・電話番号・メールアドレス・郵便番号・支援金額・応援コメントは**リポジトリにも microCMS にも一切持ち込まない**。

---

## 4. ロゴの扱い

### 4.1 決定: 加工しない

支給された画像をそのまま `next/image` で表示する。反転・`mix-blend-mode`・白プレートのいずれも行わない。

### 4.2 実測と黒背景での見え方

| ファイル | 実寸 | 比率 | 透過 | 黒地での見え方 |
|---|---|---|---|---|
| `29yamato.jpg` | 907×443 | 2.05:1 | なし | **白い長方形**として出る |
| `pickleball-one.png` | 1755×697 | 2.52:1 | なし | **白い長方形**として出る |
| `yanesen-lab-tokyo.png` | 1254×1254 | 1:1 | なし | 黒地に溶ける |

白い長方形が2枚出ることは**承知のうえでの決定**(「ロゴが自分のタイルを持っている」見え方として成立させる)。

### 4.3 大きさの正規化(唯一行う処理)

**高さではなく面積を揃える。** 高さだけを揃えると、正方形の谷根千ラボ東京が横長の焼肉やまとの半分以下の面積になり、同じ列で明らかに弱く見える。

```
scale = sqrt(2.5 / aspect)   // 2.5 = 基準縦横比(一般的な横組みロックアップ)
height = round(baseHeight * scale)
width  = round(height * aspect)
```

---

## 5. リンク

支援の対価として掲載するリンクであるため、Google のリンクスパムポリシーに従い以下を必須とする。

```html
rel="sponsored nofollow noopener noreferrer" target="_blank"
```

---

## 6. 掲載名の確定状況

### 6.1 決定: 現状の推定名で公開する

備考欄から抽出した名前で先に公開し、後から修正する。

### 6.2 未確定7名(公開前に確認が望ましい)

| 支援者 | 備考欄の状態 |
|---|---|
| 谷根千ラボ東京 | 実務連絡先が別メール指定。リンク先URL未確定 |
| YUTA OGINO | 「後ほど本人と相談」 |
| YUKI SADAKANE | 文字数制限の問い合わせあり |
| Picklepon & Yonepis | 文字数超過時は修正またはバナー掲載への変更を希望 |
| THARIA | 数ヶ月以内にロゴ変更予定 |
| 岩永武彦 | 長い掲載名が可なら「岩永武彦(栃木県喜連川)」を希望 |
| 小野 正善 | **備考欄にリターン説明文がそのまま貼られており掲載名の記載なし** |

### 6.3 要確認(実装をブロックしない)

`小野 正善`・`ひろさん`・`豊田 毅彦` など備考欄に掲載名の記載が無かった支援者について、現在データに入れている名前は**支援者情報の「氏名」欄(本名)からの転記**であり、本人が掲載を希望した名前ではない。公開前に一度確認することを推奨する。

### 6.4 スプレッドシートの全件確認

読み取りが 24名目の途中で切れているため、**25名目以降が存在する可能性がある**。実装前に CSV エクスポートで全件を確定させる。

---

## 7. ルーティングと SEO

| 項目 | 内容 |
|---|---|
| パス | `src/app/[locale]/contributors/page.tsx` |
| canonical | ja: `${SITE_URL}/contributors` / en: `${SITE_URL}/en/contributors` |
| alternates | ja / en / x-default |
| 構造化データ | `buildBreadcrumb(locale, [{ name, path: "/contributors" }])` |
| sitemap | `SITEMAP_ROUTES` に追加(priority 0.5 / changeFrequency: yearly) |
| 導線 | `HomeFooter` にリンク追加。`NAV_ITEMS` は変更しない |

### 7.1 i18n

掲載名・ロゴは固有名詞のため ja / en 共通。見出し・リード文・フッターリンク文言のみ `messages/{ja,en}.json` に追加する。

---

## 8. テスト方針

`CLAUDE.md` の TDD と 100% カバレッジに従う。

| 対象 | テスト内容 |
|---|---|
| `src/constants/contributors.ts` | `byTier` のランク絞り込み、id の一意性 |
| `ContributorLogo` | alt 描画、面積正規化(基準比 / 正方形 / 極端な横長) |
| `ContributorsContent` | ランク別の描画、リンクの `rel` 属性、ロゴ有無の出し分け |
| `page.tsx` | metadata・canonical・alternates・breadcrumb |
| `HomeFooter` | 支援者ウォールへのリンク追加(既存テストの更新) |
| `SITEMAP_ROUTES` | `/contributors` の追加(既存テストの更新) |

**E2E は対象外。** `CLAUDE.md` は「全ページで axe-core 監査」と記すが、実際の `e2e/` にはグロース承認画面のスペック(`growth-approve-critical.spec.ts`)しか存在せず、サイト本体を対象にした E2E スイートは未整備。本ページのためだけに新規スイートを立ち上げるのは過剰なため、単体/結合テストで担保する。

---

## 9. 作業後の後始末

`/contributors-proto` は見た目検証専用のため、本実装の完了時に以下をまとめて削除する。

- `src/app/contributors-proto/`(25案・レイアウト・データ・テスト一式)
- `src/middleware.ts` の matcher から `contributors-proto` を除去
- `src/middleware.test.ts` の該当テストを除去

`public/contributors/logos/` は本実装でも使うため残す。
