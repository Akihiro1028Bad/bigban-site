# 施設経営データ基盤 P2(経営ボード) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自宅PCの取り込み結果(PII除去済みスナップショット)をVercel Blobへアップロードし、承認画面と同じ認証の内側に経営ボード `/growth/analytics` を新設してスマホから閲覧できるようにする。

**Architecture:** PC(ingest-cli)→ `POST /api/growth/analytics/snapshot`(マシントークン認証)→ Vercel Blob(非公開)。UIはクライアントページが `GET /api/growth/analytics/snapshot`(セッション認証=承認画面と同じ)経由で最新スナップショットを取得して描画。**UIは読み取り専用**(GA4/microCMS/Notionを叩かない)。

**Tech Stack:** 既存スタック + `@vercel/blob`(新規依存・これ1つのみ)。チャートは自前SVG(ライブラリ追加なし)。

**設計書:** `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md` §8
**UIモックアップ(見た目の正)**: https://claude.ai/code/artifact/046072c6-0142-4f33-a959-56e21644bedf (ダーク・アクセント#C8FF00・severity色分け・「収集中」表示・鮮度バナー)

**本計画の範囲(P2):** P2a=受け口API+Blob保存+ingestアップロード / P2b=経営ボードUI(KPIヘッダー・気づきフィード・需要ヒートマップ・商圏・お金・鮮度バナー・収集中表示)。
**範囲外:** ファネル(P3)・ペースカーブ/コホート(P4)・履歴セレクタ(P4)・publicFacingPack(P1拡張)。

## Global Constraints

- TypeScript strict・any禁止・`import type`・日本語エラーメッセージ・Conventional Commits(日本語)
- 新規純ロジック・コンポーネントはカバレッジ100%(CI閾値)。API routeはRTL不要だが route.test.ts で認証・正常・異常系を検証(既存 `src/app/api/growth/ops/route.test.ts` の書式に従う)
- UI規約: Server Component既定・クライアント境界は葉に・`getByRole`/`getByLabelText` 優先・axe対応(セマンティックHTML)・`prefers-reduced-motion` 尊重
- スナップショットの中身をUI側で再計算しない(表示のみ)。PIIは元から存在しないが、UIからGA4/microCMS/Notionへのアクセスは禁止
- 認証: GET(閲覧)は既存 `verifyToken`(セッション)。POST(PC受け口)は新設マシントークン(下記)。**セッションとマシントークンを混用しない**
- 環境変数追加: `GROWTH_ANALYTICS_INGEST_TOKEN`(Vercel側・受け口用。32文字以上を検証)/ `BLOB_READ_WRITE_TOKEN`(Vercel Blob標準)/ PC側 `GROWTH_ANALYTICS_UPLOAD_URL`・`GROWTH_ANALYTICS_INGEST_TOKEN`(未設定ならアップロードをスキップして警告のみ=P1互換)
- 実行ブランチ: `feature/labola-data-platform-p2`(**統合ブランチ `feature/labola-data-platform` から分岐**)。PRは P2a / P2b の2本
- ゲート: `npm run test:coverage`(全体100%)+`npx tsc --noEmit`+`npm run lint`

---

## P2a: スナップショット受け口とアップロード

### Task 1: 依存追加と再エクスポート

**Files:**
- Modify: `package.json`(`@vercel/blob` を dependencies に追加。`npm install @vercel/blob` 実行)
- Create: `src/lib/growth/snapshotSchema.ts`(`export * from "../../../scripts/growth/snapshotSchema";`)
- Create: `src/lib/growth/reservationDigest.ts`(同形式。鮮度判定等をUIで再利用する場合に備える)

**Steps:** 依存インストール→再エクスポート作成→`npx tsc --noEmit`→コミット `chore(growth): @vercel/blob導入とスナップショットスキーマ再エクスポート`

### Task 2: マシントークン認証(純ロジック)

**Files:**
- Create: `src/lib/growth/machineAuth.ts` + `machineAuth.test.ts`

**Interfaces:**
- `verifyMachineToken(request: Request, expectedToken: string | undefined): { ok: true } | { ok: false; status: 401 | 503; error: string }`
  - `expectedToken` 未設定/trim後32文字未満 → 503「サーバー側のトークンが未設定です」(受け口を無効化=安全側)
  - `Authorization: Bearer <token>` を既存 `safeEqual`(`@/lib/growth/apiAuth`)で定数時間比較。不一致/欠落 → 401
  - セッションCookie・`?token=` は**受理しない**(マシン専用)

**Steps:** TDD(5ケース: 成功/欠落/不一致/env未設定/短いenv)→実装→コミット `feat(growth): 経営ボード受け口のマシントークン認証を追加`

### Task 3: 受け口API `POST /api/growth/analytics/snapshot`

**Files:**
- Create: `src/app/api/growth/analytics/snapshot/route.ts` + `route.test.ts`
- Create: `src/lib/growth/analyticsBlob.ts` + `analyticsBlob.test.ts`(Blob I/Oの薄いラッパ+パス規約の純ロジック)

**Interfaces:**
- `analyticsBlob.ts`:
  - `SNAPSHOT_LATEST_PATH = "growth-analytics/snapshot-latest.json"`
  - `snapshotDatedPath(ymd: string): string`(`growth-analytics/snapshot-<ymd>.json`。ymdは実在日検証、不正はthrow)
  - `putSnapshot(json: string, ymd: string, put: BlobPutFn): Promise<void>`(latest と dated の2箇所へ `access: "public"` **ではなく** `access` は @vercel/blob の非公開が使えるなら非公開、使えない場合はURL秘匿+ランダムsuffix既定に任せ、**取得はサーバー経由のみ**とする。`addRandomSuffix: false`, `contentType: "application/json"`)
  - `getLatestSnapshot(fetchFn, listFn...)` は Task 6(GET側)で定義
- `route.ts`: `verifyMachineToken` → ボディを `snapshotSchema.parse` で検証(不正400・日本語エラー)→ 5MB上限 → `putSnapshot`。成功 `{success:true}`。レート制限は既存 `authRateLimit` 系があれば適用、なければ省略(コメントで明記)
- route.test.ts: 認証403/401系・スキーマ不正400・正常202/200(Blob putはvi.mock)

**Steps:** TDD→実装→コミット `feat(growth): スナップショット受け口API(Blob保存)を追加`

### Task 4: ingest-cli にアップロード工程を追加

**Files:**
- Modify: `scripts/growth/ingestApplication.ts` + `ingestApplication.test.ts`
- Modify: `scripts/growth/ingest-cli.ts`(env読取と結線のみ)

**Interfaces:**
- `IngestApplicationDeps` に `uploadSnapshot?: (json: string) => Promise<void>` を追加(任意)
- 本処理フロー: promote・LINE送信の**後**に、`uploadSnapshot` があれば実行。**失敗しても exit 0**(ローカル取り込みは成功)— `log("[ingest] ボードへのアップロードに失敗しました(ローカル処理は完了)")` を出し、次回スナップショットは latest を上書きするため自然回復
- CLI側: `GROWTH_ANALYTICS_UPLOAD_URL` と `GROWTH_ANALYTICS_INGEST_TOKEN` が両方あるときだけ `fetch(url, { method:"POST", headers:{ Authorization:\`Bearer ...\`, "content-type":"application/json" }, body })` を结線。未設定はログ1行でスキップ
- テスト: アップロード成功/失敗しても完了/未設定スキップ

**Steps:** TDD→実装→全ゲート→コミット `feat(growth): 取り込み完了後にスナップショットを経営ボードへアップロード`

### Task 5: P2a 仕上げ(.env.example・docs・PR)

**Files:**
- Modify: `.env.example`(新env 4つ+Blob設定手順コメント)
- Modify: `docs/operations/growth/50-publish-metrics.md`(経営ボードの節を追加: データ経路とenv)

**Steps:** docs更新→全ゲート→コミット `docs(growth): 経営ボードのデータ経路とenvを追記` → **PR #P2a**: `feature/labola-data-platform-p2` → 統合ブランチ(タイトル `feat(growth): 経営ボード受け口とスナップショットアップロード(P2a)`)

---

## P2b: 経営ボードUI

### Task 6: 取得API `GET /api/growth/analytics/snapshot`

**Files:**
- Modify: `src/app/api/growth/analytics/snapshot/route.ts` + `route.test.ts`(GETハンドラ追加)
- Modify: `src/lib/growth/analyticsBlob.ts`(`getLatestSnapshot`)

**Interfaces:**
- GET: `verifyToken(request)`(セッション=承認画面と同じ)→ Blobの latest を取得 → `snapshotSchema.parse` で検証 → `{ success: true, snapshot }`。Blob未存在は `{ success: true, snapshot: null }`(初回=まだ取り込みがない状態を正常系として扱う)。Blob読取失敗は500日本語エラー
- キャッシュ: `export const dynamic = "force-dynamic"`(常に最新)

### Task 7: ボード純ロジック(表示整形)

**Files:**
- Create: `scripts/growth/analyticsView.ts` + `analyticsView.test.ts`
- Create: `src/lib/growth/analyticsView.ts`(再エクスポート)

**Interfaces:**(スナップショット→表示用データの変換。コンポーネントに計算を持ち込まない)
- `freshnessOf(snapshot, todayYmd): { level: "fresh" | "stale"; daysOld: number; sourceSyncedYmd: string }`(sourceSyncedAt基準・7日超でstale)
- `kpiCards(snapshot): { label: string; value: string; sub: string }[]`(実予約 対象週/累積・セルフ比率・売上・n<10注記の機械付与)
- `sortedInsights(snapshot): Insight[]`(alert→notice→info、新しい順)
- `heatmapCells(snapshot): { dow: number; slot: string; count: number; intensity: 0|1|2|3|4 }[]`(countの分位で強度化)
- `collectingSections(snapshot): string[]`(missingSections等から「収集中」表示対象を導出)

### Task 8: ボードUIコンポーネント

**Files:**
- Create: `src/app/growth/analytics/page.tsx`(server薄皮: metadata `経営ボード` + Client)
- Create: `src/app/growth/analytics/AnalyticsClient.tsx`(fetch+状態管理。承認画面の `authHeaders`/fetch規約に従う)
- Create: `src/app/growth/analytics/components/FreshnessBanner.tsx` / `KpiHeader.tsx` / `InsightFeed.tsx` / `DemandHeatmap.tsx` / `WardList.tsx` / `MoneyPanel.tsx` / `CollectingSection.tsx`(各 + `.test.tsx`)
- Create: `src/app/growth/analytics/analytics.css`(モックアップのトークン: bg #0A0A0A / accent #C8FF00 / severity色。approveThemeと整合)

**要点:**
- モックアップのレイアウト順: 鮮度バナー(staleのみ)→KPIヘッダー→気づきフィード→ヒートマップ→商圏→お金→(ファネル/ペースカーブ枠は「P3/P4で解禁」プレースホルダー)
- `snapshot: null`(初回)は「まだ取り込みがありません。自宅PCで npm run growth:ingest を実行してください」の空状態
- 気づきカード: severityバッジ・「有意/観察」ラベル・根拠チップ(n=/CI)。alertは先頭固定
- モバイル第一(縦1カラム、テーブルは `overflow-x: auto`)
- テスト: 各コンポーネントのレンダリング+空状態+stale時バナー+axeが通るセマンティクス(`getByRole`)

### Task 9: P2b 仕上げ

- 全ゲート(カバレッジ100%・tsc・lint)+ `npm run build` 成功確認
- 承認画面からの導線: `ApproveClient` のヘッダー等に `/growth/analytics` へのリンクを1つ追加(最小限・既存UIを壊さない)
- コミット分割: `feat(growth): 経営ボードUI(/growth/analytics)を追加` 等
- **PR #P2b** → 統合ブランチ

---

## 人間の作業(P2完了後)

1. Vercelダッシュボード → Storage → **Blobストア作成**(無料枠)→ `BLOB_READ_WRITE_TOKEN` が環境変数に自動追加されることを確認
2. Vercel環境変数に `GROWTH_ANALYTICS_INGEST_TOKEN`(`openssl rand -hex 32` で生成)を追加 → 再デプロイ
3. 自宅PCの `.env` に `GROWTH_ANALYTICS_UPLOAD_URL=https://<本番ドメイン>/api/growth/analytics/snapshot` と同じ `GROWTH_ANALYTICS_INGEST_TOKEN` を追加
4. `npm run growth:ingest` を実行し、承認画面と同じログイン後 `/growth/analytics` で表示確認

## 未確定事項

1. @vercel/blob の非公開アクセス指定方法(`access` オプションの最新仕様)は実装時に公式docs(context7)で確認。非公開が使えない場合もURL直アクセスは推測困難なランダムURLであり、取得は必ずサーバーAPI経由とする
2. レート制限ヘルパーの適用可否(既存 `authRateLimit` がAPI route向けに使えるか実装時確認)
