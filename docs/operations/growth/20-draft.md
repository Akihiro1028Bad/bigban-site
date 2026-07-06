# 下書きモード(drafts)と手動編集

> 承認済み記事を microCMS の**下書き**として作る経路。正典の前提・絶対禁止は [00-canon.md](00-canon.md)。
> プロンプト本体は `scripts/growth/prompts/drafts.md`、運用手順は runbook「下書きモード」。

## 下書き生成(`growth:drafts`)

- 承認記事を**コンテンツ作成チーム(執筆担当＋編集者)**で執筆→ HTML →投入スペック JSON をステージ→ `growth:publish-draft` で同期投入。
- 投入は **create(冪等PUT)→ アイキャッチ生成→ upload → eyecatch添付 → Notion ステータス更新** を直列・同期で実行。
- タイトルは Notion `タイトル案` をそのまま使う(#176・AIで作り直さない)。良くしたい場合は承認画面のタイトル修正ループ(#139B)で。

## 本文画像(Epic #59 / 構成案からの指示で生成)

- 承認画面の構成案クラスタ「誌面」リーフで、セクションごとの画像指示(スタイル `mascot`/`illust`/`court`/`flow`/`infographic`＋`auto`=おまかせ、説明、任意の文字指定)を編集する。
- 構成案の記法は `[画像:<表示名>: <説明>]` または `[画像:<表示名>: <説明> | 文字: <textSpec>]`。縦棒は全角 `｜` でもよい。`[画像:なし]` はそのセクションに画像を出さない明示指定。
- `textSpec` は `court`/`flow`/`infographic` の画像内文字・数値へ織り込まれ、下書き投入時に反映される。`mascot`/`illust` では文字を入れない。
- 下書き生成時に `growth:publish-draft` が生成→ microCMS へ upload →本文の `{{IMG:n}}` を `<figure>` へ置換。
- **実写禁止**・図解系(`court`/`flow`/`infographic`)は「イメージ図」明示・**1記事上限3枚**(超過分は本文に入れずスキップを報告)。
- 正典は style-guide §9「本文画像」、純ロジックは `scripts/growth/body-image.ts`。
- スタイル表示名→キー: おまかせ→`auto` / 宇宙人マスコット→`mascot` / 雰囲気イラスト→`illust` / コート図・ルール図解→`court` / 手順・フロー図→`flow` / 比較・インフォグラフィック→`infographic`。
- 旧表示名は後方互換で読む: マスコット・コスミック→`mascot` / ミニマル図解→`illust` / 詳しい図解→`court`。

## 下書きプレビュー＋手動リッチ編集(Epic #72)

- 承認画面の記事詳細パネルで microCMS 下書きを実プレビュー(`NewsBodyRenderer` 再利用)。
- TipTap リッチエディタで本文を直して保存: `/api/growth/draft/edit` → `patchDraft` で**下書き上書き(公開しない)**。
- 手動編集は **Vercel から microCMS を直接読み書き**(AI修正ループとは別系統)。
- メディアは保持のみ(この Epic では新規作成しない)。
- `DraftEditor.tsx` はカバレッジ除外、純ロジックは `draftEditorContent.ts`。
- 前提: Notion「記事ネタ案」に `下書きID`/`下書きプレビューキー`、Vercel に `MICROCMS_CONTENT_API_KEY`。
- 運用は runbook の「承認画面で下書きをプレビュー＋手動リッチ編集」節。

## プロンプト変更時のA/B検証(必須)

`scripts/growth/prompts/*.md` または `docs/operations/growth-article-style.md` を変更したら、投入品質が劣化していないかを機械ゲート(`draftQuality`)で確認してから確定する。手順:

1. **変更前の下書きを控えに残す**: 変更前プロンプトで生成した既存下書きの spec JSON(`.growth-tmp/<slug>.json` 等)を1本、比較用に確保する。
2. **変更後に同じネタで1本生成**: 同一の「記事ネタ案」で下書きを1本作り、その spec JSON を用意する。
3. **block/warn 数を比較する**:
   ```
   npm run growth:article-eval -- <旧.json> <新.json>
   ```
   - 各 JSON は publish-draft の spec(`{ payload: { title, bodyHtml } }`)でも、直接 `{ title, bodyHtml }` でも受け付ける。
   - 出力は `判定`(`improved`/`unchanged`/`regressed`)と `block`/`warn` の増減、`after` に残る block 一覧。
   - **`regressed`(block/warn が悪化)なら終了コード1**で終わる。
4. **悪化していたら変更を見直す**: `regressed` または after に新規 block が出たら、プロンプト変更を差し戻すか原因を潰してから再検証する。改善(`improved`)または `unchanged` を確認できたら変更を確定する。

> 純ロジックは `scripts/growth/articleEval.ts`、実行入口は `scripts/growth/article-eval-cli.ts`(薄い配線のためカバレッジ除外)。
