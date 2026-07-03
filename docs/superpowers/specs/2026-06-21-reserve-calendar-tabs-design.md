# 予約カレンダー タブ切替（ピックルボールコート / H Y R O X）設計書

- 日付: 2026-06-21
- 対象: `/reserve` ページのカレンダー（labola 埋め込み）
- 関連: [予約ページ設計書](./2026-06-02-reserve-page-design.md)

## 背景・目的

現在 `/reserve` のカレンダーは labola を `tab_name=すべて` で 1 枚表示しており、ピックルボールコートと HYROX の予約枠が混在している。利用者が目的の施設をすぐ選べるよう、**「ピックルボールコート」「H Y R O X」の 2 タブ**に分けて表示する。

切替は labola 埋め込み URL の `tab_name` パラメータを差し替えることで実現する（labola 側に登録済みの予約カテゴリ名でフィルタされる）。

## 要件

- タブは **2 つ**:
  - **ピックルボールコート**（`tab_name=ピックルボールコート`）
  - **H Y R O X**（`tab_name=H Y R O X` ※半角スペース入りが labola 登録名。`encodeURIComponent` で `H%20Y%20R%20O%20X` になる）
- **初期表示はピックルボールコート**（メイン施設）。
- 「すべて」タブは廃止。
- 表示ラベルは ja/en 共通で「ピックルボールコート」「H Y R O X」（英語ページも当面は同じ。将来 en だけ "Pickleball Court" 等に変更可能なよう i18n 経由にする）。

## 重要な制約

- `tab_name` の値は **labola 管理画面の登録カテゴリ名と完全一致**が必須。1 文字でも違うと意図したフィルタにならない。
  - ピックルボール: `ピックルボールコート`
  - HYROX: `H Y R O X`（H・半角スペース・Y・半角スペース・R・半角スペース・O・半角スペース・X）

## アーキテクチャ

採用方式: **WAI-ARIA Tabs パターン**（`tablist` / `tab` / `tabpanel`）。実質パネルは 1 枚で、アクティブタブに応じて iframe の `src`（`tab_name`）を差し替える。

> 代替案として「トグルボタン群（aria-pressed）」「iframe 2 枚を show/hide」を検討。後者は外部 iframe を 2 枚同時ロードし表示が重くなるため却下。前者より ARIA Tabs の方が操作性・アクセシビリティが優れるため採用。

### 1. 定数 `src/constants/site.ts`

- 既存の `LABOLA_CALENDAR_SRC`（`tab_name=すべて` 固定）を廃止。
- 追加:
  - `LABOLA_CALENDAR_BASE = "https://yoyaku.labola.jp/r/shop/3473/calendar/?embed=normal"`
  - `buildLabolaCalendarSrc(tabName: string): string` → `` `${LABOLA_CALENDAR_BASE}&tab_name=${encodeURIComponent(tabName)}` ``
  - `LABOLA_CALENDAR_TABS = [{ key: "pickleball", tabName: "ピックルボールコート" }, { key: "hyrox", tabName: "H Y R O X" }] as const`

### 2. コンポーネント `src/components/reserve/ReserveCalendar.tsx`（既に `"use client"`）

- `useState` でアクティブタブの key を保持（初期 `"pickleball"`）。
- 見出し直下に `role="tablist"`（`aria-label` は i18n）。各タブは `<button role="tab">` で `aria-selected` / `aria-controls` を付与。
- ロービングタブインデックス + キーボード操作（ArrowLeft / ArrowRight / Home / End でタブ移動、移動先を選択状態にしフォーカス）。
- `role="tabpanel"` 内に iframe。`src = buildLabolaCalendarSrc(activeTab.tabName)`。
- iframe の `title` はアクティブタブ名入り（例: 「ピックルボールコート 予約カレンダー」）。
- セキュリティ属性は現状維持（`loading="lazy"` / `referrerPolicy="strict-origin-when-cross-origin"` / `sandbox="allow-scripts allow-forms allow-same-origin allow-popups"`）。
- 既存のスクロール案内バーは維持。

### 3. 文言 i18n（`messages/ja.json` / `messages/en.json` の `Reserve.calendar`）

追加キー:
- `tabs.pickleball`: "ピックルボールコート"
- `tabs.hyrox`: "H Y R O X"
- `tablistLabel`: 例 "予約カテゴリ" / "Reservation category"（`tablist` の `aria-label`）
- `iframeTitleSuffix` または `iframeTitle` の組み立て方針を定義（タブ名 + 予約カレンダー）。

### 4. デザイン

- ダーク背景 + アクセント `#C8FF00`。アクティブタブを下線または塗りで強調、非アクティブは `text-gray`。
- `prefers-reduced-motion` を尊重（トランジションは `motion-safe`）。
- タップ領域・コントラストは WCAG AA を満たす。

## データフロー

```
ユーザーがタブをクリック / 矢印キー操作
  → activeTab(state) 更新
  → buildLabolaCalendarSrc(tabName) で iframe src 再計算
  → iframe が該当 tab_name のカレンダーを再読込・表示
```

## エラー / フォールバック

- `tab_name` が labola に存在しない場合の挙動は labola 依存（実装中に実 URL で確認）。本実装ではカテゴリ名を定数で固定し、タイプミスを防ぐ。
- iframe 読込失敗時は labola 側の表示に委ねる（従来同様）。

## テスト戦略（TDD・カバレッジ 100% 維持）

`src/components/reserve/ReserveCalendar.test.tsx` を更新:
- 既存の「単一 iframe・`tab_name=すべて`」検証を廃止。
- 追加:
  - 初期表示で iframe src が `tab_name=` ピックルボールコート（エンコード済み）になっている。
  - HYROX タブをクリックすると src が `tab_name=H%20Y%20R%20O%20X` に変わる。
  - `aria-selected` がクリックで切り替わる。
  - 矢印キー（ArrowRight / ArrowLeft / Home / End）でアクティブタブが移動する。
  - `tablist` / `tab` / `tabpanel` のロールが存在する。
- 定数 `buildLabolaCalendarSrc` の単体テスト（ピックル / HYROX のエンコード結果）。

## 実装中の検証

- `https://yoyaku.labola.jp/r/shop/3473/calendar/?embed=normal&tab_name=H%20Y%20R%20O%20X` と `...&tab_name=ピックルボールコート` を実ブラウザで開き、各カテゴリのみ表示されることを確認（ユーザー側でも確認推奨）。

## 追補（2026-06-21）: 流入元に応じた初期タブ（クエリパラメータ）

`/reserve?tab=pickleball` / `?tab=hyrox` で初期タブを指定する。

- `reserveHref(tab)`（`/reserve?tab=...`）と `resolveCalendarTabKey(value)`（検証＋ピックルへフォールバック）を `site.ts` に追加。
- `/reserve` ページ（サーバー）が `searchParams.tab` を読み、`ReserveCalendar` に `initialTab` として渡す（`/reserve` は静的→動的レンダリングに変わる）。`ReserveCalendar` は `initialTab` prop を受け取り初期 `useState` に反映。
- 導線のタブ割り当て:
  - `/hyrox` 内 CTA（HyroxHero / HyroxServices）→ `?tab=hyrox`
  - ホーム CTA（HomeHero / HomeServices / PromoBanner）→ `?tab=pickleball`（明示）
  - 共有ナビ（HomeNavigation の PC/モバイル RESERVE、MobileMenu）→ **ページ連動**: `usePathname()===/hyrox` なら hyrox、それ以外は pickleball。HomeNavigation が `reserveHref` を MobileMenu に prop で渡す。
- PromoBanner は `/hyrox` では非表示（`{!isHyrox && <PromoBanner />}`）のため、常に pickleball で整合。
- next-intl Link はロケールプレフィックス付与とクエリ保持を両立（`/en/reserve?tab=hyrox` を確認済み）。

## スコープ外（YAGNI）

- 「すべて」タブの併設。
- 英語ラベルのローカライズ差し替え（i18n 経由で後から容易に対応可能なため、当面は共通文言）。
