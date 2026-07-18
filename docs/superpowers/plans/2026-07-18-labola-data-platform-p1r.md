# 施設経営データ基盤 P1拡張残り(履歴系検知器・コホート・ペースカーブ・publicFacingPack) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to実装 this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スナップショット履歴を検知器の入力に加え、履歴依存の検知器7種(D4-D9・D13)とコホート・ペースカーブ・publicFacingPack を実装し、過去レビューの持ち越しMEDIUMを解消する。

**Architecture:** ingest が snapshots/ ディレクトリの履歴(直近13件)を読み、DetectorContext に渡す。将来予約の観測点(on-the-books)を各スナップショットの series に保存し、次回以降の同 days-out 比較の原資にする(=履歴が溜まるほど検知器が賢くなる)。表示整形は従来どおり analyticsView 純ロジックに集約。

**Tech Stack:** 既存スタックのみ(新規依存なし)。

**設計書:** `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md` §5.3(B/C)・§7(検出器カタログ)・§9(統計ガードレール)・§11 経路2(publicFacingPack)
**データ前提(確認済み)**: プログラム参加=yoyaku行(space=プログラム名×useDate×start 突合・bookedAtあり)/ SalesSummaryRow.isForecast あり / CanonicalReservation.pseudoId・bookedAt・status(cancelled含む)あり

## Global Constraints

- TypeScript strict・any禁止・`import type`・日本語エラー/コメント・Conventional Commits(日本語)
- カバレッジ100%(CI閾値)。検出器は1検出器1ファイル(`insightDetectors/`)+個別テスト
- スナップショットスキーマは optional 追加のみ(schemaVersion 1 のまま)。旧スナップショット(新フィールドなし)が parse・履歴読み込みの両方で壊れないこと
- §9 ガードレール: 検定を伴わない検知はすべて label「観察」。n が小さい検知は出さない(各検出器の n ガードを明記)。履歴不足時は気づきを出さない(誤検知よりも沈黙が正しい)
- PII境界: pseudoId は先頭8文字までしか evidence に載せない。氏名等は元から存在しない
- 実行ブランチ: `feature/labola-data-platform-p1r`(統合ブランチから分岐)。PRは4本(P1r-a/b/c/d)
- 体制: 実装=codex terra medium / レビュー=codex sol xhigh(別コンテキスト・PRごと)/ ゲート・コミットはオーケストレーター
- ゲート: `npm run test:coverage`(100%)+`npx tsc --noEmit`+`npm run lint`(+PR前に `npm run build`)

---

## P1r-a: 履歴基盤+需要・ペース系検知器(D4/D5/D6)

### Task 1: on-the-books 観測点の保存

**Files:**
- Modify: `scripts/growth/snapshotSchema.ts` / `scripts/growth/reservationAggregates.ts`(+test) / `scripts/growth/snapshotBuild.ts`(+test)

**Interfaces:**
- snapshotSchema の `series` に optional 追加:
```ts
onTheBooks: z.array(z.object({
  daysOut: z.number(),        // 7 | 14 | 21 | 28(referenceYmd からの日数バケット)
  reservations: z.number(),   // referenceYmd+1 〜 referenceYmd+daysOut の確定予約件数
  forecastSales: z.number().nullable(), // 同期間の見込み売上(salesDaily isForecast=true の合計。売上CSV欠落は null)
})).optional(),
```
- `reservationAggregates.ts` に `onTheBooksPoints(bundle, referenceYmd): {daysOut, reservations, forecastSales}[]`(daysOut=7/14/21/28 固定。確定=status confirmed かつ useDate が範囲内)
- snapshotBuild で series に格納

### Task 2: スナップショット履歴リーダーと DetectorContext 拡張

**Files:**
- Modify: `scripts/growth/ingestApplication.ts`(+test) / `scripts/growth/insightEngine.ts` / `scripts/growth/snapshotBuild.ts`

**Interfaces:**
- ingestApplication に `readSnapshotHistory(fs, dataDir, todayYmd): Promise<Snapshot[]>`: snapshots/ の `snapshot-*.json` を新しい順に最大 **13件**(今日の分は除外)読み、parse 失敗はスキップして log 1行(欠落耐性・沈黙させない)。返り値は古い順
- `DetectorContext` に `history: Snapshot[]` を追加(previousSnapshot は互換のため残す=history の末尾と同一になり得る)
- buildSnapshot の input に `history: Snapshot[]` を追加し runDetectors へ渡す。既存呼び出し元・テストは `history: []` で追随

### Task 3: D4 リードタイム変化

**Files:**
- Create: `scripts/growth/insightDetectors/leadTimeShift.ts` + test / Modify: `insightEngine.ts`(CORE_DETECTORS 登録)

**判定(§7 D4: 中央値±MAD・4週窓):**
- 対象: 確定予約の (useDate − bookedAt) 日数。直近4週窓(referenceYmd 基準)と、その前4週窓
- 両窓 n>=8 のときだけ判定。|今窓中央値 − 前窓中央値| > max(2日, 前窓MAD) → notice
- id `d4:leadtime` / title「予約リードタイムの変化」/ body に前倒し/直前化の向き / evidence `{ n, median, baselineMedian, mad }` / label「観察」

### Task 4: D5 満枠到達速度

**Files:**
- Create: `scripts/growth/insightDetectors/fillSpeed.ts` + test / Modify: `insightEngine.ts`

**判定(§7 D5。受付開始時刻はデータに無いため初申込をプロキシにする=制約コメント明記):**
- 各プログラム回(capacity 非null・>0)の参加予約(programFills と同じ突合キー)を bookedAt 昇順に並べ、capacity 件目の bookedAt を満枠時刻とする(未満枠は対象外)
- 指標: 「開催日の何日前に満枠になったか」(daysBeforeHeld)
- 今週満枠に到達した回について: 同名プログラムの過去満枠実績が1回以上あり、daysBeforeHeld が過去最大より大きい → notice「満枠が過去最速」(id `d5:fastest:<name>`)。過去実績なしの初満枠 → info「初の満枠」(id `d5:first:<name>`)
- evidence `{ n: capacity, daysBeforeHeld, previousBest }` / label「観察」

### Task 5: D6 ブッキングペース逸脱

**Files:**
- Create: `scripts/growth/insightDetectors/paceDeviation.ts` + test / Modify: `insightEngine.ts`

**判定(§7 D6: 履歴の同 days-out 比較。履歴6週未満は出さない):**
- context.history のうち `series.onTheBooks` を持つスナップショットが **6件未満なら何も出さない**(collecting)
- daysOut=28 のみ判定(7/14/21 は表示専用): 現在の reservations を履歴同 daysOut の中央値と比較。中央値>=5 のときだけ判定し、<50% → notice「今後28日のペースが弱い」(id `d6:weak`)、>150% → notice「強い」(id `d6:strong`)
- evidence `{ n: current, baselineMedian, historyWeeks }` / label「観察」

**Steps(Task 3-5 共通):** TDD→実装→ゲート→タスク単位コミット → **PR #P1r-a**

---

## P1r-b: 顧客・お金系検知器(D7/D8/D9/D13)+コホート

### Task 6: D7 ライフサイクル事象

**Files:**
- Create: `scripts/growth/insightDetectors/lifecycleEvents.ts` + test / Modify: `insightEngine.ts`

**判定(§7 D7: 事象検知):**
- pseudoId ごとの確定予約を bookedAt 順に整列
- 「2回目の予約」の bookedAt が今週(current 週)に入る顧客 → リピート発生。**施設全体で初のリピートのみ** alertでなく notice(id `d7:first-repeat`)、以降の個別リピートは件数まとめて info(id `d7:repeats:<週>`、evidence に n)
- customerType が過去予約で「ビジター」→今週予約で「会員」系に変わった顧客数>0 → info(id `d7:conversion:<週>`)
- evidence に pseudoId は**載せない**(件数のみ)/ label「観察」

### Task 7: D8 休眠リスク

**Files:**
- Create: `scripts/growth/insightDetectors/dormantRisk.ts` + test / Modify: `insightEngine.ts`

**判定(§7 D8):**
- 確定予約3回以上の pseudoId について、利用間隔(useDate 差)の個人中央値を計算
- referenceYmd − 最終 useDate > max(個人中央値×2, 14日) → 休眠リスク。該当者をまとめて1件の info(id `d8:dormant:<referenceYmd>`)
- evidence: `{ n: 該当人数, members: [{ id: pseudoId先頭8, lastUse, medianGap }] }`(最大5人)/ label「観察」

### Task 8: D9 パイプライン毀損

**Files:**
- Create: `scripts/growth/insightDetectors/pipelineErosion.ts` + test / Modify: `insightEngine.ts`

**判定(§7 D9: スナップショット差分):**
- previousSnapshot の `kpi.sales.forecast28` と今回を比較。両方非null・前回>0・**referenceYmd の差が7日以内**(窓ズレ防止)のときだけ判定
- 今回 < 前回×0.7 → notice「見込み売上の毀損」(id `d9:erosion`)/ evidence `{ current, previous, dropPct }` / label「観察」

### Task 9: D13 キャンセル再販+コホート集計

**Files:**
- Create: `scripts/growth/insightDetectors/cancelResale.ts` + test / Modify: `insightEngine.ts`
- Modify: `scripts/growth/reservationAggregates.ts`(+test) / `scripts/growth/snapshotSchema.ts` / `scripts/growth/snapshotBuild.ts`

**D13 判定(§7: 枠キー突合):**
- 枠キー = useDate×start×space。cancelled 行それぞれについて、同キーの confirmed 行で bookedAt > キャンセル行の bookedAt のものがあれば「再販成立」
- catalog に optional `cancelResale: { n: number; resold: number; rate: number | null; medianHours: number | null }`(過去4週にキャンセルされ useDate を迎えた枠のみ対象。n=0 は rate null)
- 気づき: 今週 useDate を迎えた再販成立が1件以上 → info(id `d13:resold:<週>`、evidence { n, medianHours })/ label「観察」

**コホート集計:**
- catalog に optional `cohorts: z.array(z.object({ month: z.string(), customers: z.number(), repeated: z.number(), cumulativeRevenue: z.number() })).optional()`
- pseudoId ごとの初回 useDate の月でグループ化。repeated=2回以上利用した人数。cumulativeRevenue=そのコホートの確定予約 amount 合計
- pseudoId null(突合不能)の予約はコホート対象外(コメント明記)

**Steps:** TDD→実装→ゲート→コミット → **PR #P1r-b**

---

## P1r-c: ボード表示(ペースカーブ・コホート)+publicFacingPack

### Task 10: ペースカーブとコホートの表示

**Files:**
- Modify: `scripts/growth/analyticsView.ts`(+test)
- Create: `src/app/growth/analytics/components/PaceCurvePanel.tsx` + test / `CohortPanel.tsx` + test
- Modify: `src/app/growth/analytics/AnalyticsClient.tsx`(お金パネルの後に配置)+ collectingSections から「ペースカーブはP4で解禁」を削除

**Interfaces:**
- **注意 — ボードは Blob スナップショット読み取り専用で履歴を持たない**。そのため snapshot 生成時に比較値を焼き込む: snapshotSchema の series.onTheBooks 各点に optional `baselineMedian: z.number().nullable()`(ingest 時に history から計算した同 daysOut 中央値。履歴6週未満は null)を追加し、`paceCurveView(snapshot): { points: { daysOut, current, baseline: number | null }[]; state: "ready" | "collecting" } | null` は snapshot 単体から整形する(Task 1/2 実装時にこの焼き込みまで含めてもよい。その場合は本タスクで参照のみ)
- `cohortView(snapshot): { month: string; customers: number; repeatRate: string; revenue: string }[] | null`(cohorts 欠落は null → 収集中表示)
- PaceCurvePanel: daysOut 7/14/21/28 の横並び。current と baseline を並記、baseline null は「基準収集中(あと◯週)」。バーは div 幅%(FunnelPanel と同流儀)
- CohortPanel: 月別の小さいテーブル(`overflow-x: auto`)

### Task 11: publicFacingPack(§11 経路2 の土台)

**Files:**
- Create: `scripts/growth/publicFacingPack.ts` + test / `src/lib/growth/publicFacingPack.ts`(再エクスポート)

**Interfaces:**
```ts
export interface PublicFacingPack {
  weekly: { actualReservations: number; selfRatePct: number | null };
  topWards: { ward: string; customers: number }[];          // k=3未満のセグメントを抑制
  personaTop: { label: string; count: number }[];           // 年代×性別。k=3未満抑制
  programFills: { name: string; heldOn: string; fillRate: number | null }[];
  leadTimeMedianDays: number | null;
  newInsights: { title: string; body: string; label: string; evidenceNote: string }[]; // 公開適格のみ
}
export function buildPublicFacingPack(snapshot: Snapshot): PublicFacingPack
```
- **k=3 抑制**: topWards / personaTop は count>=3 のみ。programFills はそのまま(個人情報でない)
- newInsights の公開適格: evidence に pseudoId/members を含む検出器(D8)を**除外**。d12(備考)も除外。evidenceNote は「n=◯・観察」形式の機械生成文字列
- 消費者(週次レポート・ネタ提案プロンプト)への結線は P5 スコープ(本タスクは純ロジックのみ)

**Steps:** TDD→実装→ゲート→コミット → **PR #P1r-c**

---

## P1r-d: 持ち越しMEDIUM解消

### Task 12: 集計・鮮度の持ち越し

**Files:** R6-02=`scripts/growth/reservationAggregates.ts`+`snapshotBuild.ts` / R6-03=`scripts/growth/snapshotBuild.ts`(warnings生成) / P1exライト残=`scripts/growth/reservationAggregates.ts`・`analyticsView.ts`・`insightDetectors/unpaidOverdue.ts`(いずれも+test)
- **R6-02**: 集計窓(4週集計等)が coverage.start より前に食い込む場合、n を偽らないよう窓を coverage 内に切り詰め、切り詰めが起きたら該当KPIの注記(「収録範囲による部分集計」)を出す
- **R6-03**: 売上CSVの鮮度を yoyaku とは別に判定(salesDaily の最新日付が referenceYmd より7日以上古ければ snapshot.meta.warnings に記録)
- **P1exライト残**: 定員0のプログラムの fillRate 表示(現在 null → ボードで「—」表示は済んでいるか確認し、fillRate null と定員0 の区別が必要なら整理)/ D10 の label が「観察」固定である妥当性をコメントで明文化

### Task 13: metrics/表示の持ち越し

**Files:** R6-04=`scripts/growth/metrics.ts`(+metrics-cli結線) / 根拠チップ=`src/app/growth/analytics/components/InsightFeed.tsx`+`scripts/growth/analyticsView.ts` / 再シリアライズ=`src/app/api/growth/analytics/snapshot/route.ts`(いずれも+test)

- **R6-04**: metrics のローダー(canonical 読み取り)の I/O を注入可能にしてテスト容易性を上げる(既存の deps 注入流儀に合わせる)
- **P2残**: 気づきカードの根拠チップ表示制限(evidence が長大な場合に上位のみ表示)/ Blob 保存前の再シリアライズ(受け口 route が検証済みオブジェクトを再 JSON.stringify して保存し、クライアント由来の余分なキーを落とす)

**Steps:** 各項目TDD→実装→ゲート→コミット → **PR #P1r-d**

---

## 人間の作業(P1r完了後)

1. 週次エクスポート+ingest を**継続する**(D6/ペースカーブは履歴6週で本稼働。それまで「基準収集中」表示が正常)
2. ボードでペースカーブ・コホートの表示確認

## 未確定事項・注意

1. D5 の「受付開始」はデータに無いため初申込プロキシ。将来 LaBOLA が受付開始日時をエクスポートに含めたら差し替える
2. D9 は forecast28 の窓が前回スナップショットと数日ズレる近似比較(referenceYmd 差7日以内ガードで許容)
3. コホートの cumulativeRevenue は amount 合計であり売上サマリとは一致しない(予約単位とサマリ単位の違い)。ボード表示に注記
