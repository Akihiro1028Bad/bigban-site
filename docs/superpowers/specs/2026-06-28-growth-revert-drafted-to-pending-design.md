# 下書き作成済みを承認待ち（提案中）に戻す「構成からやり直す」設計

**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。

- 日付: 2026-06-28
- 対象: グロースループ承認画面（`src/app/growth/approve/`）＋承認 API（`src/app/api/growth/`）
- 関連: 段階ガード #H9（`src/lib/growth/stageGuard.ts`）、下書きモード（`scripts/growth/prompts/drafts.md`）、修正ループ #40/#139B

## 1. 目的・背景

下書き（microCMS 下書き）まで作成済みの記事を見て「構成案・タイトルが違う」と気づいたとき、**提案中（承認待ち）に戻して構成/タイトルを直し、再承認で下書きを作り直したい**。

現状、承認画面の「承認待ちに戻す」ボタンは **決定済み（承認/却下したが下書き未生成）** のときだけ表示され、`isDraftReady`（下書き作成済み）のときは非表示（`DetailPanelView.tsx:136`）。この制約を外し、下書き作成済みからも提案中へ戻せるようにする。

### 確定した方針（ブレインストーミングでの合意）

- 用途は「**構成・タイトルのやり直し**」。戻して直して再承認 → 下書きを作り直す（既存下書き・手動編集は再生成で破棄される前提）。
- ボタンのラベルは「**構成からやり直す**」（drafted 専用表現）。
- 戻すときに**確認ダイアログ（警告）**を出す。
- **microCMS には一切触らない**。クリアするのは Notion 側の下書きリンク（`下書きID`/`下書きプレビューキー`）のみ。下書き本文HTML・アドバイス・装飾などのミラーは残してよい（contentId が空なら画面に出ず、再生成時に上書きされるため実害なし）。

## 2. 現状整理（確認済みの事実）

| 項目 | 事実 | 出典 |
|---|---|---|
| ステータスは Notion select | `提案中`/`承認`/`生成中`/`下書き作成済み`/`公開済み` 等 | `src/lib/growth/stage.ts` |
| stage 導出 | `deriveArticleStage(status, hasDraftId)`。`提案中` は status 優先で常に `proposed` | `stage.ts:39-45` |
| 下書きプレビュー表示判定 | `openHasDraft = kind==="idea" && Boolean(contentId)`。**status ではなく contentId の有無**で判定 | `ApproveClient.tsx:347` |
| 下書きリンクの Notion プロパティ | `下書きID`(=contentId) / `下書きプレビューキー`(=draftKey) | `approve.ts` `DRAFT_LINK_PROPS` |
| 既存「承認待ちに戻す」 | `postDecision(token, id, pendingStatus(kind))`（idea は `提案中`）。決定済みのみ表示 | `useApproveDecisions.ts:63` |
| 承認 POST ルート | 段階ガード無しで `updatePageSelect` を実行（`提案中` も無条件に通る） | `api/growth/approve/route.ts:107` |
| 段階ガード | `articleEditGuard(page)`：`generating`/`published` を 409 で弾き、`proposed`/`queued`/`drafted` は許可 | `stageGuard.ts:26-34` |
| 下書き再生成 | 下書きモードは `ステータス=承認` を拾い、**同じ slug で冪等PUT＝必ず作り直す**（スキップ無し） | `prompts/drafts.md` 手順1,4 |
| 確認ダイアログ | `ConfirmActionDialog` ＋ `confirmAction={kind:"publish"\|"close", id, title}` を `openConfirm`/`runConfirm` で制御 | `ApproveClient.tsx:427-466` |
| Notion 一括更新 | `updatePageProps(pageId, props, options)` で select+rich_text を**1 PATCH**で更新可能 | `notion.ts:145` |

### なぜ「contentId クリア」が必要か

ステータスだけ `提案中` に戻しても `下書きID` が Notion に残るため、`openHasDraft` が true のままになり、**提案中カラムに戻っても詳細を開くと古い下書き・アドバイス・装飾が表示される**（盤＝提案中／中身＝下書きあり、の矛盾）。下書きリンクをクリアすれば `openHasDraft=false` となり、下書き関連 UI 一式（プレビュー/アドバイス/装飾は contentId 連動でロードされる）が出なくなり、「提案中・下書きなし」のクリーンな状態に戻る。

## 3. 仕様（挙動）

### 3.1 ボタン表示

- 記事（idea）の詳細パネルで、stage が `drafted`（`isDraftReady===true`）のとき「**構成からやり直す**」ボタンを表示する。
- 表示位置は decisionActions スロット（drafted では現在 `null`）。公開/クローズ（`DraftReadyView` 内）と併存し、視覚的に「戻る/やり直す」系として区別する。
- `generating`/`published` では表示しない（従来どおり）。
- 修正ループが busy（`修正ステータス` = 依頼中/処理中/提示中）のときは無効化（古い構成案・処理中の競合を避ける。既存 `lockedForRevise` と同方針）。

### 3.2 確認ダイアログ

- クリックで `ConfirmActionDialog` を `kind:"revert"` で開く。
- 文言（例）: 「**「{タイトル}」を提案中に戻します。** 再承認すると、現在の下書き・手動編集・アイキャッチ・本文画像は作り直されます。よろしいですか？」
- 「戻す」を押すと revert 実行。「キャンセル」で何もしない。

### 3.3 revert 実行（成功時）

1. `POST /api/growth/approve/revert { pageId }` を呼ぶ。
2. サーバはページを取得し `articleEditGuard` を通す（`generating`/`published` は 409）。
3. 1 回の `updatePageProps` で **ステータス → `提案中`**、**`下書きID` → 空**、**`下書きプレビューキー` → 空** に更新。
4. クライアントは詳細パネルを閉じ、盤データを再取得（invalidate）。記事は `提案中` カラムに戻り、下書きは表示されない。

### 3.4 再承認後

- 提案中に戻った記事は、既存の構成案修正（#40）/タイトル修正（#139B）/手動編集（`/revise/edit`）で直せる。
- 「承認」すると `ステータス=承認` となり、次回の下書きモードが冪等PUTで下書きを作り直す（contentId は再生成時に Notion へ再ミラーされる）。

## 4. アーキテクチャ・変更点

### 4.1 サーバ（新規エンドポイント）

`src/app/api/growth/approve/revert/route.ts`（新規）
- `POST`：`verifyToken` → `notionOptions` → `getPage(pageId)` → `articleEditGuard(page)`（null 以外なら即返す）→ `updatePageProps(pageId, revertProps, options)`。
- `revertProps`：`{ "ステータス": {select:{name:"提案中"}}, "下書きID": {rich_text:[]}, "下書きプレビューキー": {rich_text:[]} }`。純ロジックの builder（下記）で生成。
- 失敗時は承認ルートと同方針で JSON 500/502 を返す（詳細はクライアントに漏らさない）。
- **Notion 書き込みのみ**。`NOTION_TOKEN` で足り、microCMS の管理キーは不要。

### 4.2 純ロジック

`src/lib/growth/approve.ts`（または `revert.ts` 新規・小さく保つ）
- `buildRevertProps(): NotionProps` — 上記 3 プロパティを返す純関数（テスト対象）。下書きリンクのクリアは既存の draft-link mirror builder（`notion.ts` の `DRAFT_LINK_PROPS` を使う部分）に空文字を渡す形に揃える。
- ステータス文字列 `"提案中"` は既存の `pendingStatus("idea")` と一致（重複定義を避け再利用）。

### 4.3 クライアント I/O

`src/app/growth/approve/api.ts`
- `postRevert(token, pageId): Promise<void>` — `POST /api/growth/approve/revert`。409 は「この記事は{生成中/公開済み}のため戻せません。」相当のメッセージ、その他は `error` 文言で throw。

### 4.4 クライアント状態・UI

- `ApproveClient.tsx`：`confirmAction` の `kind` に `"revert"` を追加。`runConfirm` で `kind==="revert"` のとき `postRevert` を呼び、成功で盤を invalidate＋パネルを閉じる。`openConfirm(item, "revert")` を drafted ボタンに配線。
- `ConfirmActionDialog.tsx`：`kind:"revert"` のタイトル/本文/ボタン文言を追加。
- `DetailPanelView.tsx`：`item.isDraftReady`（drafted）のとき decisionActions に「構成からやり直す」ボタンを描画（`onRevert(item)` を新規 props で受ける）。busy 時は無効化。

## 5. ステータス遷移

```
下書き作成済み(drafted, 下書きID有)
   │  「構成からやり直す」→ 確認 →
   ▼
提案中(proposed, 下書きID空)        ← 盤の提案中カラム・下書き非表示
   │  構成/タイトル修正（既存ループ）
   │  「承認」
   ▼
承認(queued) → 下書きモードが冪等PUTで作り直し → 下書き作成済み(新contentId)
```

- `生成中`/`公開済み` からは遷移不可（`articleEditGuard` が 409）。

## 6. エラー処理・ガード

- **段階ガード**：`articleEditGuard` を再利用し `generating`/`published` を 409 で拒否（UI でボタンを隠すのに加えた多層防御。承認 POST ルートが無ガードな現状への補強）。
- **busy ガード**：修正ループ busy 時は UI でボタン無効化。
- **認証**：`verifyToken`（APPROVE_SECRET）。
- **Notion 失敗**：詳細を隠して JSON エラーを返す（既存ルート踏襲）。
- **冪等性**：revert は同じ最終状態（提案中・下書きリンク空）への上書きなので再実行しても安全。

## 7. テスト計画（カバレッジ 100% 維持）

- `revert/route.test.ts`（新規・統合）：
  - 認証失敗 → 401。
  - `drafted` のページ → `updatePageProps` が「提案中＋下書きリンク空」で呼ばれ 200。
  - `generating`/`published` → 409（`articleEditGuard`）。
  - Notion 失敗 → 5xx JSON。
- `approve.ts`（または `revert.ts`）単体：`buildRevertProps()` の返り値（select=提案中・rich_text 2 件が空）。
- `api.test.ts`：`postRevert` 成功・409 文言・その他エラー文言。
- クライアント：`ApproveClient`/`DetailPanelView` で「drafted のとき構成からやり直すボタンが出る／generating・published では出ない／busy で無効／確認→postRevert→パネル閉じ＋再取得」をテスト。`ConfirmActionDialog` の `revert` 文言。

## 8. 非スコープ（YAGNI）

- microCMS 下書き本体の削除（delete API は持たない設計。オーファン下書きは無害・再生成で上書き）。
- 下書き本文HTML・アドバイス結果・装飾提案・修正案ミラーのクリア（contentId 空で非表示・再生成で上書きのため残置）。
- 決定済み（queued）の既存「承認待ちに戻す」経路の変更（contentId が無く現状で問題ないため統合しない）。
- `生成中`/`公開済み` からの巻き戻し（要件外。ユーザー判断で除外）。
- フェーズの自由巻き戻し全般（当初検討したが不要と確認）。

## 9. 受け入れ基準

- [ ] drafted の記事詳細に「構成からやり直す」ボタンが出る。
- [ ] クリックで警告つき確認ダイアログが出る。
- [ ] 確定すると Notion のステータスが `提案中`、`下書きID`/`下書きプレビューキー` が空になる（microCMS は不変）。
- [ ] 盤で提案中カラムに移動し、詳細を開いても古い下書きが表示されない。
- [ ] 再承認 → 下書きモードで下書きが作り直される。
- [ ] `生成中`/`公開済み` では UI にボタンが出ず、API も 409 で拒否する。
- [ ] 修正ループ busy 時はボタンが無効。
- [ ] 全テストグリーン・カバレッジ 100%。
