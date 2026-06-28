# 下書きモード(drafts)と手動編集

> 承認済み記事を microCMS の**下書き**として作る経路。正典の前提・絶対禁止は [00-canon.md](00-canon.md)。
> プロンプト本体は `scripts/growth/prompts/drafts.md`、運用手順は runbook「下書きモード」。

## 下書き生成(`growth:drafts`)

- 承認記事を**コンテンツ作成チーム(執筆担当＋編集者)**で執筆→ HTML →投入スペック JSON をステージ→ `growth:publish-draft` で同期投入。
- 投入は **create(冪等PUT)→ アイキャッチ生成→ upload → eyecatch添付 → Notion ステータス更新** を直列・同期で実行。
- タイトルは Notion `タイトル案` をそのまま使う(#176・AIで作り直さない)。良くしたい場合は承認画面のタイトル修正ループ(#139B)で。

## 本文画像(Epic #59 / 構成案からの指示で生成)

- 承認画面で構成案のセクションに画像指示(スタイル `mascot`/`minimal`/`diagram` ＋説明)を追加。
- 下書き生成時に `growth:publish-draft` が生成→ microCMS へ upload →本文の `{{IMG:n}}` を `<figure>` へ置換。
- **実写禁止**・`diagram` は「イメージ図」明示・**1記事上限3枚**(超過分は本文に入れずスキップを報告)。
- 正典は style-guide §9「本文画像」、純ロジックは `scripts/growth/body-image.ts`。
- スタイル表示名→キー: マスコット・コスミック→`mascot` / ミニマル図解→`minimal` / 詳しい図解→`diagram`。

## 下書きプレビュー＋手動リッチ編集(Epic #72)

- 承認画面の記事詳細パネルで microCMS 下書きを実プレビュー(`NewsBodyRenderer` 再利用)。
- TipTap リッチエディタで本文を直して保存: `/api/growth/draft/edit` → `patchDraft` で**下書き上書き(公開しない)**。
- 手動編集は **Vercel から microCMS を直接読み書き**(AI修正ループとは別系統)。
- メディアは保持のみ(この Epic では新規作成しない)。
- `DraftEditor.tsx` はカバレッジ除外、純ロジックは `draftEditorContent.ts`。
- 前提: Notion「記事ネタ案」に `下書きID`/`下書きプレビューキー`、Vercel に `MICROCMS_CONTENT_API_KEY`。
- 運用は runbook の「承認画面で下書きをプレビュー＋手動リッチ編集」節。
