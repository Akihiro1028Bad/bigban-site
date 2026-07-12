# グロースループ 承認画面「AIに相談」UX拡張 設計 — F1 全選択・F2 構成案全体指示・F3 本文全体コメント

**日付**: 2026-07-06 / **ステータス**: ドラフト / **対象**: 承認画面「AIに相談」ドロワーの相談UXを、既存3ループ(アドバイス反映 #165・構成案修正 #40・本文コメント #182)を壊さずに拡張する3機能
**体裁の手本**: `docs/superpowers/specs/2026-07-06-growth-article-quality-uplift-design.md`(記事品質アップリフト設計)
**前提コード**:
- 相談ドロワー: `src/lib/growth/consult.ts`(`STAGE_KINDS`・`ConsultKind`)・`src/app/growth/approve/consult/ConsultDrawer.tsx`・`ConsultComposer.tsx`
- F1: `src/app/growth/approve/consult/AdviceResultBody.tsx`・`src/app/growth/approve/hooks/useAdviceConsult.ts`・`scripts/growth/advise-apply.ts`(`selectApplicableFixes`/`classifyFix`/`MAX_APPLY_ITEMS`)・`src/app/api/growth/advise/apply/route.ts`(`MAX_ADOPTED=20`)
- F2: `src/app/growth/approve/ReviseCommentForm.tsx`・`src/app/growth/approve/hooks/useReviseEditing.ts`・`scripts/growth/revise.ts`(`ReviseComment{line,comment}`)・`scripts/growth/prompts/revise-outline.md`
- F3: `scripts/growth/bodyComment.ts`(`BodyComment`/`BodyCommentProposalItem`/`selectAnchoredComments`)・`src/app/api/growth/body-comment/route.ts`・`scripts/growth/comment-revise-cli.ts`・`scripts/growth/prompts/comment-revise.md`・`src/app/growth/approve/consult/CommentableBody.tsx`・`SentenceFixBody.tsx`・`src/app/growth/approve/hooks/useBodyCommentConsult.ts`

> **確定済み設計判断(ユーザー承認済み・本 spec では変更しない)**: 3機能を1仕様にまとめる。全て **pull 型・present 方式(AI は案まで・反映は人間)** を不変とする。**全体コメントは個別コメントとの併用不可(単独依頼)** — UI は全体/個別を同時に submit しない(データ構造は将来の併用を妨げない形なら可)。設計原則は既存踏襲: 純ロジック分離(`scripts/growth/*.ts`＋`src/lib/growth/*` 再エクスポート)・TDD・純ロジック100%カバレッジ・CLI/route 薄層はカバレッジ除外・pull 型・欠落耐性・沈黙させない・zod 検証(`any` 禁止)・書き込み API は `verifyToken`＋`articleEditGuard`。実装者は Codex(コード)なので、本 spec は**実装計画がそのまま書ける粒度・曖昧さゼロ(TBD 禁止)**で書く。

---

## 1. 背景・目的

### 1.1 3機能と現状の穴

承認画面「AIに相談」ドロワーは段階(`ConsultStage`)で相談モードを出し分ける(`consult.ts` `STAGE_KINDS`: outline→`["revise"]` / draft→`["overall","sentence"]`)。3ループ(アドバイス反映・構成案修正・本文コメント)は全て pull 型・present 方式で機能しているが、**「まとめて指示する」導線が3か所で欠けている**。

| # | 機能 | 現状の穴(観測される摩擦) | 規模 |
|---|---|---|---|
| **F1** | アドバイス「全て選択」 | アドバイス提示(`AdviceResultBody`)で反映可能な fix を採用するには**1件ずつチェック**する必要がある。反映可能 fix が多いと手数がかさむ。全選択/全解除の一括操作が無い。 | 小(UI のみ) |
| **F2** | 構成案の全体指示 | 構成案修正(revise)は**セクション別コメント**とタイトル指示しか送れない。「構成全体の順序を入れ替えたい」「導入と結論を対応させたい」等の**構成案全体への指示**を書く欄が無い。既存の revise ループは `ReviseComment{line,comment}` を任意 `line` で受けられる(`revise.ts` L47)のに、UI がその表現力を使っていない。 | 小(UI+プロンプト) |
| **F3** | 本文の全体コメント | 本文コメント(comment-revise #182)は**行(文)単位のコメント**しか送れない(`bodyComment.ts` `BodyComment{blockIndex, excerpt, comment}` は excerpt 必須)。「記事全体でヘッジが多い」「導入と本文のトーンがずれている」等の**本文全体へのコメント**を表現できるスキーマフィールドが無い。 | 中(スキーマ+プロンプト+UI) |

### 1.2 目的

1. **F1**: 反映可能 fix の一括採用/一括解除ボタンを `AdviceResultBody` に足し、`MAX_ADOPTED=20` でクランプする(UI のみ・API/ループ/スキーマは不変)。
2. **F2**: 構成案 revise タブに「構成案全体への指示」テキストエリアを足し、既存 revise ループへ **`line: "記事全体"` の擬似コメント**として流す(スキーマ不変・プロンプトに擬似コメントの解釈を1行追記)。
3. **F3**: comment-revise を拡張し、本文相談に**全体コメント欄**を足す。全体コメント1件から AI が**影響の大きいブロックから最大10ブロック**の before/after 案を既存 `BodyCommentProposalItem[]` 形式で提示し、既存の提示UI(`SentenceFixBody`)で人が反映する。新ループは作らない。

いずれも present 方式(AI は案・反映は人間)を不変とし、SI1 学習ログの採否記録は既存経路(draft/edit の `source`/`adoptedAspects`)に自然に乗る(§9 で確認)。

---

## 2. スコープ / 非スコープ

### 2.1 スコープ

- **F1**: `AdviceResultBody.tsx`(全選択/全解除ボタン)・`useAdviceConsult.ts`(採用集合の一括操作)。純ロジックの追加は無い(既存 `selectApplicableFixes` の結果を UI で束ねるだけ)が、**選択可能 index の導出とクランプは純ロジックに切り出してテストする**(§3.4)。
- **F2**: `ConsultComposer.tsx`(revise タブに全体指示欄)・`ReviseCommentForm.tsx`(全体指示 textarea)・`useReviseEditing.ts`(擬似コメント合成)・`scripts/growth/revise.ts`(予約語定数の追加のみ・既存スキーマ不変)・`scripts/growth/prompts/revise-outline.md`(擬似コメント解釈の追記)。
- **F3**: `scripts/growth/bodyComment.ts`(スキーマ拡張・全体コメント検証・提示項目の commentIndex 規約)＋`src/lib/growth/bodyComment.ts` 再エクスポート(既存)・`src/app/api/growth/body-comment/route.ts`(全体コメント受理)・`scripts/growth/comment-revise-cli.ts`(next で全体コメントを渡す薄い配線)・`scripts/growth/prompts/comment-revise.md`(全体コメントモードの手順追記)・`CommentableBody.tsx`(全体コメント欄)・`useBodyCommentConsult.ts`(全体コメントの送信)・`SentenceFixBody.tsx`(全体由来項目の表示は既存のまま流用)。

### 2.2 非スコープ

- **全体コメントと個別コメントの併用(同時 submit)**: 本 spec では**UI は単独依頼のみ**(全体指示 XOR 個別指示)。データ構造は将来の併用を妨げない形にするが、併用 UI・併用時の AI 挙動は作らない。
- **新ループの追加**: F3 は既存 comment-revise ループを拡張する。**新モード・新 Notion ステータス・新 run.mjs ループは作らない**(却下済み)。既存 `comment-revise-loop`/`revise-loop` がそのまま拾う。
- **新 Notion プロパティの追加**: F1/F2/F3 とも既存プロパティで完結する(§8 で検証)。F3 の全体コメントは既存 `本文コメント指示`(`BODY_COMMENT_PROPS.request`)の JSON に相乗りさせる。
- **アドバイス上限(`MAX_ADOPTED=20`/`MAX_APPLY_ITEMS=20`)の変更**: 変えない。F1 は上限内でクランプするだけ。
- **F3 の最大ブロック数を上限緩和すること**: 10ブロックは固定(§5.5)。将来の調整は別 spec。
- **`facility-context.json`・正典(文体ガイド)の記事内容ルール変更**: 本 spec は相談 UX の配管のみ。記事の書き方ルールは触らない(F2/F3 のプロンプト追記は「入力の解釈」の1〜2文に限る)。

---

## 3. F1 詳細: アドバイス「全て選択」(小・UI のみ)

### 3.1 現状の把握

- `AdviceResultBody`(`consult/AdviceResultBody.tsx`)は各 fix に採用チェックボックスを描画する(L68-81)。表示可否は `selectable && classifications[i].applicable`(L215-229)。`selectable` は「反映が『なし』かつ bodyHtml あり」の意味(親から渡る)。
- 採用集合は `useAdviceConsult.ts` の `adopted: ReadonlySet<number>`(L50)。`toggleAdopt(index)`(L90-97)が1件ずつ増減。
- 送信は `submitApply()`(L99-105)が `adoptedIndexes: [...adopted]` を `/api/growth/advise/apply` へ POST。route(`advise/apply/route.ts`)は `MAX_ADOPTED=20`(L31)で `parseAdoptedIndexes` が**超過を 400 で弾く**(L52)。サーバは `selectApplicableFixes` で再導出し index を突き合わせる(L88-89)。

### 3.2 UI 仕様(変更前→変更後)

`AdviceResultBody` の「直すべき点」見出し行(L206-213)の直下に、**全選択/全解除の操作行**を追加する。

- **表示条件**: `selectable` が true かつ「反映可能(applicable)な fix が1件以上ある」ときだけ操作行を表示する(反映可能 fix が0件のときは全選択しても意味がないため出さない)。
- **要素**: ボタン1つ「反映可能なfixを全て選択」。押下で反映可能 fix を全て採用集合へ入れる。全て採用済みのときは**同じボタンがトグルして「選択を全て外す」に変わる**(推奨=トグル1ボタン。対の2ボタンではなく状態でラベルを切り替える。理由: ドロワー幅が狭く操作行を1行に収めるため、かつ「全選択済みなら次の意図は解除」という自然な二状態のため)。
  - 判定: `選択可能 index 全て ⊆ adopted` なら「全て外す」表示・押下で該当 index を adopted から除く。そうでなければ「全て選択」表示・押下で選択可能 index(クランプ後)を adopted に足す。
- **クランプ表示**: 選択可能 fix が `MAX_ADOPTED=20` を超える場合、全選択は**先頭から20件**を採用し、操作行の右に補足テキスト「20件まで選択しました」(`aria-live="polite"` の `<span>`)を表示する。20件以下なら補足は出さない。
- **アクセシビリティ**: ボタンは `type="button"`。ラベルはテキストで自己説明的にする(追加の `aria-label` 不要)。既存の個別チェックボックス(`aria-label={修正案N を採用}`)は不変。

### 3.3 採用集合の一括操作(`useAdviceConsult.ts`)

`useAdviceConsult` に一括操作を1つ追加する。既存の `toggleAdopt` は不変。

- **追加関数** `setAdoptedBulk(indexes: readonly number[], adopt: boolean): void`:
  - `adopt=true`: `indexes` を現在の `adopted` に**和集合**で足す(既存採用は保持)。ただし結果が `MAX_ADOPTED` を超える場合は**先頭から `MAX_ADOPTED` 件**に収める(§3.4 の純ロジックでクランプ済みの配列を受け取る前提)。
  - `adopt=false`: `indexes` を `adopted` から**差集合**で除く。
  - 実装は immutable(`new Set(prev)` を作って足し引き)。
- 記事切替(`pageId` 変化)で `adopted` を空へリセットする既存挙動(L55-60)は不変。全選択状態も記事切替で消える。

### 3.4 選択可能 index の導出とクランプ(純ロジック・テスト対象)

全選択が「どの index を採用するか」は決定的に定まるべきで、UI に散らさず純ロジックにする。`scripts/growth/adviseApply.ts` に純関数を1つ追加する(既存 `selectApplicableFixes` の隣)。

```
/** 全選択で採用する fix index を決定的に返す。classifications と同順。
 *  applicable な index を出現順に集め、max 件でクランプする(超過は先頭優先で切る)。 */
export function selectableAdoptIndexes(
  classifications: readonly { applicable: boolean }[],
  max: number
): number[]
```

- **入力**: `AdviceResultBody` が受け取るのと同じ `classifications`(advice.fixes と同順・同長)＋上限 `max`(呼び出し側が `MAX_ADOPTED` を渡す)。
- **出力**: `applicable === true` の index を**出現順**に集め、`max` を超えたら**先頭から max 件**に切った配列。`max <= 0` は空配列。
- **クランプの一貫性**: サーバ(`advise/apply/route.ts`)は同じ `MAX_ADOPTED` で超過を弾く。UI 側で先頭 max 件に収めておけば、全選択→送信が 400 にならない(クライアントとサーバの上限が一致)。
- **UI 結線**: `AdviceResultBody` は自身が持つ `classifications` から `selectableAdoptIndexes(classifications, MAX_ADOPTED)` を算出し、`selected = 結果`、`allSelected = 結果.every(i => adopted.has(i)) && 結果.length > 0` を導く。全選択ボタンは `setAdoptedBulk(結果, !allSelected)` を呼ぶ。`MAX_ADOPTED` は route の定数を UI と共有できないため、**純ロジック側に `export const MAX_ADOPTED = 20` を新設**し、route も UI もそれを import して単一ソース化する(現状 route は private 定数 L31。§3.5 で export 化)。

### 3.5 `MAX_ADOPTED` の単一ソース化

- 変更前: `advise/apply/route.ts` L31 `const MAX_ADOPTED = 20;`(route 内 private)。
- 変更後: `scripts/growth/adviseApply.ts` に `export const MAX_ADOPTED = 20;` を新設。route と UI(`AdviceResultBody`)はこれを import する。既存の `MAX_APPLY_ITEMS = 20`(反映案の zod 上限・L143)とは意味が別(採用件数 vs 反映案件数)なので統合しない。値が同じでも役割が違うため両方残す。

### 3.6 テスト対象(F1)

- **`scripts/growth/adviseApply.test.ts`(既存に追加・純ロジック100%)** › `selectableAdoptIndexes`:
  - applicable が飛び飛びに並ぶとき、applicable な index だけを出現順に返す。
  - applicable が `max` を超えるとき、先頭から `max` 件に切る。
  - applicable が0件なら空配列。`max<=0` なら空配列。
  - `max` 境界(ちょうど `max` 件)でクランプが起きない。
- **`useAdviceConsult.test.ts`(既存に追加)**: `setAdoptedBulk` の和集合(既存採用を保持)・差集合・`MAX_ADOPTED` 超過時の先頭クランプ・記事切替リセットが全選択状態にも効くこと。
- **薄い UI 配線はカバレッジ除外**: `AdviceResultBody` の操作行描画・ラベルトグル・クランプ補足表示は既存方針どおり(UI コンポーネント)テストは最小(全選択ボタン押下で `setAdoptedBulk` が期待 index で呼ばれる・全選択済みで「全て外す」表示になる、の1〜2ケース)に留める。

---

## 4. F2 詳細: 構成案の全体指示(小・UI+プロンプト)

### 4.1 現状の把握

- revise タブ(`ConsultComposer.tsx` `ReviseComposer` L104-220)は `ReviseCommentForm`＋`Section` を描画する。セクション別コメントは `useReviseEditing.ts` の `draftComments: Record<number, string[]>`(L29)に溜まり、送信時に `{ line: section.heading, comment }` へ展開される(L82-84)。
- タイトル指示は `titleRevisePrompt`(L42)= `修正タイトル指示` 専用レーン(構成案コメントとは別)。
- 依頼は `reviseMutation`(`postRevise`)→ `revise.ts` `serializeReviseInstructions`。`ReviseComment{line, comment}`(L47-50)の `line` は**任意文字列**(既存はセクション見出しを入れているだけで、スキーマ上の制約は「非空文字列」のみ・`revise.ts` L67)。

### 4.2 擬似コメント仕様(スキーマ不変・予約語で表現)

構成案全体への指示を、既存 `ReviseComment` の `line` に**予約語 `記事全体` を入れた1件の擬似コメント**として流す。スキーマ・シリアライズ・PC ループ・提示は一切変えない。

- **予約語の定数化**: `scripts/growth/revise.ts` に `export const OUTLINE_OVERALL_LINE = "記事全体";` を新設する。UI(`useReviseEditing`)・プロンプト参照はこの定数を単一ソースにする(文字列直書きしない)。
- **送信形**: 全体指示が非空のとき、`requestRevise` が組み立てる `comments` 配列に **先頭で** `{ line: OUTLINE_OVERALL_LINE, comment: <全体指示テキスト> }` を1件足す。
- **単独依頼の強制(併用不可)**: UI 上、全体指示欄に入力があるときは**セクション別コメントを同時に送らない**。実装は「全体指示が非空なら、送信 comments は全体擬似コメント1件のみ(セクションコメントは含めない)」とする。逆にセクションコメントを送るときは全体指示欄が空であることを前提にする(§4.3 で UI ガード)。タイトル指示(`修正タイトル指示`)は別レーンなので全体指示と**併走可**(タイトルは構成案本文ではないため衝突しない・既存の並走設計を踏襲)。

### 4.3 UI 仕様(変更前→変更後)

`ReviseCommentForm.tsx` に「構成案全体への指示」textarea を追加する。位置はタイトル指示欄(L40-53)とセクション一覧(L54-56)の**間**(タイトル=記事名 → 構成全体 → セクション別、の粒度順)。

- **要素**: `label`「構成案全体への指示（任意）」＋ `textarea`(`rows={2}`・`maxLength={500}`・`disabled={busy}`)。placeholder 例「導入と結論を対応させ、2章と3章の順序を入れ替えたい」。文字数カウンタ(既存 overall と同じ `n / 500`)。
- **state**: `useReviseEditing.ts` に `outlineOverallPrompt`/`setOutlineOverallPrompt` を追加(`titleRevisePrompt` と同じ扱い)。`openId` 変化のリセット(L67-77)に `setOutlineOverallPrompt("")` を追加する。
- **併用ガード(単独依頼)**:
  - 全体指示欄が非空のとき: セクション別の「＋ コメント」操作を**無効化**し、補足「構成案全体への指示中は、セクション別コメントは送れません（どちらか一方）」を表示する。逆に、セクション別コメントが1件でも溜まっているとき: 全体指示 textarea を**無効化**(`disabled`)し、同趣旨の補足を出す。**先に入力した方が優先**(両方空のときだけ両方入力可能な初期状態)。
  - この排他は UI のみ。送信ロジック(§4.2)は「全体指示が非空なら全体擬似1件のみ」で二重に担保する(UI をすり抜けても送信が正しくなる)。
- **依頼ボタンの活性条件**(`ReviseCommentForm` L60): 変更前 `commentTotal === 0 && !hasTitlePrompt` で無効 → 変更後 `commentTotal === 0 && !hasTitlePrompt && !hasOutlineOverallPrompt` で無効(全体指示だけでも依頼可能にする)。ボタン内カウント表示は既存の `（コメント${commentTotal}件）` を維持し、全体指示のみのときはカウント無し。

### 4.4 `requestRevise` の合成(`useReviseEditing.ts` L80-106)

- 変更前(L82-84): `comments = sections.flatMap((section, i) => (draftComments[i] ?? []).map(c => ({ line: section.heading, comment: c })))`。
- 変更後(方針):
  ```
  const overall = outlineOverallPrompt.trim();
  const comments = overall
    ? [{ line: OUTLINE_OVERALL_LINE, comment: overall }]                 // 全体指示 → 全体擬似1件のみ(併用不可)
    : sections.flatMap((section, i) =>
        (draftComments[i] ?? []).map((c) => ({ line: section.heading, comment: c })));
  ```
- タイトル指示(`titleInstruction`)の合成・楽観更新(`reviseStatus: "依頼中"`)・成功時クリア(`setDraftComments({})`)は不変。成功時に `setOutlineOverallPrompt("")` も加える。
- **予約語衝突の注意(§4.5)を UI 側でも担保**: 見出しが「記事全体」のセクションがあっても、全体指示欄が空ならセクションコメントは従来どおり `{ line: "記事全体", comment }` で送られる。PC 側は「line が `記事全体` のコメント」を全体指示として解釈するため、この場合**見出し由来の `記事全体` が全体指示と誤認される**。§4.5 でこの衝突を仕様として塞ぐ。

### 4.5 予約語 `記事全体` が実在の見出しと衝突するリスクの扱い

`line: "記事全体"` は「セクション見出し」の名前空間と「予約語」を共有するため、**構成案に「記事全体」という見出しが実在すると、そのセクションへのコメントが全体指示に化ける**。以下で決定的に塞ぐ。

- **送信側の規約**: 全体指示は §4.2 のとおり **`comments` の先頭1件**に限る。セクション由来コメントは §4.4 のとおり「全体指示欄が空のときだけ」送られる。よって**送信 comments に `記事全体` が2件以上現れることはない**(全体指示は単独依頼なので、全体指示ありのときセクションコメントは0件)。
- **PC(revise-outline)側の規約**: プロンプトに「`line` が `記事全体` の**先頭コメント**を構成案全体への指示として扱う。それ以外の `line` は見出しアンカー(該当セクションへのコメント)として扱う」と明記する。全体指示は単独依頼なので、`記事全体` は常に単独1件で届く。
- **残る境界ケース(見出し名が `記事全体`)**: 全体指示欄が空でセクション別コメントを送るとき、`記事全体` という見出しへのコメントは `{ line: "記事全体", comment }` になる。この1件だけが送られる場合、PC は「全体指示」と解釈する(見出しコメントとして扱われない)。これは**低頻度かつ実害が小さい**(構成案全体を見て直すのは見出し1つを直すことを含む)。ただし混同を避けるため、**構成案テンプレート/文体ガイドで見出しに予約語 `記事全体` を使わない**運用注記を `revise-outline.md` の禁止節に1行足す(コード側のバリデーションは追加しない=欠落耐性・過剰防御を避ける)。予約語を英数字混じりの衝突しない文字列にする案は、Notion 上の可読性(人が JSON をたまに見る)を損なうため採らない。

### 4.6 プロンプト変更文(`scripts/growth/prompts/revise-outline.md`)

手順3の「構成案」節(L28-30)に、擬似コメントの解釈を追記する。**変更前**は各 `line` を見出しアンカーとしてのみ扱う。**変更後**(追記文・確定):

- 手順3「構成案」の冒頭に1文追加:
  > `instructions` のうち、**`line` が `記事全体` のコメントは特定セクションではなく構成案全体への指示**として扱う(順序の入れ替え・章立ての再構成・導入と結論の対応づけ 等)。それ以外の `line` は該当見出しへのコメントとして扱う。全体指示は単独で届く(セクション別コメントとは同時に来ない)。
- 「禁止」節に1行追加:
  > 構成案の見出しに予約語 `記事全体` を使わない(全体指示コメントと区別できなくなるため)。

これ以外の手順(present/fail/stale・出力は見出しアウトラインのみ)は不変。

### 4.7 テスト対象(F2)

- **`scripts/growth/revise.test.ts`(既存に追加・純ロジック100%)**:
  - `OUTLINE_OVERALL_LINE` を `line` に持つ擬似コメントが `serializeReviseInstructions`/`parseReviseInstructions` を素通りする(スキーマ不変=`line` 非空文字列なので既に通るが、予約語で通ることを回帰テストで固定)。
  - `serializeReviseInstructions([{line: OUTLINE_OVERALL_LINE, comment: "..."}])` が正しい JSON になる。
- **`useReviseEditing.test.ts`(既存に追加)**: 全体指示が非空 → 送信 comments が `[{line:"記事全体", comment}]` 1件のみ(セクションコメントを含めない)。全体指示が空 → 従来どおりセクション展開。全体指示のみでも `requestRevise` が発火する(ボタン活性)。`openId` 変化で `outlineOverallPrompt` がリセットされる。
- **UI 排他(`ReviseCommentForm`)**: 全体指示入力中はセクション「＋コメント」無効・セクションコメントありのとき全体指示 textarea 無効、の1〜2ケース。薄い UI 配線はカバレッジ最小。

---

## 5. F3 詳細: 本文の全体コメント(中・スキーマ+プロンプト+UI)

### 5.1 現状の把握と穴

- 本文コメントのコメント型は `BodyComment{ blockIndex: int>=0, excerpt: string(1-2000), comment: string(1-2000) }`(`bodyComment.ts` L111-116)。`excerpt` 必須＋`anchorExists`/`selectAnchoredComments` で**アンカー再検証**(L100-147)。**全体コメント(特定ブロックに紐づかない)を表現できない**。
- 提示型は `BodyCommentProposalItem{ commentIndex: int(0..MAX_BODY_COMMENTS), before(1-5000), after(1-8000) }`(L151-159)。`commentIndex` は「送ったコメント配列内の index」。UI(`SentenceFixBody`)は `commentIndex` を key に描画し、`applyBodyCommentProposal` が `before` 照合で決定的反映する(excerpt には依存しない)。
- route(`body-comment/route.ts`)は `BodyCommentsSchema`(=全件 excerpt 必須)で検証し `selectAnchoredComments` でアンカーできない全コメントを落とす。**全体コメントは excerpt を持てないため現状は必ず落ちる**。
- 依頼は `本文コメント指示`(`BODY_COMMENT_PROPS.request`)に**コメント配列 JSON** として1プロパティに載る。CLI `next` はそれを `row.request` として claude に渡す(`comment-revise-cli.ts` L153)。

### 5.2 スキーマ拡張の確定形

全体コメントは「blockIndex/excerpt を持たない全体スコープのコメント」。**別フィールドで表現する**(既存 `BodyComment` を optional 化して意味を濁らせない・既存アンカー検証を壊さない)。依頼プロパティの JSON を **オブジェクト**に変え、`comments`(既存の行コメント配列・後方互換)と `overall`(全体コメント・任意)を持たせる。

```
// bodyComment.ts に追加
export const BodyCommentRequestSchema = z.object({
  comments: z.array(BodyCommentSchema).max(MAX_BODY_COMMENTS).default([]),
  overall: z.string().min(1).max(2000).optional(),
});
export type BodyCommentRequest = z.infer<typeof BodyCommentRequestSchema>;
```

- **後方互換(移行)**: 既存の `本文コメント指示` は**コメント配列 JSON(`BodyComment[]`)**が直に入っている。`parseBodyCommentRequest(raw)` を新設し、**配列 JSON なら `{comments: 配列, overall: undefined}` に読み替える**(旧形の読み出し互換)。オブジェクト JSON なら `BodyCommentRequestSchema.safeParse`。壊れていれば `{comments: [], overall: undefined}`(安全側)。これにより在庫の旧依頼行も落ちない。
- **書き込み**: `buildBodyCommentRequestProps` を「`BodyCommentRequest` を受けて `本文コメント指示` にオブジェクト JSON を書く」形に変える(内部で `BodyCommentRequestSchema.parse`＋`serialize`)。既存呼び出し(route)は `{comments}` か `{overall}` のどちらかを渡す。**単独依頼**なので両方同時には渡さない(§2.2・§5.4)。
- **不変**: `BodyComment`/`BodyCommentSchema`/`anchorExists`/`selectAnchoredComments`/`BodyCommentProposalItemSchema`/`applyBodyCommentProposal` は変えない(行コメントの安全機構をそのまま維持)。

### 5.3 検証分岐(route: `body-comment/route.ts`)

route は「全体コメント単独」か「行コメント単独」かを受理する(併用不可)。

- リクエスト body に **`overall?: string` と `comments?: BodyComment[]`** を受ける。判定:
  1. `overall` が非空文字列で `comments` が空/未指定 → **全体コメントモード**。`overall` を `BodyCommentRequestSchema`(overall 分岐)で検証し、`buildBodyCommentRequestProps({ overall })` を書く。**アンカー検証は不要**(全体コメントはブロックに紐づかない)。`articleEditGuard`・busy(409)・`verifyToken` は既存どおり適用。
  2. `comments` が非空で `overall` が空/未指定 → **行コメントモード**(現状のまま)。`BodyCommentsSchema` 検証 →`selectAnchoredComments` → 0件なら 400 → `buildBodyCommentRequestProps({ comments: anchored })`。
  3. 両方非空 → **400「全体コメントと個別コメントは同時に送れません（どちらか一方）」**(併用不可を明示。UI が防ぐが二重防御)。
  4. 両方空 → 400「コメントを入力してください。」。
- 500(NOTION_TOKEN 欠落)・`growthApiError` 経路は不変。

### 5.4 依頼→ループ→提示のデータ表現

- **依頼(Notion)**: `本文コメント指示` = `{"comments":[...], "overall":"..."}` のオブジェクト JSON(単独依頼なので実際はどちらか片方のみ非空)。`本文コメントステータス=依頼中`・`本文コメント依頼時刻` は既存の `buildBodyCommentRequestProps` が同一 PATCH で書く(内部を新スキーマ対応にするだけ)。
- **CLI `next`(`comment-revise-cli.ts`)**: 現状 `row.request`(生 JSON 文字列)をそのまま `comments` キーで渡す(L153)。**変更**: `bodyCommentRowFromPage` が返す `request`(生文字列)を、CLI が `parseBodyCommentRequest` で正規化し、claude へ渡す JSON を `{ pageId, comments, overall, bodyHtml }` にする(`overall` は無ければ省略)。これは薄い配線(カバレッジ除外)。正規化ロジック(`parseBodyCommentRequest`)は純ロジック側でテスト。
  - `bodyCommentRowFromPage`(`bodyComment.ts` L365-373)は `request: string`(生)を返すまま**変えない**(行の生データはそのまま持ち、解釈は CLI/純ロジックが行う)。
- **提示(present)**: claude は `BodyCommentProposalItem[]` を JSON で返し、`present` サブコマンドが `parseBodyCommentProposal`→`serializeBodyCommentProposal`→`buildBodyCommentPresentProps` で「提示中」にする(**現状のまま不変**)。
- **反映(人間)**: `SentenceFixBody`＋`applyBodyCommentProposal`(before 照合で決定的反映)→ `/api/growth/draft/edit`(`source: "comment-revise"`)。**不変**(§9 で採否記録を確認)。

### 5.5 全体コメント由来項目の `commentIndex` の扱い(確定)

`BodyCommentProposalItem.commentIndex` は「送ったコメント配列内の index」を指す規約だが、**全体コメントは `comments` 配列に無い**(overall は配列外)。以下で確定する。

- **規約**: 全体コメントモードでは、claude が返す各 `BodyCommentProposalItem` の `commentIndex` は **`comments` 配列の index ではなく、その依頼内での提示項目の連番(0,1,2,…)** とする。全体コメントは論理的に「唯一のコメント」なので、全体由来の提示項目は**全て同一の全体コメントに帰属**する。`commentIndex` は UI の React key と「何番目の提案か」の識別にのみ使われ(`SentenceFixBody` L60 `key={item.commentIndex}`)、**反映は `before` 照合で決まり `commentIndex` に依存しない**(`applyBodyCommentProposal` L210-227)。よって連番で安全。
- **スキーマ上限**: `commentIndex` の zod 上限は `max(MAX_BODY_COMMENTS)=50`(L153)。全体由来の連番は**最大10**(§5.5 のブロック上限)なので上限内。スキーマ変更不要。
- **プロンプトでの明示**: comment-revise.md の全体コメント手順で「`commentIndex` は 0 から始まる提示項目の連番を入れる(全体コメントは配列 index を持たないため)」と書く。
- **提示 UI**: `SentenceFixBody` は `commentIndex` を key に描画するだけなので**変更不要**。全体由来でも行由来でも同じ「元 → 新」リスト＋一括反映で表示される。

### 5.6 最大10ブロックの根拠と超過時挙動

- **根拠**: 全体コメント1件から AI が本文全体を書き換えると、diff が大きくなり人の確認コスト・誤反映リスクが増す。既存の反映案上限は `BodyCommentProposalSchema = array().max(MAX_BODY_COMMENTS=50)`(L161)だが、全体コメントで50ブロック提示は「人が1件ずつ before/after を確認する」present 方式の前提を崩す。**影響の大きいブロックから最大10**に絞ることで、(a)確認可能な粒度に保ち、(b)「全体を薄く全部いじる」より「効くところを厚く直す」方向へ寄せる。10 は「1画面で俯瞰できる提案数」の実務的上限。
- **定数**: `bodyComment.ts` に `export const OVERALL_COMMENT_MAX_BLOCKS = 10;` を新設。プロンプトはこの値を参照(文言に「最大10ブロック」と明記)。
- **超過時挙動(確定)**: 10件制限は**プロンプトの上限指示のみ**で担保し、コードでの10クランプは入れない。present の既存 zod 上限(`max(MAX_BODY_COMMENTS)=50`)がハードガードとして残る。理由: present サブコマンドは「全体由来か行由来か」を区別しない設計(proposal JSON を受けるだけ)で、10クランプをコードに入れるには CLI へモード判定を持ち込む必要があり、過剰防御になる。`OVERALL_COMMENT_MAX_BLOCKS=10` 定数はプロンプト文言と将来のコードガード導入時の単一ソースとして新設だけする。§5.6 の実装は「定数新設＋プロンプト明記」のみ。

### 5.7 プロンプト変更方針(`scripts/growth/prompts/comment-revise.md`)

手順2(次の依頼を取得)と手順3(書き換え案を作る)に全体コメント分岐を追記する。

- **手順2 の JSON 説明**(L16-20)に追記: `next` の JSON は `{"pageId","comments","overall","bodyHtml"}`。`comments` = 行コメント配列(空のこともある)。`overall` = **本文全体へのコメント**(空/無いこともある)。**`overall` が非空のときは全体コメントモード**(行コメントは来ない=単独依頼)。
- **手順3 に全体コメントモードの節を追加**(確定文の骨子):
  > `overall`(全体コメント)が来たら、本文全体を読み、その指摘に**最も影響の大きいブロックから最大10ブロック**を選んで書き換える。各ブロックは既存の行コメントと同じ `{ "commentIndex", "before", "after" }` 形式で出す。
  > - `commentIndex` は **0 から始まる提示項目の連番**を入れる(全体コメントは配列 index を持たないため)。
  > - `before` は対象ブロックの現在 HTML を**完全一致**で入れる(照合に使う)。11 ブロック以上は出さない(多くても効く 10 に絞る)。
  > - 事実・数値・固有名詞・確定情報は変えない/未確定情報を足さない(既存の禁止と同じ)。翻訳調・AI 臭(§14)を避ける。
- 手順4(present)・手順5(fail)・禁止節は不変(全体でも行でも present/fail は同じコマンド)。

### 5.8 UI 仕様(`CommentableBody.tsx`・`useBodyCommentConsult.ts`)

sentence タブ(`CommentableBody`)に全体コメント欄を足す。行コメント UI(行ごと `openComposer`)は不変。

- **全体コメント欄**: 行リスト(L32-132)の**上**に「本文全体へのコメント」ブロックを置く。`label`＋`textarea`(`rows={2}`・`maxLength={2000}`・placeholder「例：全体にヘッジが多い。言い切る文体に寄せたい」)＋文字数カウンタ。送信ボタン「**全体コメントで修正を依頼**」。
  - **ラベルの衝突回避(確定)**: 既存の overall タブ「全体を見てもらう」(advise=助言のみ・本文は書き換えない)と紛れないよう、「見てもらう」という語は使わない。全体コメント欄の直下に補足1行「※採点や助言だけが欲しいときは『全体を見てもらう』タブへ」を置き、2機能の違い(助言 vs 修正案)を導線で示す。
- **併用ガード(単独依頼)**: 全体コメント欄が非空のとき、行コメントの「＋」ボタンを無効化＋補足「本文全体へのコメント中は、行コメントは送れません（どちらか一方）」。逆に行コメントが1件でも溜まっているとき、全体 textarea を `disabled`。既存の合計 `total = ic.buildPayload().length`(L29)で行コメント有無を判定。先に入力した方が優先。
- **`useBodyCommentConsult.ts` 追加**:
  - state `overallDraft`/`setOverallDraft`。`pageId` 変化のリセット(L67-73)に `setOverallDraft("")` を追加。
  - 関数 `requestOverall(): Promise<void>`: `overallDraft.trim()` が空なら no-op。非空なら `post("/api/growth/body-comment", { pageId, overall: overallDraft.trim() }, "依頼に失敗しました。")`。成功で `setOverallDraft("")`。
  - 既存 `requestAi`(行コメント)は `{ pageId, comments: payload }` を送るまま。route の分岐(§5.3)がモードを判定する。
- **提示表示**: 提示中(`bodyComment.status === "提示中"`)は既存 `SentenceFixBody`＋`applyNow`(`applyBodyCommentProposal`)で表示・反映(**不変**)。全体由来でも `BodyCommentProposalItem[]` なので同じ UI が動く。

### 5.9 テスト対象(F3)

- **`scripts/growth/bodyComment.test.ts`(既存に追加・純ロジック100%)**:
  - `BodyCommentRequestSchema`: `{comments:[...]}` のみ・`{overall:"..."}` のみ・両方・`overall` 空文字(min1 で reject)・`comments` 50件超過(reject)。
  - `parseBodyCommentRequest`: 旧形(配列 JSON)→ `{comments:配列, overall:undefined}` に読み替え・オブジェクト JSON → そのまま・壊れた JSON → `{comments:[], overall:undefined}`・overall のみのオブジェクト。
  - `buildBodyCommentRequestProps({overall})`/`({comments})`: `本文コメント指示` にオブジェクト JSON・ステータス=依頼中・依頼時刻が同一 props に載る。旧呼び出し互換(comments のみ)で既存テストが green。
  - `OVERALL_COMMENT_MAX_BLOCKS === 10`(定数の回帰固定)。
- **`body-comment/route.test.ts`(既存に追加)**: overall 単独で 200＋overall がプロパティに載る/comments 単独で従来どおり/両方非空で 400/両方空で 400/busy 409・authGuard は既存のまま。
- **`useBodyCommentConsult.test.ts`(既存に追加)**: `requestOverall` が overall を送る・空で no-op・成功でクリア・`pageId` 変化でリセット・全体と行の排他(片方入力でもう片方が送られない)。
- **薄い配線はカバレッジ除外**: `comment-revise-cli.ts` の `next` 正規化(`parseBodyCommentRequest` を呼んで `{comments, overall}` を渡す配線)・`CommentableBody` の全体欄描画。純ロジック(`parseBodyCommentRequest`・スキーマ)を100%で固める。

---

## 6. データフロー(3機能共通: 依頼→ループ→提示→反映)

3機能とも pull 型・present 方式で、同じ4段を通る。AI は案までで、反映は人間。

```
[承認画面(Vercel)]            [Notion(記事ネタ案 行)]        [常時稼働PC(run.mjs ループ)]        [人間]
  依頼(単独) ──POST 書込API──▶ 依頼プロパティ＋ステータス=依頼中 ◀──next で1件ロック(処理中)── ループが拾う
                                                                    claude が案を生成(創作のみ)
                              提示プロパティ＋ステータス=提示中 ◀──present で書込＋LINE通知──
  提示を表示 ◀──ポーリング(board 再取得)──                                                      差分を確認
  決定的反映(applyX)→draft/edit(source)──▶ 下書き本文HTML 更新・依頼状態クリア                    「反映」を押す
```

| 段 | F1(アドバイス反映) | F2(構成案全体指示) | F3(本文全体コメント) |
|---|---|---|---|
| 依頼 | `advise/apply`(採用 index・**全選択でまとめて**) | `postRevise`(全体擬似コメント `line:記事全体`) | `body-comment`(`overall` 単独) |
| プロパティ | `アドバイス反映指示`/`...ステータス` | `修正指示`/`修正ステータス` | `本文コメント指示`(overall 入り)/`本文コメントステータス` |
| ループ | advise-apply(run.mjs) | revise(revise-outline.md) | comment-revise(comment-revise.md) |
| 提示 | `AdviceApplyView.proposal` | `修正案`(構成案) | `本文コメント案`(`BodyCommentProposalItem[]`) |
| 反映 | `applyAdviceItems`→draft/edit(`source:advise-apply`) | `buildReviseApplyProps`→構成案上書き | `applyBodyCommentProposal`→draft/edit(`source:comment-revise`) |

- **F1 は「依頼の作りやすさ」だけを変える**(全選択でまとめて採用)。ループ以降は既存のまま。
- **F2/F3 は「依頼の表現力」を変える**(全体スコープの指示を追加)。プロパティ・ループ・提示・反映は既存を流用。
- いずれも**単独依頼**(F2 全体 XOR セクション / F3 全体 XOR 行)。busy(依頼中/処理中/提示中)は既存の 409 ガードで多重依頼を防ぐ。

---

## 7. テスト戦略

> TDD 必須・純ロジックは100%カバレッジ。CLI・route 薄層・UI コンポーネント配線は既存の `coverage.exclude` 方針どおり最小確認。

### 7.1 純ロジックのユニットテスト対象一覧

| 対象(`scripts/growth/*.test.ts`) | 検証内容 | 機能 |
|---|---|---|
| `adviseApply.test.ts` › `selectableAdoptIndexes` | applicable index の出現順抽出・`max` 先頭クランプ・0件/`max<=0` で空・境界 | F1 |
| `revise.test.ts` › `OUTLINE_OVERALL_LINE`＋serialize/parse | 予約語 `line` の擬似コメントが serialize/parse を素通り(回帰固定) | F2 |
| `bodyComment.test.ts` › `BodyCommentRequestSchema`/`parseBodyCommentRequest`/`buildBodyCommentRequestProps` | overall/comments の各分岐・旧形配列 JSON の読み替え・壊れ JSON の安全側・上限・`OVERALL_COMMENT_MAX_BLOCKS=10` 固定 | F3 |

### 7.2 フック/route のテスト(既存に追加)

| 対象 | 検証内容 | 機能 |
|---|---|---|
| `useAdviceConsult.test.ts` › `setAdoptedBulk` | 和集合/差集合・`MAX_ADOPTED` 超過クランプ・記事切替リセット | F1 |
| `useReviseEditing.test.ts` › `requestRevise`/`outlineOverallPrompt` | 全体指示のみ→擬似1件・空→セクション展開・全体のみで発火・リセット | F2 |
| `body-comment/route.test.ts` | overall 単独200・comments 単独200・両方400・両方空400・busy409・authGuard | F3 |
| `useBodyCommentConsult.test.ts` › `requestOverall` | overall 送信・空 no-op・成功クリア・排他・リセット | F3 |

### 7.3 プロンプト変更の検証(次回相談実行での確認観点)

`revise-outline.md`/`comment-revise.md` の追記はユニットテストで測れない。次回の相談実行で確認する。

| 観点 | 確認内容 | 機能 |
|---|---|---|
| F2 全体指示の解釈 | `line:記事全体` の全体指示で、AI が特定セクションでなく構成全体(順序・章立て)を直す | F2 |
| F2 予約語衝突 | 見出しに `記事全体` を使わない注記が守られ、セクションコメントが誤って全体指示化しない | F2 |
| F3 全体コメントの提示 | overall 1件で、AI が影響の大きい最大10ブロックの before/after を提示する | F3 |
| F3 反映 | 全体由来の提示が既存 `SentenceFixBody`＋一括反映で正しく本文へ入る(commentIndex 連番でキー衝突しない) | F3 |

---

## 8. 実装フェーズ分割(F1→F2→F3 の順)

> 影響範囲の小さい順。各機能は独立してマージ可能(相互依存なし)。TDD(Red→Green→Refactor)で純ロジック→フック/route→UI 配線の順に固める。

### フェーズ F1(アドバイス「全て選択」)

**内容**:
1. `adviseApply.ts` に `export const MAX_ADOPTED = 20;`＋`selectableAdoptIndexes` を新設(§3.4/§3.5)＋`adviseApply.test.ts`(TDD・100%)。
2. `advise/apply/route.ts` の private `MAX_ADOPTED` を新設 export の import に置換(挙動不変)。
3. `useAdviceConsult.ts` に `setAdoptedBulk`(§3.3)＋テスト。
4. `AdviceResultBody.tsx` に全選択/全解除トグル行＋クランプ補足(§3.2)。

**完了条件**:
- `selectableAdoptIndexes` が applicable index を出現順に集め `MAX_ADOPTED` で先頭クランプ。テスト100% green。
- 全選択→送信が `MAX_ADOPTED` 超過でも 400 にならない(UI とサーバの上限一致)。
- 全て採用済みでボタンが「全て外す」にトグルし、押下で該当 index が外れる。
- `MAX_ADOPTED` が単一ソース(route と UI が同じ定数を import)。

### フェーズ F2(構成案の全体指示)

**内容**:
1. `revise.ts` に `export const OUTLINE_OVERALL_LINE = "記事全体";`＋回帰テスト(§4.2/§4.7)。
2. `useReviseEditing.ts` に `outlineOverallPrompt` state＋`requestRevise` の合成分岐(§4.4)＋リセット＋テスト。
3. `ReviseCommentForm.tsx` に全体指示 textarea＋排他ガード＋ボタン活性条件(§4.3)。
4. `revise-outline.md` に擬似コメント解釈＋予約語禁止の追記(§4.6)。

**完了条件**:
- 全体指示のみで依頼でき、送信 comments が `[{line:"記事全体", comment}]` 1件(セクションコメントを含めない)。
- 全体指示とセクションコメントが UI で排他(先入力優先)。タイトル指示とは併走可。
- `revise-outline.md` が `line:記事全体` を全体指示として扱い、見出しに予約語を使わない旨を明記。
- 既存 revise スキーマ・PC ループ・present/apply は不変(回帰 green)。

### フェーズ F3(本文の全体コメント)

**内容**:
1. `bodyComment.ts` に `BodyCommentRequestSchema`/`parseBodyCommentRequest`/`OVERALL_COMMENT_MAX_BLOCKS`＋`buildBodyCommentRequestProps` の新スキーマ対応(§5.2/§5.6)＋`bodyComment.test.ts`(TDD・100%・旧形互換含む)。
2. `body-comment/route.ts` の overall/comments 分岐(§5.3)＋route テスト。
3. `comment-revise-cli.ts` の `next` 正規化(`parseBodyCommentRequest`→`{comments,overall}`)配線(§5.4・薄層)。
4. `comment-revise.md` に全体コメントモードの手順追記(§5.7)。
5. `useBodyCommentConsult.ts` に `overallDraft`＋`requestOverall`＋排他＋リセット(§5.8)＋テスト。
6. `CommentableBody.tsx` に全体コメント欄＋排他ガード(§5.8)。

**完了条件**:
- `本文コメント指示` がオブジェクト JSON(`{comments,overall}`)になり、**旧形(配列 JSON)も落ちず読める**(移行耐性)。テスト100% green。
- overall 単独依頼が route で受理され、行コメント単独は従来どおり、両方同時は 400。
- CLI `next` が `{pageId,comments,overall,bodyHtml}` を claude に渡す。
- `comment-revise.md` が overall→最大10ブロック・`commentIndex` 連番を明記。
- 全体由来の提示が既存 `SentenceFixBody`＋`applyBodyCommentProposal` で反映され、既存の行コメント経路が回帰 green。
- 全体コメントと行コメントが UI で排他(単独依頼)。

---

## 9. セキュリティ・ガード

- **認可**: 3機能とも書き込み API は既存の `verifyToken`(`APPROVE_AUTH_ENABLED` gate)を通す。F3 の全体コメント受理でも `body-comment/route.ts` の `articleEditGuard(page)`(下書き段階ガード #H9)を**変更せず維持**する(全体でも下書き編集の一種)。F1 の `advise/apply` は既存どおり `verifyToken`＋busy 409。強権キー(`MICROCMS_MANAGEMENT_API_KEY`)は一切使わない(書き込み先は Notion のみ)。
- **多重依頼防止**: F1/F2/F3 とも既存の busy(依頼中/処理中/提示中)409 ガードで多重 pull を防ぐ。F1 の全選択は「依頼を1回にまとめる」だけで、依頼自体は既存 route の 409 に従う。
- **入力検証(zod・`any` 禁止)**: F3 の `overall` は `z.string().min(1).max(2000)`。`comments` は既存 `BodyCommentSchema`。route は `unknown`→`safeParse`→400 で fail-fast(既存パターン踏襲)。F1 の `adoptedIndexes` は既存 `parseAdoptedIndexes`(整数・0以上・`MAX_ADOPTED` 上限)で不変。
- **併用不可の二重防御**: F2/F3 の「全体 XOR 個別」は UI(排他 disabled)＋サーバ/送信ロジック(片方のみ送る/両方非空は 400)の二段で担保。UI をすり抜けても壊れない。
- **アンカー安全機構の維持**: F3 全体コメントは excerpt を持たないが、**反映は `applyBodyCommentProposal` の `before` 照合(本文が変わっていたら弾く)** で従来どおり誤反映を防ぐ。行コメントの `selectAnchoredComments`/`anchorExists` は不変。
- **沈黙させない**: F3 の CLI `next` で全体コメントも `bodyHtml` 欠落等は既存 `buildBodyCommentFailProps`＋通知で失敗化(不変)。present/fail の LINE 通知は共通。
- **SI1 学習ログの採否記録(確認)**: F2/F3 の反映は既存の `/api/growth/draft/edit`(`source: "comment-revise"` 等・`adoptedAspects`)を通る。全体コメント由来も同じ `source` で保存されるため、**SI1 の `編集` イベント記録(source/adoptedAspects)に自然に乗る**(新経路・新記録は不要)。F1 の反映は `source: "advise-apply"`＋`adoptedAspects`(area)で既存どおり記録される。3機能とも学習ログ基盤に追加改修は要らない。

---

## 10. 制約(プロジェクト規約・再掲)

- **pull 型・present 方式不変**: AI は案まで(構成案案・before/after 案・採用候補)。反映は必ず人間(承認画面の「反映」)。3機能とも自動反映しない。
- **単独依頼(併用不可)**: 全体指示/コメントは個別指示と同時に submit しない(F2 全体 XOR セクション・F3 全体 XOR 行)。データ構造(F3 `{comments,overall}`)は将来の併用を妨げない形にするが、併用 UI/挙動は本 spec 非スコープ。
- **新ループ・新モード・新 Notion プロパティを増やさない**: F3 は既存 comment-revise を拡張。既存 `本文コメント指示` の JSON に相乗り。run.mjs のループ(`comment-revise-loop`/`revise-loop`)は不変。
- **純ロジック分離・100%カバレッジ・TDD**: `selectableAdoptIndexes`(F1)・`OUTLINE_OVERALL_LINE`＋回帰(F2)・`BodyCommentRequestSchema`/`parseBodyCommentRequest`(F3)は `scripts/growth/*.ts`＋`src/lib/growth/*` 再エクスポートで純ロジック化しテスト。CLI(`comment-revise-cli.ts`)・route 薄層・UI コンポーネント配線はカバレッジ除外。
- **TS strict / `any` 禁止**: 外部入力は `unknown`＋narrowing、zod 検証。`import type`・boolean は is/has/should/can・handler は on/handle・`@ts-ignore` 禁止(必要時 `@ts-expect-error`＋理由)。
- **書き込み API のガード維持**: `verifyToken`＋`articleEditGuard`＋busy 409＋`growthApiError` 経路を全機能で維持。強権キーは使わない。
- **欠落耐性・沈黙させない**: 旧形依頼(F3 配列 JSON)も落とさず読む。失敗は既存の fail＋LINE 通知で可視化。
- **無人 push/commit 禁止**: `run.mjs` の `DISALLOW` 継続。push 時のみ `ttmakhr1028ai-art`。
- **正典・facility-context 不可侵**: 記事内容ルール・確定事実は触らない。F2/F3 のプロンプト追記は「入力(全体スコープ)の解釈」の1〜2文に限る。
- **出力言語**: spec/計画/コミット/説明は日本語。
