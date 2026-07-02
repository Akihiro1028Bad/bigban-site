# 承認画面フロント proto デザイン全面移植 設計書

> 作成: 2026-07-01 / 対象: `/growth/approve`（本番承認画面）/ 正典: プロトタイプ `src/app/growth/approve-proto/`
> 付録（一次資料）: `.superpowers/design/inventory-proto.md`・`.superpowers/design/inventory-prod.md`

## 1. ゴールと方向（正典）

- **proto が正典**: デザインも動きも完成形。本番 `/growth/approve` フロントを proto そのものに作り替える。
- **方向は「バックエンドを proto に合わせる」**（従来の backend 拡張ゼロとは逆）。proto の UX が要求するデータ形に本番側を寄せる。**バックエンド改修・追加・スキーマ変更を許可**。
- **実データで実際に動くことは絶対維持**。proto のモック（`mockData.ts`/`reviseMock.ts`/`consultEngine.ts` 等）は本番結線（Notion pull型・microCMS・認証・ポーリング）へ置換。＝**見た目と操作感は proto／データと通信は本物／本物側を proto に合わせて変えてよい**。
- 範囲は承認画面まるごと（シェル・ボード・詳細パネル・相談ドロワー・公開キュー・成績・施策・プロンプト管理・画像指示・ダイアログ/トースト/コマンドパレット）。

## 2. アーキテクチャ決定（Architecture Decisions）

### AD1 — テーマは proto.css を本番スコープへ移植（トークン名 `--p-*` を維持）
- `approve-proto/proto.css` を本番用 `src/app/growth/approve/approveTheme.css`（仮）として移植し、**ルートクラス `.approve-shell` にスコープ**する（proto の `.proto-root` 相当）。`--p-*` の **トークン名はそのまま維持**して proto コンポーネントを 1:1 で移植可能にする（fidelity 最優先）。
- 本番承認画面のレイアウト最上位を `<div className="approve-shell">` で包む。トークンは CSS 変数として定義（＝「Tailwind v4 / CSS 変数で正規化」を満たす）。Tailwind 連携が要る箇所は arbitrary value（`bg-[var(--p-bg)]`）か `@theme` 登録で対応。
- 演出（`.proto-pulse`/`.proto-shimmer`/`.proto-spin`/`.proto-indeterminate`/`.proto-changed`）・ボタン触感（`.proto-btn-*`/`.proto-tool`/`.proto-editable`）・記事タイポ（`.proto-article`）・スクロールバー・focus-visible も同 CSS に移植。
- `prefers-reduced-motion` は proto 同様 CSS ＋ `<MotionConfig reducedMotion="user">` の二段で担保。

### AD2 — proto コンポーネントは「見た目を near-verbatim 移植・データは本番フック」
- proto の各 .tsx を本番 `src/app/growth/approve/` 配下へ移植し、**props/データソースだけ本番化**（mock → `PendingItem`/`DraftPreview`/既存フック）。見た目・class・アニメ・キーボード操作は proto を踏襲。
- 既存の本番フック（`useApproveBoard`/`useApproveDecisions`/`useDraftPreview`/`useReviseEditing`/`useConsult`/`useAdviceConsult`/`useBodyCommentConsult`/`useToasts`）と API ルートを**データソースとして再利用**。差分B 資産（`consult.ts`・各 consult フック・`consult/*`）も活かす。

### AD3 — 純ロジックは src/lib へ・テスト100%／薄い presentation は除外（既存方式踏襲）
- proto の純ロジックエンジン（`consultEngine`/`reviseMock`/`draftQuality`/`metricsView`/`imageIntent`/`proposalKind`/`bodyBlocks`/`stages`）は、本番 `src/lib/growth/*`（または `src/app/growth/approve/*.ts`）へ**純関数として移植し 100% テスト**。一部は既存（`consult.ts`/`metrics.ts`/`metricsReview.ts`/`stage.ts` 等）に対応物があるので統合。
- 移植した proto **presentation .tsx は `vitest.config.ts` の `coverage.exclude` に既存様式で追記**（DOM 直結の薄い結線として）。
- **状態オーケストレーションのグルー（分岐ロジックを含むフック）は除外せず 100% テスト**（差分B の useConsult の教訓）。
- 閾値 100% は不変。純ロジックの計測逃れ禁止。

### AD4 — ドメインモデルの写像（proto ⇄ 本番）
proto のステージ語彙を本番 `Stage`＋各 status から導出する写像層を `src/lib/growth/*`（純関数・テスト100%）に置く。
| proto ステージ | 本番由来 |
|---|---|
| outline_review | stage=proposed/queued かつ outline あり・isDraftReady=false |
| generating | stage=generating（進捗% は AD5 参照） |
| draft_review | stage=drafted / isDraftReady=true |
| scheduled | scheduledAtMs != null |
| idea | kind=proposal（施策トリアージ） |
| published | stage=published（metrics あり） |
proto 相談状態は既存 `consult.ts`（ConsultKind/Status/Stage）を使用。

### AD5 — バックエンド改修項目（proto が要求／本番に未対応・各フェーズで対応）
proto の以下は本番バックエンドに無いか形が違う。**各項目はフェーズ内で「本番に実データ経路を作る（Notion プロパティ追加・API 追加）」か「当面は実データで出せる範囲に縮約」かを設計判断**し、改修時は本書に追記:
1. **施策の種別ルーティング（article/site/event/other）**: 本番は category（コンテンツ/MEO/SEO/サイトデザイン/サイト表示内容/追加機能/イベント）。proto 4 種別への写像 or Notion プロパティ追加。`ProposalDetailBody` の site/event 詳細は Notion フィールド追加が要る可能性。
2. **画像指示サブシステム（per-section off/auto/custom＋action＋アイキャッチ指定）**: 本番は outline＋`/revise` に画像ヒント。proto の `imageIntent` 形を Notion/outline スキーマへ persist。
3. **成績の期間切替（7/28/90日）＋GSC 行展開**: 本番 `ArticleMetrics` は単一期間。多期間・GSC は backend 改修が大きい → 当面は実データで出せる範囲（現行 metrics）に縮約し、proto の UI 骨格で表示。将来拡張は別サブスペック。
4. **generating の genProgress（0→100%）**: 本番 stage=generating に進捗%が無い → 当面は `.proto-indeterminate` 不定進捗で表示、進捗% は backend が surface できれば差し替え。
5. **DevicePreview のタブレット**: 本番は PC/モバイル → タブレット幅追加はフロントのみ。
6. **MediaLibraryModal 統一**: 本番 `/media` で充足。proto の統一モーダルへ集約。**P5b（Task 6）で un-縮約済**: P3b（AD5-8）で撤去したアイキャッチ差し替え（#143）の受け皿として、**公開キュー「要対応（アイキャッチ未設定）」行 → MediaLibraryModal 実結線**を実装。一覧/アップロードは `GET|POST /api/growth/media`（`authHeaders`・MANAGEMENT キーは server-only のため API ルート経由のみ）、反映は `POST /api/growth/draft/eyecatch { pageId, eyecatchUrl }`（`isMicrocmsAssetUrl` 検証・成功で `onChanged()` 盤再取得）。proto の `MOCK_MEDIA`/`mediaSvgUrl`/種別フィルタ chip は**モック用のため不使用**＝実データにフィルタ軸が無いためフィルタは縮約（非表示）。クライアント事前検証は `media.ts` の純関数 `validateUpload` を再利用（重複実装しない）。モーダルは presentation として coverage.exclude、結線フローは `PublishQueue.test.tsx` で担保。
7. **ボードステージ scheduled（予約公開）**: **P3a で un-縮約済**。P2-fix1 の調査でサーバ `@/lib/growth/approve` の PendingItem に `scheduledAtMs` が既に存在（実行時データあり）と判明したため、BE 改修不要。クライアント型 `types.ts` に `scheduledAtMs?: number | null` を宣言し、`deriveBoardStage` が `drafted`/`isDraftReady` かつ `scheduledAtMs != null` を `scheduled` に写像する（draft_review より優先）。`null`/未設定は「未予約」として draft_review 側へ寄る。
8. **P3b（Task 9）で撤去した本番固有操作（proto 厳密優先・全撤去）**: T8 の proto DetailPanel 再スキンで到達 UI から消えた以下の本番固有操作を、proto 厳密優先の裁定に基づき**撤去**した（新サーフェスへ再結線しない）。
   - **本文をコピー（#127）**: proto 到達 UI に無い → 撤去。
   - **アイキャッチ／本文画像の差し替え（#143/#145）**: proto 到達 UI に無い → 撤去（メディアからの差し替えは将来の公開キュー／メディアピッカーへ）。※アイキャッチ／本文画像の **AI 再生成（#144/#156）は維持**。
   - **装飾を提案（#147）**: proto 到達 UI に無い → 撤去。
   - **「なぜこの記事か」カード（subtitle callout）**: proto 到達 UI に無い → 撤去（根拠 subtitle は相談導線／メトリクスチップへ）。
   - **連続レビューの可視「次へ →」ボタン（#275）**: proto 到達 UI に無い → 撤去。キーボード j/k による前後移動は維持。
   - **タイトルの直接編集（#139 A・ReviseSection/TitleEditor）**: proto 到達 UI に無い → 撤去（タイトルの **AI 修正 #139 B は相談ドロワーに維持**）。
   - **詳細パネルの公開／クローズ操作群（#167）**: proto 厳密優先で撤去し、**公開は公開キュー #H23/#H24（PublishQueue）へ一本化**。詳細パネル footer の主操作は proto 準拠（承認／却下／構成やり直す／AIに相談）のみ。
   - 上記に伴い orphan 化した本番専用コンポーネント（DecorationAssistant / EyecatchPicker / BodyImagePicker / ExcerptEditor / ReviseSectionView / ReviseSection / TitleEditor）と純ロジック `bodyImageEdit.ts` を削除。proto プレゼンテーション5ファイル（DetailPanel/DetailViews/OutlineView/QualityChecklist/DevicePreview）を coverage.exclude に追加。

## 3. proto ⇄ 本番 コンポーネント対応（disposition）
凡例: **再スキン**=本番に対応物あり・見た目を proto へ / **新規移植**=proto から持ち込み / **BE**=バックエンド改修を伴う

| エリア | proto | 本番対応 | disposition |
|---|---|---|---|
| シェル | TopBar/LeftRail/ShortcutBar/ShortcutOverlay/BulkBar | BoardTabs/BoardToolbar/BulkActionBar（部分） | 再スキン＋新規移植（LeftRail/ShortcutBar/Overlay は新規） |
| ボード | Board/StateScreens | ArticlesView/BoardCard/GateScreens | 再スキン |
| 詳細 | DetailPanel/DetailViews/OutlineView/QualityChecklist/DevicePreview | DetailPanel/DetailPanelView/DetailHeader/DraftChecklist/DraftPreviewPane | 再スキン（DevicePreview にタブレット追加=軽BE） |
| 編集 | DraftEditWorkspace/InlineEditor/CommentableBody | DraftEditWorkspace/DraftEditor/InlineCommentReview | 再スキン（TipTap 結線は維持） |
| 相談 | ConsultDrawer/Composer/Card/AdviceResultBody/ReviseProposalBody/SentenceFixBody | consult/*（差分B） | 再スキン（差分B結線を活かし proto 見た目へ。AdviceResultBody は RingScore 等 proto 表現へ戻す） |
| 施策 | ProposalView/ProposalDetailBody/ProposalFormModal | ProposalsView/AddProposalForm/HypothesisCard | 再スキン＋**BE**（種別ルーティング・site/event 詳細） |
| 公開 | PublishQueue/SchedulePicker | PublishQueue | 再スキン |
| 成績 | PerformanceBoard | PerformanceBoard | 再スキン＋**BE**（期間/GSC は縮約） |
| プロンプト | PromptRegistryView | PromptsView | 再スキン |
| 画像指示 | ImagePlanBanner/ImageStateToggle/ImageSlot/ImageDirector/ActionInput/ActionSuggestions/HouseStylePreview | （outline 内画像ヒント・SectionImages） | 新規移植＋**BE**（imageIntent persist） |
| グローバル | ConfirmActionDialog/ToastStack/MediaLibraryModal | ConfirmActionDialog/ToastList/(media pickers) | 再スキン＋新規移植（MediaLibraryModal） |

## 4. フェーズ計画（段階実施・各フェーズ末に tsc/eslint/vitest --coverage 全緑・ローカルコミット・確認観点提示）

- **P0 デザインシステム基盤**: `approveTheme.css`（`.approve-shell` スコープ・`--p-*`・演出・ボタン・記事タイポ）移植。`icons.tsx`・`ui.tsx`（Kbd/StageChip/ScoreBar/AwaitingDot/EyecatchThumb/RingScore/Sparkline/MetaStat）を本番へ移植し純ロジック（色しきい値等）を 100% テスト。承認画面ルートを `.approve-shell` で包む土台。**他フェーズの依存元**。
- **P1 シェル**: page/レイアウト・TopBar・LeftRail・ShortcutBar・ShortcutOverlay・BulkBar を proto デザインへ。view 切替（施策/記事/プロンプト/成績/公開キュー）の骨格。実データ（盤ポーリング・統計）に結線。
- **P2 ボード＋カード**: Board（Stage グルーピング・layoutId 共有アニメ・StageChip/ScoreBar/EyecatchThumb・生成中 pulse）と空状態/スケルトン（StateScreens）を実データのまま proto 見た目へ。ステージ写像（AD4）を純ロジック化しテスト。
- **P3 詳細パネル＋下書きプレビュー＋構成案**: DetailPanel（2段タブ・layoutId underline）・DetailViews（プレビュー/メタ/画像）・OutlineView（行コメント＋画像指示の骨格）・QualityChecklist・DevicePreview。draftQuality/bodyBlocks 等を純ロジック化しテスト。画像指示の persist は P3 内 or P3.5（BE）。
- **P4 相談ドロワー**: 差分B の結線（consult.ts/各フック）を活かし、ConsultDrawer/Composer/Card/各 Body を proto デザインへ再スキン（RingScore/proto-changed diff/sentence 一覧）。
- **P5 施策・成績・公開・プロンプト・グローバル**: ProposalView（種別ルーティング=BE）・PerformanceBoard（期間/GSC は縮約）・PublishQueue/SchedulePicker・PromptRegistryView・ConfirmActionDialog/ToastStack/MediaLibraryModal/CommandPalette を proto デザインへ。
- **P6 仕上げ**: a11y（axe・キーボード・コントラスト・reduced-motion）・記事タイポ最終調整・全体カバレッジ確認・旧ライト版コンポーネントの撤去（orphaned 棚卸し）・最終全体レビュー。

各フェーズは**それ自身の writing-plans → subagent-driven-development** で実装。BE を伴うフェーズは着手時に本書 AD5 を更新（実データ経路 or 縮約の判断・理由）。

## 5. 制約（プロジェクト規約・再掲）
- TDD 必須。カバレッジ 100% ゲート（istanbul・閾値変更禁止・純ロジックは除外せずテスト・薄い presentation は exclude 追記）。
- TS strict / `any` 禁止 / `React.FC` 禁止 / `import type` / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- App Router（Server Component 既定・`"use client"` 最小・`next/image`/`next/font`・framer-motion 使用ファイルは `"use client"`）。
- a11y（セマンティック HTML・reduced-motion・コントラスト・キーボード・axe）。
- セキュリティ: `MICROCMS_MANAGEMENT_API_KEY` 等 server-only（`NEXT_PUBLIC_` 禁止）。公開前 `APPROVE_AUTH_ENABLED` ON。
- 出力（仕様/計画/コミット/説明）は日本語。**push 禁止**（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。push 時のみ `ttmakhr1028ai-art`。`next-env.d.ts`/`node_modules` ステージ禁止。
- グロースループ禁止事項（run.mjs から公開/commit/push しない・未確定情報を断定しない・失敗を沈黙させない）維持。

## 6. リスク・留意
- **巨大プロジェクト**: 6 フェーズ各々が独立サブプロジェクト。フェーズごとに spec→plan→実装→レビューを回し、フェーズ末でユーザー動作確認を挟む。
- **BE 改修の波及**: 施策種別・画像指示・成績多期間は Notion スキーマ／PC 側 CLI／pull型ループに波及しうる。各フェーズで「実データで出せる範囲」を明示し、過剰先行を避ける（YAGNI）。当面縮約した proto 機能は本書に縮約理由を残す。
- **二重実装期間**: 移植中は旧ライト版と新 proto 版が一時併存しうる。フェーズ境界で旧版を撤去し dead code を残さない（P6 で総棚卸し）。
- **カバレッジ**: presentation 量が多く exclude が増える。純ロジック（写像・view-model・エンジン）を厚く切り出して「ロジックは 100% テスト・見た目は exclude」の原則を維持し、計測逃れにしない。

## 7. 完了条件（DoD）
- `/growth/approve` 全体が proto のデザイン・インタラクションと一致（ダークテーマ・アクセント・アイコン・余白・演出・記事タイポ）。
- 実バックエンドで実動作（モック非依存）。proto に合わせた BE 改修は完了し整合（縮約箇所は本書に明記）。
- `npx tsc --noEmit` / `npx eslint .` / `npx vitest run --coverage` 全緑・グローバル 100% 維持。
- ローカルコミット済み・未 push。フェーズ別の動作確認観点を提示してユーザー確認を仰ぐ。
