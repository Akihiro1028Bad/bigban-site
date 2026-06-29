# 承認コンソール 実装仕様（ステージ3）— IA「パイプライン1本道」× ビジュアルC「クリアデイ」

- 日付: 2026-06-29
- 前提: [IA設計(承認済み)](./2026-06-29-approve-console-ia-design.md) ＋ ビジュアル方向 **C. クリアデイ（クリーンSaaS）**（ユーザー選定）
- 実装先: 新ルート `src/app/growth/approve-proto2/`（現 `approve-proto` は温存）
- 検証: ブラウザ（ユーザー）＋ tsc/eslint クリーン・コンソールエラーゼロ

## 1. ビジュアルトークン（C「クリアデイ」確定値）

`proto2.css` に `.proto2-root` スコープで CSS変数として定義（明るい基調・テーマ固定・配色トグル廃止）。

```
基調: light / 温かい紙面
--p-bg:        #F4F3EF   (ページ)
--p-surface:   #FFFFFF   (カード/白)
--p-surface-2: #FBFBFA   (一段沈み)
--p-border:    #E8E7E1   (0.5px罫が主役)
--p-border-strong: #D3D2CA
--p-text:      #1B1C1E
--p-text-2:    #46474A
--p-muted:     #8A8B86
--p-accent:    #2563EB   (青・ユーザー操作)
--p-ink:       #1B1C1E   (黒CTA塗り)

状態4色ドット(段階色とは別レイヤー・凡例固定):
--p-ready:     #16A34A   (届いた/承認可・緑)
--p-progress:  #7C3AED   (処理中・紫 / pulse)
--p-fail:      #DC2626   (失敗/滞留・赤)
--p-info:      #2563EB   (情報・青)
状態weak地: ready #EAF6EE / progress #F1ECFB / fail #FBE9E9 / info #E8F0FE
```

- **タイポ**: system-ui / Hiragino Kaku Gothic ProN / Noto Sans JP。ウェイトは **400(本文) と 500(見出し・ラベル) の2階調のみ**（600/700不使用）。行タイトル14px/500・本文13px/400・ラベル12px・メタ11px。数値は tabular-nums。等幅 `--p-mono`=ui-monospace は ID/差分/時刻のみ。
- **角丸**: カード/記事行10px・ボタン/チップ/入力7px・小ピル5-6px・確信マス2px・ドロワー左角12px。
- **境界/影**: 基本 0.5px solid `--p-border`（hover時 `--p-border-strong`）。影は原則なし＝0.5px罫で浮きを表現。例外: ドロワー `0 8px 28px rgba(20,22,28,.10)` とフォーカス環 `0 0 0 2px var(--p-surface-2), 0 0 0 4px rgba(37,99,235,.45)` のみ。片側ボーダー箇所は `border-radius:0`。
- **モーション**(framer-motion): 機敏・短い・直線的（Linear風）。hover 90ms / 状態切替 140ms / 層移動 160ms、ease `cubic-bezier(.2,0,0,1)`。記事行hoverは背景#FFF→#FBFBFA＋border強化（transformなし）。ステッパー前進=現在ドット scale0→1＋リング180ms。**承認解錠**=ロック時グレーCTA→解錠で黒CTAへ色とラベルを120msクロスフェード、押下 scale(.98)80ms。処理中ドット(progress紫)は pulse(opacity .55↔1, 1.1s)のみ、他は静止。ドロワーは右から translateX16px→0＋opacity160ms。`prefers-reduced-motion` で全即時・pulse停止。

## 2. コンポーネント・インベントリ（`approve-proto2/`）

既存 `approve-proto` の純ロジック/型は**再利用**（同型のものは移植 or 共有）。新規UIはCの言語で作る。

### 再利用（移植 or import）
- `types.ts`(Stage/ReviseStatus/ImageInstruction/Article 等) ／ `stages.ts`(STAGE_META) ／ `draftQuality.ts`(block/warn/ok) ／ `imageIntent.ts`(画像指示) ／ `mockData.ts`(モック・proto2用に微調整) ／ `BodyCommentView`/`ReviseCompareView` 相当の校正ロジック。

### 新規UI（Cの言語）
| コンポーネント | 責務 |
|---|---|
| `proto2.css` | C トークン（上記）。`.proto2-root` スコープ。 |
| `Page` (page.tsx) | 状態オーケストレーション（activeId/段階フィルタ/依頼トレイ/一括選択/ドロワー開閉）。 |
| `TopBar` | ループヘルス（巡回✓/停止疑い⚠ピル）＋投げた依頼トレイ＋⌘K。 |
| `StationRail` | 左レール段階別ステーション（要対応/戻りあり/構成まち/下書きまち/予約まち/待機中/ネタ/公開済み）＋件数バッジ（要対応=黒地/戻りあり=赤weak/他=ミュート数字）。 |
| `RequestTray` | pull型の投げた依頼チケット列（種別アイコン＋記事名省略＋状態ドット、戻り到着で緑縁pulse）。 |
| `StageStepper` | ●—●—○ の現在地ステッパー（完了=塗り/現在=リング/未=罫線）。aria-current。 |
| `ArticleRow` | 段階ステッパー＋サムネ（状態色tint地）＋タイトル＋段階チップ＋次アクションCTA（承認可=黒塗り/他=ゴースト/生成中=ミュート）。 |
| `PipelineBoard` | 盤本体（あなた待ちヘッダ＋行リスト＋一括バー）。 |
| `BulkBar` | 同段階＋ゲート全通過のみ「まとめて承認」（block自動除外）。Undoは段階遷移のみ。 |
| `Drawer` | 右ドロワー。最上部に確信メーター＋公開前ゲート＋承認CTA（ロック/解錠）、本文プレビュー＋校正レーン＋素材＋根拠（縦積みカード・タブ廃止）。 |
| `ConfidenceMeter` | 6マス進捗＋3チェック残量（🔴🟡🟢公開前ゲートに連結）。 |
| `PrePublishGate` | フッタ固定の信号3点（事実/校正/素材）＋block時のロック理由＋【不足を直すよう依頼】。 |
| `ProofLane` | 行コメント→AI依頼→戻り承認を1列で往復（統合校正）。 |
| `MaterialsLane` | 画像指示(off/おまかせ/指定・house styleロック・`imageIntent`)＋メディア。 |
| `CommandPalette` | 記事横断ジャンプ＋段階フィルタ＋一括（機能ランチャー化しない）。 |

## 3. 状態・インタラクション要点

- **2段ゲートを1本道に**: outline_review=「構成を承認 → 生成を依頼」、draft_review=「下書きを承認 → 公開予約」。全CTAを「承認 → ◯◯を依頼」に文言統一。最終公開(scheduled→published)は自動進行（承認ジェスチャ外＝誤公開排除）。
- **公開前ゲート先出し→解錠**: draft到着で `qualityChecks()` 実行→🔴🟡🟢。block>0で公開予約を物理ロック＋理由インライン＋【不足を直すよう依頼】（pull依頼へ直結）。全block解消で黒CTAへ解錠（120msクロスフェード）。
- **pull型依頼体験**: CTA=依頼を投函するだけ→トースト（取り消し）＋依頼トレイにチケット→記事はバッジ変化し「待機中」へ→戻り到着でチケット緑＋「戻りあり」昇格。ループヘルス常設。
- **一括承認**: 同段階＋ゲート全通過のみ束ね、block自動除外。Undoは段階遷移のみ（公開予約に非適用）。
- **キーボード**: J/K=送り、Enter=ドロワーへ（承認でない）、A=現段階プライマリ承認、R=修正依頼、X=却下、E=本文編集、Space=複数選択、Esc=閉。
- **a11y**: 段階ステッパー aria-current、ロック理由 aria-describedby、色のみ依存しないラベル併記、`prefers-reduced-motion`。

## 4. 削る（proto2に持ち込まない）

カンバン⇄リスト切替 / 表示密度トグル / ブランド配色トグル / 独立プロンプト面（→ドロワー根拠折りたたみ）/ 詳細7タブ二段ナビ（→ドロワー縦積み）。

## 5. ビルド順（インクリメンタル・各ステップでブラウザ検証）

1. **基盤**: `proto2.css`（Cトークン）＋ `approve-proto2/page.tsx` の骨格＋データ移植（types/stages/draftQuality/imageIntent/mockData をproto2に複製 or import）。
2. **盤の静的描画**: TopBar＋StationRail＋PipelineBoard＋ArticleRow＋StageStepper（C言語で）。要対応着地・件数バッジ・段階ステッパー。
3. **ドロワー**: 確信メーター＋公開前ゲート＋承認CTA（ロック/解錠）＋本文プレビュー。第1/第2ゲートの文言出し分け。
4. **pull型**: 依頼トレイ＋ループヘルス＋承認=依頼の往復（トースト/バッジ変化/戻り昇格）。
5. **校正レーン・素材レーン**（既存ロジック移植）。
6. **一括承認**（安全境界）＋コマンドパレット＋キーボード。
7. **レスポンシブ＋a11y仕上げ**（モバイル単一ペイン・reduced-motion・aria）。
8. 各段で tsc/eslint クリーン・コンソールエラーゼロを維持。

## 6. 比較用モック

ステージ2の方向比較は `src/app/growth/approve-proto2/style/page.tsx`（3方向の盤モック）に残置。実装が進んだら削除可。
