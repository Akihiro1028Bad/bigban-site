# 施設経営データ基盤 P3b(タグ面のコード実装) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P3a で設置済みの GA4×LaBOLA タグ(8イベント)をデータ基盤へ取り込み、①週次スナップショットに予約ファネルと捕捉率を追加、②D11 でタグ破損を自動検知、③経営ボードにファネル表示を解禁、④metrics-cli に記事別予約完了(GA4帰属)を追加、⑤labola URL の混入をページ系レポートからフィルタする。

**Architecture:** GA4 取得は ingest(自宅PC)に注入する(`fetchFunnel` deps。PC の `.env` に GROWTH_GOOGLE_* 既存)。ボードは従来どおり Blob スナップショット読み取り専用のまま(UI から GA4 を叩かない)。記事別予約完了は metrics-cli(既存の GA4 取得経路)に追加し、keyEvents と同じ後方互換パターン(optional フィールド)で流す。

**Tech Stack:** 既存スタックのみ(新規依存なし)。

**設計書:** `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md` §10(P3a確定事項含む)・§7 D11・§8 ファネル
**P3a実地確認結果(2026-07-18):** script可 / プログラム系タグ欄あり(イベント名 `_program` サフィックスで分離) / ドメイン `yoyaku.labola.jp` / 8イベント着弾確認済み / `labola_reserve_pending` は即時確定フローでは発生しない(0が正常)

## Global Constraints

- TypeScript strict・any禁止・`import type`・日本語エラーメッセージ・Conventional Commits(日本語)
- 新規純ロジックはカバレッジ100%(CI閾値)。CLI(ingest-cli.ts / metrics-cli.ts)はカバレッジ除外対象のため結線のみ・分岐はアプリ層/純ロジックへ
- 欠落耐性: GA4 取得失敗・env未設定でも ingest は成功する(funnel なしスナップショット+警告ログ)。失敗を沈黙させない(warnings への記録+ログ)
- スナップショットの中身を UI 側で再計算しない(表示整形は analyticsView 純ロジック)
- 実行ブランチ: `feature/labola-data-platform-p3`(統合ブランチ `feature/labola-data-platform` から分岐)。PRは P3b-a / P3b-b の2本
- 体制: 実装=codex(gpt-5.6-terra, medium)/ レビュー=codex(gpt-5.6-sol, xhigh・別コンテキスト)。ゲート実行とコミットはオーケストレーター(codex sandboxはコミット不可)
- ゲート: `npm run test:coverage`(全体100%)+`npx tsc --noEmit`+`npm run lint`

## イベント名の正典(P3aで確定・変更禁止)

| 段階 | レンタル | プログラム |
|---|---|---|
| 情報入力 | `labola_step_input` | `labola_step_input_program` |
| 内容確認 | `labola_step_confirm` | `labola_step_confirm_program` |
| 仮予約 | `labola_reserve_pending` | `labola_reserve_pending_program` |
| 予約完了 | `labola_reserve_complete` | `labola_reserve_complete_program` |

---

## P3b-a: データ面(ファネル取得・捕捉率・D11)

### Task 1: labolaFunnel 純ロジック

**Files:**
- Create: `scripts/growth/labolaFunnel.ts` + `labolaFunnel.test.ts`
- Create: `src/lib/growth/labolaFunnel.ts`(`export * from "../../../scripts/growth/labolaFunnel";`)

**Interfaces:**
- `export const LABOLA_FUNNEL_EVENTS`: 上表8イベント名の定数(as const)。ステージ×フロー→イベント名の写像を単一ソース化
- `export const LABOLA_FUNNEL_REPORT: Ga4ReportDef = { key: "labolaFunnel", dimensions: ["eventName"], metrics: ["eventCount"], dimensionFilter: { fieldName: "eventName", values: <8イベント + "reservation_click" + "reserve_entry_click"> }, limit: 100, includePriorOnly: true }`(`keyEvents` 指標ではなく `eventCount` を使う=GA4管理画面のキーイベント設定に依存しない。意図クリック2種は設計書§8のファネル先頭段「予約クリック」用)
- `export interface FunnelStageCounts { input: number; confirm: number; pending: number; complete: number }`
- `export interface FunnelCounts { intent: number; rental: FunnelStageCounts; program: FunnelStageCounts }`(intent = reservation_click + reserve_entry_click の合算。フロー別に分けられないため FunnelCounts 直下)
- `export function funnelFromRows(rows: MergedRow[]): { current: FunnelCounts; prior: FunnelCounts }`(keys[0]=eventName、metrics["eventCount"].current/.prior を写像。未知イベント名は無視。行欠落は0)

**Steps:** TDD(8イベント写像・未知名無視・空配列で全0)→実装→ゲート→コミット `feat(growth): labolaファネルのGA4レポート定義と集計純ロジックを追加`

### Task 2: スナップショットへの funnel 追加と捕捉率

**Files:**
- Modify: `scripts/growth/snapshotSchema.ts`(funnel フィールド追加)
- Modify: `scripts/growth/reservationAggregates.ts` + テスト(`selfBookedInWeek` 追加)
- Modify: `scripts/growth/snapshotBuild.ts` + テスト(funnel 組み込み)

**Interfaces:**
- snapshotSchema に追加(**optional=後方互換**。schemaVersion は 1 のまま):
```ts
funnel: z.object({
  week: z.object({ start: ymdSchema, end: ymdSchema }),
  current: funnelCountsSchema,   // { intent: number, rental: {input,confirm,pending,complete}, program: 同 }
  prior: funnelCountsSchema,
  capture: z.object({
    ga4Complete: z.number(),     // current の rental.complete + program.complete
    selfBooked: z.number(),      // 同週に bookedAt が入る self 予約数(下記)
    rate: z.number().nullable(), // selfBooked=0 のとき null
  }),
}).nullable().optional(),
```
- `selfBookedInWeek(reservations: CanonicalReservation[], week: { start: string; end: string }): number` — `channel` が `user_sp|user_pc` かつ `jstYmdOfIso(bookedAt)` が週範囲内の件数。**status は問わない**(GA4完了は予約時点で発火するため、後日キャンセルされた予約も分母・分子の比較対象として対等)
- `buildSnapshot` の input に `funnelCounts: { current: FunnelCounts; prior: FunnelCounts } | null` を追加。null なら `snapshot.funnel` は書かない(undefined)。非null なら capture を computeWeeklyPeriods の current 週で計算して格納

**Steps:** TDD(funnel あり/なし・rate null・cancelled込みの分母)→実装→ゲート→コミット `feat(growth): スナップショットに予約ファネルと捕捉率を追加`

### Task 3: D11 拡張(タグ破損の自動検知)

**Files:**
- Modify: `scripts/growth/insightDetectors/dataHealth.ts` + `dataHealth.test.ts`
- Modify: `scripts/growth/insightEngine.ts`(DetectorContext に `funnel` を追加)+ 既存テスト調整
- Modify: `scripts/growth/snapshotBuild.ts`(runDetectors へ funnel を受け渡し)

**Interfaces:**
- `DetectorContext` に `funnel: Snapshot["funnel"] | null` を追加(未取得は null)
- dataHealth に2ルール追加(いずれも label「観察」・evidence に n/rate/previousRate):
  1. `d11:capture:zero` — `funnel` あり・`capture.selfBooked >= 5`・`capture.ga4Complete === 0` → severity **alert**「タグ破損の疑い: セルフ予約があるのにGA4完了が0件」
  2. `d11:capture:drop` — 前回スナップショット `previousSnapshot.funnel?.capture.rate` が 0.5 以上・今回 `rate` が非null で前回の半分未満・`selfBooked >= 5` → severity **alert**「捕捉率が急落」
  - n<5 は誤検知源のため発火しない(n ガード)。funnel が null のときは何も追加しない(欠落耐性)

**Steps:** TDD(発火2種・nガード・funnel null・前回funnelなし)→実装→ゲート→コミット `feat(growth): D11にGA4捕捉率のタグ破損検知を追加`

### Task 4: ingest への結線

**Files:**
- Modify: `scripts/growth/ingestApplication.ts` + `ingestApplication.test.ts`
- Modify: `scripts/growth/ingest-cli.ts`(結線のみ・カバレッジ除外)

**Interfaces:**
- `IngestApplicationDeps` に追加: `fetchFunnel?: (current: DateRange, prior: DateRange) => Promise<{ current: FunnelCounts; prior: FunnelCounts } | null>`
- runIngestApplication: `computeWeeklyPeriods` の後・`buildSnapshot` の前に、`fetchFunnel` があれば呼ぶ。**throw しても ingest は継続**(funnelCounts=null・`log("[ingest] GA4ファネル取得に失敗しました(スナップショットはファネルなしで継続)")`・snapshot.meta.warnings に「GA4ファネル取得失敗」を追加)。deps 未指定は静かに null
- ingest-cli: `GROWTH_GA4_PROPERTY_ID`・`GROWTH_GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`・`GROWTH_GSC_SITE_URL` が揃うときだけ `loadGrowthConfig` → `getAccessToken` → `fetchGa4({ reports: [LABOLA_FUNNEL_REPORT], ... })` → `funnelFromRows` を deps.fetchFunnel に結線。未設定はログ1行でスキップ(P2アップロード未設定時と同じ流儀)
- DRYRUN でも fetchFunnel は呼んでよい(読み取りのみ)

**Steps:** TDD(fetchFunnel成功/失敗継続/未指定)→実装→全ゲート→コミット `feat(growth): 取り込み時にGA4ファネルを取得してスナップショットへ同梱` → **PR #P3b-a**: `feature/labola-data-platform-p3` → 統合ブランチ

---

## P3b-b: 表示・記事帰属・フィルタ

### Task 5: ボードのファネル表示解禁

**Files:**
- Modify: `scripts/growth/analyticsView.ts` + `analyticsView.test.ts`(`funnelView` 追加)
- Create: `src/app/growth/analytics/components/FunnelPanel.tsx` + `FunnelPanel.test.tsx`
- Modify: `src/app/growth/analytics/AnalyticsClient.tsx`(気づきフィードの後・ヒートマップの前に配置)

**Interfaces:**
- `funnelView(snapshot: Snapshot): { week: string; stages: { label: string; rental: number; program: number; total: number }[]; capture: { text: string; isAlert: boolean }; note: string } | null`
  - `snapshot.funnel` 欠落は null(パネル側は「収集中(P3タグ設置後の取り込み待ち)」表示)
  - stages は 予約クリック(intent。rental/program 内訳なし)→入力→確認→(仮予約: total>0 の週のみ含める)→完了 の順。週表示は既存 `shortWeekOf` を再利用
  - capture.text 例: `捕捉率 86%(GA4完了6件 ÷ セルフ予約7件)`。rate null は「セルフ予約0件のため算出不可」。0.5未満は isAlert=true
  - note: 「実予約の真値はKPIヘッダー(CSV由来)。GA4は参考値(捕捉率つき)」の一文を機械付与
- FunnelPanel: 横バー(自前SVGまたはdiv幅%)で段間の残存率を表示。レンタル/プログラムの内訳は各段の下に小さく併記。モバイル縦1カラム・`overflow-x` 不要な設計
- 実予約(真値)段はファネルに混ぜない(GA4系列とCSV系列の混同を避ける)。代わりに capture 行で対比する

**Steps:** TDD(funnelなしnull・pending 0週の段省略・isAlert)→実装→UI テスト(`getByRole`)→ゲート→コミット `feat(growth): 経営ボードに予約ファネルと捕捉率を追加`

### Task 6: metrics-cli 記事別予約完了(GA4帰属)

**Files:**
- Modify: `scripts/growth/metrics-cli.ts`(レポート定義追加+結線)
- Modify: `scripts/growth/metrics.ts` + `metrics.test.ts`(スキーマ+集計)
- Modify: `scripts/growth/trend.ts` + テスト(系列キー追加)

**Interfaces:**
- 新レポート(metrics-cli 内・TOP_PAGE_CTA_EVENTS_REPORT の直後に定義):
```ts
const ARTICLE_RESERVE_COMPLETE_REPORT: Ga4ReportDef = {
  key: "articleReserveComplete",
  dimensions: ["landingPage", "eventName"],
  metrics: ["eventCount"],
  dimensionFilter: { fieldName: "eventName", values: ["labola_reserve_complete", "labola_reserve_complete_program"] },
  limit: 10_000,
  includePriorOnly: true,
};
```
- metrics.ts: 記事メトリクスに `reserveComplete?: MetricDelta` と `reserveCompleteMeasured?: boolean` を追加。**既存 keyEvents(77-80行・390-392行)と完全に同じ後方互換パターン**(optional・旧データは未計測扱い)。landingPage 値は `?` 以降を除去してから記事 pagePath と突合(既存の pagePath 突合ヘルパーに従う)
- 意図イベント(reservation_click 等)とは**別バケット**のまま。合算・混同しない(設計書§10)
- trend.ts: `"reserveComplete"` を ga4 ソースの系列キーに追加

**Steps:** TDD(landingPage突合・クエリ付きlandingPage正規化・2イベント合算・旧データ後方互換)→実装→ゲート→コミット `feat(growth): 記事別の予約完了(GA4帰属)をmetricsに追加`

### Task 7: labola URL のページ系レポート混入フィルタ

**Files:**
- Modify: `scripts/growth/ga4.ts` + `ga4.test.ts`(`Ga4ReportDef` 拡張)
- Modify: `scripts/growth/metrics-cli.ts`(対象レポートへ適用)

**Interfaces:**
- `Ga4ReportDef` に `excludeHostContains?: string` を追加。buildRequest で指定時は `andGroup` を構成: 既存 `inListFilter`(あれば)+ `notExpression: { filter: { fieldName: "hostName", stringFilter: { matchType: "CONTAINS", value: <値> } } }`
- 適用対象(**ページ次元のレポートのみ**): GA4_REPORTS の `topPages`・`landingPages`、metrics-cli の `TOP_PAGES_REPORT`・`TOP_PAGE_CTA_EVENTS_REPORT`・`ARTICLE_RESERVE_COMPLETE_REPORT` に `excludeHostContains: "labola.jp"`
- summary/byChannel/byDevice には**適用しない**(セッション指標を歪めるため。コメントで理由を明記)

**Steps:** TDD(andGroup構成・filter未指定時のnot単独・従来defの後方互換)→実装→ゲート→コミット `fix(growth): ページ系GA4レポートからlabolaドメインの混入を除外`

### Task 8: docs 更新と仕上げ

**Files:**
- Modify: `docs/operations/growth/60-kpi-tree.md`(「予約完了(GA4・捕捉率付き)」層を予約意図の下に追記。真値=CSV実予約との関係を1行で)
- Modify: `docs/operations/growth/50-publish-metrics.md`(ファネル・捕捉率のデータ経路: ingest→snapshot→ボード / metrics-cli→記事別)
- Modify: `docs/operations/growth/61-ga4-labola-tags.md`(§4を「実地確認済み」の記録に更新)

**Steps:** docs更新→全ゲート+`npm run build`→コミット `docs(growth): ファネル・捕捉率・記事別予約完了の経路を追記` → **PR #P3b-b** → 統合ブランチ

---

## 人間の作業(P3b完了後)

1. 次回の週次エクスポート+`npm run growth:ingest`(PC に GROWTH_GOOGLE_* 設定済みなら自動でファネル同梱)
2. ボード `/growth/analytics` でファネル表示を確認(初回はGA4に完了イベントが溜まってから)
3. (P2から継続)Vercel Blob 設定が未完なら本番ボード反映のため設定

## 未確定事項・注意

1. GA4 Data API の直近データは24〜48時間の遅延があり得る。週明け(月曜以降)の ingest なら前週データは概ね確定
2. `landingPage` ディメンションの値形式(クエリの有無・末尾スラッシュ)は実装時にテストデータで確認し、正規化を突合ヘルパー側に寄せる
3. `labola_reserve_pending` は即時確定フローでは0が正常。ファネル表示は total>0 の週だけ段を出す
