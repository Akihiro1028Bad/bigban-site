# 施策インボックス 多種別化（OUTCOME ROUTER）設計書

- 日付: 2026-06-30
- 対象: `src/app/growth/approve-proto/`（承認画面プロトタイプ #proto）
- 種別: 機能拡張・UI再設計（プロトタイプ内。本番ロジックには非干渉）
- 由来: プロUIデザイナーチーム競作(4案)→3審査員採点→統合。OUTCOME ROUTER(2/3票)を核に pragmatic-min の実装規律を接ぎ木。

## 1. 目的

施策(proposal)タブは現状「記事案」専用の形になっているが、本来は多種別の施策が入る:
- 記事案（article）— 承認→記事生成パイプライン（現状挙動）
- サイトのデザイン/表示の提案（site）— 例「ヒーローのレイアウト変更」。承認→実装タスク化
- イベント提案（event）— 例「初心者クリニックを7月開催」。承認→開催準備
- その他施策（other）— 自由（キャンペーン/SNS/クーポン等を当面ここに含める）

現状は UI・データ・承認アクションが全て記事前提（記事専用 hypothesis グリッド、proposalCategory=記事トピック、承認ボタン「承認して記事化」固定）。**承認したら何になるか（アウトカム）が種別ごとに異なる**点を正しく扱うのがゴール。

**確定した決定事項（ユーザー承認済み）**:
1. 種別の初期セットは **4種（article / site / event / other）で確定**。将来の追加は KIND_META + approveOutcomeFor に1分岐足すだけ。キャンペーン/SNS/クーポンは当面 other。
2. サイト/イベント承認の結末はプロトでは**トースト演出のみ**（バックエンド無し）。本番は pull型でNotionに依頼を書く想定を `approveOutcomeFor` の戻り値へ将来拡張。
3. `adopted`（承認済み）にも「未処理に戻す」を開放（誤承認リカバリ）。本番は「下流が走った後は戻せない」ガードが別途必要（注記のみ）。
4. `proposalCategory` は他種別では**任意の汎用タグ**として残す（非表示にしない）。

## 2. スコープ / 非スコープ

### スコープ
- `approve-proto` の施策ビュー（ProposalView）・施策追加フォーム（ProposalFormModal）・page.tsx の施策ハンドラ・types.ts の proposal 系拡張。
- 種別(kind)の導入、種別ポリモーフィックな詳細、承認アウトカムの種別分岐、結末プレビュー、種別フィルタ、追加フォームの種別選択。

### 非スコープ
- 本番ロジック（`scripts/growth/*`・`src/lib/growth/*`・`src/app/[locale]/*`）。
- 実際の下流処理（Notion起票・カレンダー登録等）。プロトはトーストで表現。
- AI往復UI（前タスクで完了）・記事承認フロー本体。

## 3. 設計方針（核）

**承認とは「種別ごとに違う下流アーティファクトへの変換」**であり、その変換を**承認ボタンの直上で結末プレビューとして可視化**する。これが OUTCOME ROUTER の核。実装は pragmatic-min の規律（KIND_META 一本集約・ProposalDetailBody 1ファイル・ConsultCard の「discriminantで本体差し替え」作法の踏襲）で最小破壊にまとめる。

**境界**:
- 変えるのは「詳細の中段本体（kind で差し替え）」と「承認の出口（ラベル＋結末＋トースト）」の2点に意図的に絞る。
- master-detail 骨格・状態グルーピング（pending/rejected/adopted）・却下フロー・evidence・active黄帯は**温存**。

## 4. 情報設計（IA）

二軸は直交。**状態が主・種別が従**。

| 軸 | 値 | UIでの扱い |
|---|---|---|
| 状態 `proposalStatus`（既存） | pending / rejected / adopted | 一覧の縦グルーピング主軸（現状の STATUS_META / ORDER 温存） |
| 種別 `proposalKind`（新） | article / site / event / other | カード先頭の色付きchip、詳細本体の切替、承認の結末分岐 |

- グルーピングは状態のまま据え置く（種別で縦割りにしない。理由: レビュアーの第一関心は「未処理が何件か」、master-detail 対称性の維持、空レーン回避=YAGNI）。
- **種別フィルタ**: 一覧ヘッダ直下に種別フィルタchip行を1段追加（すべて/記事/サイト/イベント/その他、件数付・既定=すべて・単一トグル）。グルーピングは状態のまま、絞り込みだけ種別で行う。実装は `proposals.filter` に1条件。

## 5. 種別の視覚言語（新色を増やさない）

既存トークンを割り当てるだけ。色はアイコンと種別chipの**文字色にのみ**乗せ、面は塗らない（地は `--p-bg-active`）。すべて `KIND_META` Record に集約（ConsultCard の KIND_LABEL と同作法）。

| kind | ラベル | アイコン（icons.tsx に実在するもの） | 色トークン |
|---|---|---|---|
| article | 記事 | IconFileText | --p-accent（黄） |
| site | サイト | IconLayout | --p-purple |
| event | イベント | IconCalendar | --p-green |
| other | その他 | IconBolt | --p-text-3（無彩） |

> ※ 実在アイコンのみ使用。`other` は IconBolt。アイコンが無ければ実装時に icons.tsx の在庫を確認して最も近いものを選ぶ。

## 6. 一覧UI

現状カード（title → category chip → evidence chips）の**1行目に種別chip（アイコン＋ラベル）を足すだけ**:
- 1行目: 種別chip（色は文字/アイコンのみ）＋ タイトル
- 2行目: `proposalCategory` chip（記事で主に意味、他種別では汎用タグ・無くても成立）
- 3行目: `evidence` chips（種別共通・最大3）

`active` の黄左帯は現状のまま。**周辺視の色情報を二系統にしない**ため種別色はchip側に閉じる（3px種別帯は不採用）。

## 7. 詳細UI（種別ポリモーフィック）

詳細の3層（ヘッダ / 本体スクロール / フッタ）を維持。**差し替えるのは中段の本体だけ**。新規 `ProposalDetailBody.tsx`（kind 4分岐）に切り出す。各 kind は現 hypothesis グリッドと同じラベル/値の言語で揃える。

- **article**: 現状 `hypothesis` 6項目グリッド（記事タイプ/狙う読者/検索意図/勝ち筋/成功指標/想定CTA）を**そのまま移植**。
- **site**: 縦積み — 何を変える（whatChange）/ どこを（whereTarget）/ なぜ（whyReason）＋ 任意「参考」（既存 `Article.refs: ReferenceLink[]` 流用）。
- **event**: グリッド — いつ（whenLabel・自由文）/ 対象（audience）/ 形式（format）/ 想定人数（capacity・任意）。
- **other**: 自由記述1ブロック（freeNote、ラベルなし本文）。

却下理由（proposalRejectNote）ブロックは全種別共通で本体末尾に表示（現状ロジックそのまま）。詳細はタブ化しない。

### 結末プレビュー行（フッタ・この案の核）

フッタのアクション行の直上に kind 色アイコン付き1行を常設:
- pending/rejected 時: `〈kindアイコン〉 承認すると 〈送り先〉 へ`（未来形）
- adopted 時: `✓ 〈送り先〉として起票済み`（過去形・IconCheck・--p-green）= 誤ルーティングの目視安全装置

## 8. 承認アウトカム分岐

却下・保留（未処理に戻す）は全 kind 共通。分岐するのは**承認ボタンのラベル＋結末プレビュー文＋承認後トースト**だけ。導出は純関数 `approveOutcomeFor(kind)` に集約。

| kind | 承認ボタンラベル | 結末プレビュー送り先 | 承認後トースト |
|---|---|---|---|
| article | 承認して記事化 | 記事ドラフト生成キュー | 記事生成パイプラインに送りました（＝現状挙動・記事タブへ遷移） |
| site | 承認して実装タスク化 | 実装タスク | 実装タスクに登録しました |
| event | 承認して開催準備へ | 開催準備タスク | 開催準備タスクを作成しました |
| other | 承認してタスク化 | タスク | タスクに登録しました |

- 承認ボタンの地色は全 kind `--p-accent`（黄）統一、キー `A`・IconCheck・IconArrowRight も共通（学習コストを上げない）。種別差はラベル文字列と結末プレビューのアイコン色だけ。
- `page.tsx` の `onApprove(id)` シグネチャは不変。内部で対象の kind を見てトースト文言と（記事のみ）記事化遷移を分岐。記事以外は「`adopted` にしてトースト出して一覧から消す」だけ。
- adopted の reopen 開放: フッタの「未処理に戻す」を rejected だけでなく adopted にも出す。

## 9. 追加フロー（ProposalFormModal）

ウィザード化しない（1画面のまま）。最上部に**種別セグメント**（4 chip・既定=記事）を足し、その下のフィールド群だけが種別で差し替わる。施策名・メモは全種別共通で常設。

```
施策を追加
 種別      [● 記事][ サイト ][ イベント ][ その他 ]
 施策名 *  [__________________________]
 《種別別》 記事: カテゴリchip群（既存 CATEGORIES 流用）
           サイト: 何を変える* / どこを / なぜ
           イベント: いつ / 対象 / 形式
           その他: 内容(textarea)
 メモ      [__________________________]   ← 全種別共通
```

種別別フィールドは各 kind 2〜3個に抑える。記事のカテゴリ chip 群は現状コードを article 分岐へ移設。

## 10. データモデル草案

既存 `Article` の proposal 系を**加算的に拡張**。discriminated union にはしない（既存 Article 全使用箇所への波及回避・欠落耐性・後方互換を優先＝プロト最適）。正規化は `proposalKind ?? "article"`（既存モックは kind 未設定でも従来通り記事案として動く＝ゼロ破壊移行）。

```typescript
/** 施策の種別＝承認後アウトカムのルーティング先。未設定は "article" 相当。 */
export type ProposalKind = "article" | "site" | "event" | "other";

export interface SiteProposalDetail {
  whatChange: string;   // 何を変える
  whereTarget?: string; // どこを
  whyReason?: string;   // なぜ
  // 参考は既存 Article.refs (ReferenceLink[]) を流用。新型は足さない。
}

export interface EventProposalDetail {
  whenLabel: string;    // いつ（自由文・断定しない）
  audience?: string;    // 対象
  format?: string;      // 形式
  capacity?: string;    // 想定人数（自由文）
}

// --- Article への追記（既存フィールドは無改変）---
export interface Article {
  // ...既存...
  proposalKind?: ProposalKind;      // 未設定は "article"
  siteDetail?: SiteProposalDetail;  // kind==="site"
  eventDetail?: EventProposalDetail;// kind==="event"
  freeNote?: string;                // kind==="other"
}
```

純ロジック分離（CLAUDE.md 方針・テスト可能）:

```typescript
export const KIND_META: Record<ProposalKind, { label: string; tone: string /* CSS var */ }> = {
  article: { label: "記事",     tone: "var(--p-accent)" },
  site:    { label: "サイト",   tone: "var(--p-purple)" },
  event:   { label: "イベント", tone: "var(--p-green)"  },
  other:   { label: "その他",   tone: "var(--p-text-3)" },
};

export interface ApproveOutcome {
  buttonLabel: string;  // "承認して記事化" 等
  preview: string;      // 結末プレビューの送り先名 "実装タスク" 等
  toast: string;        // 承認後トースト
  done: string;         // adopted 表示用 "実装タスクとして起票済み" 等
}

export function approveOutcomeFor(kind: ProposalKind = "article"): ApproveOutcome {
  switch (kind) {
    case "site":  return { buttonLabel: "承認して実装タスク化", preview: "実装タスク",         toast: "実装タスクに登録しました",     done: "実装タスクとして起票済み" };
    case "event": return { buttonLabel: "承認して開催準備へ",   preview: "開催準備タスク",     toast: "開催準備タスクを作成しました", done: "開催準備タスクとして登録済み" };
    case "other": return { buttonLabel: "承認してタスク化",     preview: "タスク",             toast: "タスクに登録しました",         done: "タスクとして起票済み" };
    case "article":
    default:      return { buttonLabel: "承認して記事化",       preview: "記事ドラフト生成キュー", toast: "記事生成パイプラインに送りました", done: "記事生成パイプラインへ送出済み" };
  }
}
```

アイコンは CSS var を持てないため、KIND_META とは別に kind→アイコンの対応を ProposalView/カード側で持つ（または KIND_META に icon キーを足し、tone と icon を分離）。実装時に icons.tsx の在庫で確定。

## 11. テスト方針

- 純関数 `approveOutcomeFor` をユニットテスト（全 kind ＋ 未定義フォールバック=article）。**型専用 import に保ち**、テストが他の重い proto ファイルを巻き込まないこと（前タスク同様、カバレッジ100%ゲートを波及で壊さない）。`KIND_META` は表データなので簡易検証（4 kind 揃い）。
- UI（ProposalView の種別chip/フィルタ、ProposalDetailBody の kind 分岐、結末プレビュー、フォームの種別切替）はテストが import しない薄い結線として無計測（#proto 方針）。検証は tsc + eslint + 手動（ユーザーがブラウザ確認）。

## 12. 段階実装の概略

1. 型＋純ロジック: types.ts に ProposalKind/SiteProposalDetail/EventProposalDetail ＋ Article 任意4フィールド。`approveOutcomeFor`（＋ KIND_META）を純関数として定義しユニットテスト（RED→GREEN）。
2. モックデータ: 各 kind のサンプルを page.tsx に1〜2件追加（kind 未設定の既存記事案が article 扱いで動くことを確認）。
3. 一覧: カードに種別chip、ヘッダ直下に種別フィルタchip行。グルーピング `groups` は無改修。
4. 詳細本体: `ProposalDetailBody.tsx`（新規・kind 4分岐）。ProposalView 中段の hypothesis グリッドを呼び出しに置換、article は現状グリッド移植。
5. 承認アウトカム: フッタに結末プレビュー行、承認ボタンラベルを `approveOutcomeFor(kind).buttonLabel` 参照に。page.tsx の onApprove 内で kind 別トースト＋（記事のみ）記事化遷移を分岐。
6. adopted reopen: フッタの reopen を rejected だけでなく adopted にも開放（過去形プレビュー込み）。
7. 追加フォーム: ProposalFormModal に種別セグメント＋種別別フィールドの条件表示。送信ペイロードに kind と detail を追加。

新規ファイルは実質 `ProposalDetailBody.tsx` 1つ。master-detail 骨格・状態グルーピング・却下フローは無改修でレビュー範囲が狭く安全。

## 13. 設計判断（不採用の記録）

- 「AI確信度カード（ai-native）」: 承認摩擦（確認ダイアログ）＋モックの飾りの信頼リスクで全審査員減点 → 不採用。ただし「種別の自動推定をワンタップで覆せる」思想は将来拡張余地として残す。
- 「種別で縦割りグルーピング（typed-inbox 一部）」: 空レーン＆認知負荷増 → 不採用（状態主・種別フィルタで両立）。
- discriminated union 化: 既存 Article 全使用箇所への型波及が大きい → 加算拡張＋正規化フォールバックを採用。
