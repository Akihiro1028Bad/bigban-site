# 施設経営データ基盤 P1拡張ライト 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans を使用してタスク単位で実装する。手順は checkbox(`- [ ]`)で管理。

**Goal:** 蓄積(スナップショット履歴)が不要な集計 — プログラム埋まり率・未収金エイジング・支払い方法構成・年代×性別分布・RevPACH — を取り込みパイプラインに追加し、検出器D10(未収金滞留)と経営ボードの新セクション(プログラム/顧客/お金拡張)で見えるようにする。

**Architecture:** 既存パイプラインの各層に増分追加する: labolaSchemas(プログラム・予約不可の行パース)→ labolaNormalize(正準化)→ reservationAggregates(新集計5種)→ snapshotSchema(後方互換の任意フィールド追加)→ snapshotBuild(結線)→ insightDetectors/D10 → analyticsView(表示整形)→ analytics UI(新3セクション)。破壊的変更なし。

**Tech Stack:** 既存のみ(新規依存なし)。

**設計書:** `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md` §5.3(カタログB/C/D)・§7(D10)・§8(UI)

**範囲外:** 会員一覧・売上明細・MINERVAの正準化 / D4〜D9・D13 / ペースカーブ・コホート・満枠速度履歴 / publicFacingPack / タグ面。

## Global Constraints

- TypeScript strict・any禁止・`import type`・日本語エラー・Conventional Commits(日本語)
- TDD必須・全体カバレッジ100%(CI閾値)・`npm run lint` クリーン
- **スキーマ後方互換**: snapshotSchema への追加フィールドは `.optional()` または `.default()` で旧スナップショット(P1/P2産)が `parseSnapshot` を通ること(専用テスト必須)
- PII境界維持: 正準データセット・スナップショットに個票の氏名等は存在しない(プログラム名・スペース名は施設の公開情報でありPIIではない)
- 表示整形は analyticsView に集約し、UIコンポーネントで計算しない(既存方針)
- 集計の分布系(年代×性別×顧客タイプ)は**スナップショットにはそのまま**入れ、公開面(LINE/将来のNotion/AI)へ出す場合のみ k=3 抑制(ボードは緩和の既存方針)。ダイジェスト(formatIngestDigest)は今回変更しない
- フィクスチャは合成データのSJIS(cp932)のみ。実CSV・実PII禁止
- 実行ブランチ: `feature/labola-data-platform-p1ex`(統合ブランチから分岐済み)
- ゲート: `npm run test:coverage` + `npx tsc --noEmit` + `npm run lint`

## ドメイン前提(実CSVから確認済みの構造)

- **プログラム一覧CSV**(school/event/individual の3ファイル、内容は同型): ヘッダー署名 `名称,カテゴリ,スポーツ,開催日` は `detectCsvType` で判定済み(type: "program")。使う列: `名称・カテゴリ・開催日・開始時間・終了時間・募集数・ステータス・公開ステータス`(他列は無視)。**注意: 実CSVでは1論理行の「料金プラン説明」セル内に改行があり、parseCsvRows は引用内改行を正しく扱える(P1テスト済み)**
- **予約不可一覧CSV**: ヘッダー `日付,開始時間,終了時間,スペース,予約名,予約色,備考`(署名判定済み・type: "blocked")。スペースが `None` の行は面に紐付かない補助行として**除外**
- **プログラムと予約の突合キー**: `CanonicalReservation.space`(=予約内容列)がプログラム名と一致し、かつ `useDate`==開催日 かつ `start`==開始時間。カテゴリーがプログラム系(スペース予約以外)の予約のみ突合対象
- **RevPACH の分母**: 営業時間は 6:00〜23:00(=1020分/面/日)。面(スペース)の集合は「予約(スペース予約カテゴリー)と予約不可行に登場した space の和集合から `None` を除いたもの」。分母 = 面数×1020分×対象日数 − 予約不可分(面に紐づく行のみ、営業時間内にクリップ)。分子 = スペース予約カテゴリーの非キャンセル `amount` 合計(対象期間の利用日ベース)。期間は直近28日(referenceYmd 基準・coverage内にクリップ済みの既存 `recent28Range` 相当を再利用)

---

### Task 1: labolaSchemas — プログラム・予約不可の行パース

**Files:**
- Modify: `scripts/growth/labolaSchemas.ts` / `scripts/growth/labolaSchemas.test.ts`

**Interfaces:**
- Produces:
  - `interface ProgramRow { name: string; category: string; heldOn: string; start: string; end: string; capacity: number | null; status: string; publishStatus: string }`
  - `parseProgramRows(rows: string[][]): { rows: ProgramRow[]; warnings: string[] }`(必須列: 名称・カテゴリ・開催日・開始時間・終了時間・募集数・ステータス・公開ステータス。開催日は `jpDateToYmd`、時刻は `parseTimeOfDay` で正規化。募集数は空→null・非数値はエラー。必須セル物理欠落は行番号エラー — 既存パーサと同じ規律)
  - `interface BlockedSlotRow { date: string; start: string; end: string; space: string; label: string }`
  - `parseBlockedSlotRows(rows: string[][]): { rows: BlockedSlotRow[]; warnings: string[] }`(必須列: 日付・開始時間・終了時間・スペース。予約名は任意(label、無ければ空)。space が `None` の行もパースは通す(除外は正準化側)。時刻は parseTimeOfDay。終了<=開始はエラー)

**Steps:** 失敗するテスト(正常・時刻正規化・募集数null/不正・欠落セル・None通過・終了<=開始エラー)→ 失敗確認 → 実装 → PASS → コミット `feat(growth): プログラム・予約不可CSVの行パースを追加`

### Task 2: フィクスチャ生成と labolaNormalize — 正準化

**Files:**
- Create: `scripts/growth/__fixtures__/labola/program_sjis.csv` / `blocked_sjis.csv`(python3 cp932・架空データ。programは満枠判定できる構成: 募集数6のクラス等)
- Modify: `scripts/growth/labolaNormalize.ts` / `.test.ts`

**Interfaces:**
- `CanonicalBundle` に追加: `programs: CanonicalProgram[]`・`blockedSlots: CanonicalBlockedSlot[]`
  - `interface CanonicalProgram { name: string; category: string; heldOn: string; start: string; end: string; capacity: number | null; status: string; publishStatus: string }`
  - `interface CanonicalBlockedSlot { date: string; start: string; end: string; space: string; label: string }`(**space==="None" の行はここで除外**。labelはPIIなし前提だが備考列は取り込まない)
- `buildCanonical` の input に `programs: ProgramRow[] | null`・`blockedSlots: BlockedSlotRow[] | null` を追加。null は `missingSections` に `"program"` / `"blocked"` を積む(欠落耐性)
- meta.counts に `program`・`blocked` を追加

**Steps:** フィクスチャ生成(計画のpython3方式)→ 失敗するテスト(正準化・None除外・欠落時missingSections・counts)→ 実装 → PASS → コミット `feat(growth): プログラム・予約不可の正準化を追加`

### Task 3: reservationAggregates — 新集計5種

**Files:**
- Modify: `scripts/growth/reservationAggregates.ts` / `.test.ts`(肥大化する場合は `reservationAggregatesExtra.ts` として分割してよい — 800行規約優先)

**Interfaces:**(すべて既存関数と同じ「引数は bundle+referenceYmd、返り値はスナップショットへそのまま入る形」)
- `programFills(bundle, referenceYmd): { name: string; heldOn: string; start: string; capacity: number | null; reserved: number; fillRate: number | null }[]`
  - 対象: 開催日が [referenceYmd-27, referenceYmd+28] のプログラム(直近と今後を両方見る)。公開ステータスが非公開のものは除外
  - reserved = 突合キー(name==space && heldOn==useDate && start==start)で一致する非キャンセル予約の件数(partySize は使わない=1予約1枠。実データでスクール予約は1人1予約)
  - fillRate = capacity が null/0 なら null、それ以外 reserved/capacity。開催日昇順
- `unpaidAging(bundle, referenceYmd): { count: number; amount: number; buckets: { label: "0-7日" | "8-14日" | "15日以上"; count: number; amount: number }[] } | null`
  - 対象: paymentStatus が「入金待ち」の非キャンセル予約。経過日数 = referenceYmd − bookedAt(JST日付)。予約が0件なら null(集計不能と0件の区別は count:0 の非null で表現 — 入金待ち0件は `{count:0, amount:0, buckets:[3個とも0]}`)
  - **利用日が未来の予約は「入金待ちで正常」なので除外**(現地払い・クレカ後払いは利用時に決済されるため。対象は useDate <= referenceYmd のもの)
- `paymentMethodShare(bundle, referenceYmd): { method: string; count: number }[]`(直近28日の受付・非キャンセル。方法降順・空文字は「不明」)
- `demographics(bundle): { ageBand: string; gender: string; customerType: string; count: number }[]`(customers ベース。count>0 のセルのみ。**抑制はしない**=スナップショットは全数、公開面で抑制する既存方針)
- `revPach(bundle, referenceYmd): { revenue: number; availableCourtHours: number; revPerCourtHour: number; spaces: number } | null`
  - ドメイン前提節の定義どおり。期間は直近28日(coverage クリップは呼び出し側の referenceYmd に既に反映されている前提 — snapshotBuild の既存 referenceYmd を使う)。面集合が空なら null

**Steps:** 各関数 TDD(境界: 期間外プログラム除外・非公開除外・突合不一致・未来利用日の未収金除外・None面除外・営業時間クリップ)→ 実装 → PASS → コミット `feat(growth): 蓄積不要の経営集計(プログラム・未収金・支払・年代・RevPACH)を追加`

### Task 4: snapshotSchema・snapshotBuild — スキーマ拡張と結線

**Files:**
- Modify: `scripts/growth/snapshotSchema.ts` / `.test.ts`、`scripts/growth/snapshotBuild.ts` / `.test.ts`、`scripts/growth/ingestApplication.ts` / `.test.ts`(programs/blockedSlots のCSV結線)、`scripts/growth/ingest-cli.ts`(必要なら)

**Interfaces:**
- catalog に追加(**全て `.optional()`**: 旧スナップショット互換): `programFills` / `unpaidAging` / `paymentMethods` / `demographics` / `revPach`(型は Task 3 の返り値)
- snapshotBuild: bundle から Task 3 の5関数を呼んで詰める。ingestApplication: files.get("program")(school/event/individual は同一typeなので selectLatestByType の挙動に注意 — **3ファイルが同typeで1つしか採用されない問題があるため、type "program" のみ「全ファイルを連結」する例外処理を collectFiles 側に追加し、重複行(name+heldOn+start一致)は警告なしで重複排除**)・files.get("blocked") を parse して buildCanonical へ
- 後方互換テスト: P1/P2形式のスナップショットJSON(新フィールドなし)が parseSnapshot を通る

**Steps:** TDD → 実装 → PASS → コミット `feat(growth): スナップショットへ経営集計を追加(後方互換)`

### Task 5: insightDetectors/unpaidAging(D10)

**Files:**
- Create: `scripts/growth/insightDetectors/unpaidOverdue.ts` / `.test.ts`
- Modify: `scripts/growth/insightEngine.ts`(CORE_DETECTORS へ追加)、必要なら snapshotBuild

**Interfaces:**
- `unpaidOverdue: Detector` — bundle から未収金(利用日が過去・入金待ち・非キャンセル)のうち経過日数(referenceYmd−bookedAt)が15日以上のものが1件以上あれば notice を1件(`id: "d10:unpaid"`、body は件数と合計金額のみ・予約番号は evidence に配列で。氏名等は元から無い)。0件なら空
- DetectorContext に referenceYmd 相当が無い場合は todayYmd を使う(既存コンテキスト確認のうえ整合)

**Steps:** TDD(15日以上あり/なし/未来利用日除外)→ 実装 → PASS → コミット `feat(growth): 未収金滞留の検出器(D10)を追加`

### Task 6: analyticsView — 表示整形

**Files:**
- Modify: `scripts/growth/analyticsView.ts` / `.test.ts`(分割可: `analyticsViewExtra.ts`)

**Interfaces:**
- `programList(snapshot): { title: string; schedule: string; fill: string; state: "full" | "warn" | "open" | "unknown" }[]`(fill 例 "6/6"・fillRate>=1で full・<0.34で warn・capacity null は "unknown"+fill "—"。catalog.programFills が undefined なら空配列=セクション非表示(旧スナップショット))
- `moneyExtra(snapshot): { unpaid: { headline: string; overdue: string | null } | null; paymentShare: { method: string; pct: number }[]; revPach: string | null }`(unpaidAging undefined→null。金額は ¥カンマ区切り。pct は四捨五入整数)
- `demographicsView(snapshot): { label: string; count: number }[]`(count 降順・上位8・「年代 性別」ラベル。undefined→空)

**Steps:** TDD(undefined=旧スナップショットで空/null になる後方互換分岐を必ず含む)→ 実装 → PASS → コミット `feat(growth): 経営集計の表示整形を追加`

### Task 7: ボードUI — 新3セクション

**Files:**
- Create: `src/app/growth/analytics/components/ProgramPanel.tsx` / `.test.tsx`、`DemographicsPanel.tsx` / `.test.tsx`
- Modify: `src/app/growth/analytics/components/MoneyPanel.tsx` / `.test.tsx`(未収金・支払構成・RevPACH追記)、`AnalyticsClient.tsx`(セクション配置)、`analytics.css`(必要最小)
- Modify: `src/lib/growth/analyticsView.ts`(再エクスポート更新。分割した場合)

**要点:** モックアップ準拠(プログラムは満枠pill(accent)/埋まり低warn(橙))。データ未提供(旧スナップショット)ならセクション自体を出さない。セマンティックHTML・RTLテスト(正常・空・未提供)。

**Steps:** TDD → 実装 → PASS → コミット `feat(growth): 経営ボードにプログラム・顧客・お金拡張セクションを追加`

### Task 8: 仕上げ

- [ ] フィクスチャ一式(yoyaku+program+blocked)で `growth:ingest` → analytics-dev でブラウザ確認(新セクション表示・旧データでの非表示)
- [ ] docs/operations/growth/50-publish-metrics.md にプログラム・予約不可CSVが推奨入力である旨を1行追記
- [ ] フルゲート → コミット `docs(growth): P1拡張ライトの入力CSVを追記`

## Self-Review

- スコープ整合: goal記載の5集計+D10+UI+後方互換を全タスクでカバー。会員/売上明細/履歴系は不使用
- 型整合: CanonicalProgram/BlockedSlot は Task 2 で定義し Task 3〜5 が参照。catalog 追加は全て optional
- 既知の設計判断: program 3ファイル連結+重複排除(Task 4)/ 未来利用日の未収金除外(Task 3)/ RevPACH の面集合定義(ドメイン前提節)— レビューで異議が出たら設計書に追記して確定する
