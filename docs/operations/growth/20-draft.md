# 下書きモード(drafts)と手動編集

## 値カバレッジと本文主張の監査

Writer は本文の金額・時刻・日付・数量・統計・健康断定を、ResearchPacket の fact に実在する値だけで書く。オーケストレーターは `htmlparser2` で `p` / `li` / `th` / `td` を走査し、fact 全体の和集合に裏付けが無い値が1つでもあれば、違反を1メッセージに列挙して本文をキャッシュ・投入しない（`scripts/growth/factCoverage.ts`）。書き手による根拠の申告（marker・usedFactIds）は使わない。

根拠台帳は機械が本文と fact の値照合から逆引きして生成し、fact ID、抜粋、見出し経路、要素位置、公開前再確認フラグを保存する。fact に無い施設名は投入を止めず、台帳末尾へ「⚠ 要確認（捏造の疑い）」として併記する。旧spec・旧checkpointの本文に marker が残っていても除去して扱うため、再開経路は従来どおり。

> 承認済み記事を microCMS の**下書き**として作る経路。正典の前提・絶対禁止は [00-canon.md](00-canon.md)。

1回の実行で処理する記事は1件だけ。`drafts-auto` はH2/H3を含む構成案がある行だけを対象に、中断中の `生成中`、次に `承認` の順で1件をclaimし、そのpageIdだけを決定的オーケストレーターへ渡す。構成不備の行は後続記事を止めない。

手動 `drafts` と `drafts-auto` は共有 lease の取得後にだけ対象を選ぶ。同時起動時は片方が exit 0 でスキップする。timeout 時も「生成中」と research/writer キャッシュを残すため、同じコマンドを再実行すると完了済み工程を再利用できる。
> AIプロンプトは `scripts/growth/prompts/draft-research.md` と `draft-write.md`、運用手順は runbook「下書きモード」。

## 下書き生成(`growth:drafts`)

- 決定的オーケストレーターが、Notion入力取得→独立した記事リサーチ→クリーンな独立セッションでの1回執筆→投入スペック組み立て→`growth:image-prompt`→`growth:publish-draft`を管理する。
- 記事リサーチと記事執筆は承認画面の「AIモデル」で別々に設定する。本文の校閲・採点・自動全文リライトは行わない。
- 記事リサーチと記事執筆のプロバイダー・モデル・推論強度は、承認画面で保存された工程別設定をそのまま使う。環境変数では上書きせず、設定がない場合だけコード既定値へフォールバックする。
- 画像プロンプト設計は承認画面 `AIモデル` の独立設定を使う（既定 Codex / `gpt-5.6-sol` / `high`）。アイキャッチ再生成・本文画像再生成も同じ設定を共有し、実際に描画する `gpt-image-2` は変更しない。
- 画像設計AIは sidecar JSON だけを出力し、検証CLIが `eyecatchAction` と `images[]` だけを反映する。本文・Notion情報・根拠台帳は変更できない。
- 投入は **create(冪等PUT)→ アイキャッチ生成→ upload → eyecatch添付 → Notion ステータス更新** を直列・同期で実行。
- create前にNotionの現在の構成案を再読込し、本文H2/H3の名前・レベル・順序が一致しなければ投入を停止する。
- タイトルは Notion `タイトル案` をそのまま使う(#176・AIで作り直さない)。良くしたい場合は承認画面のタイトル修正ループ(#139B)で。

## 確認済み情報源リストと参考資料欄

- 投入スペックの `sourceLedger`(任意)には、本文で使った重要事実を情報源ごとに `{sourceType, source, confirmedFacts[]}` で入れる。`growth:publish-draft` はNotion記事ネタ行の既存 **`根拠台帳` プロパティへ確認済み情報源リストとして自動保存**する。確度・採否・理由は保存しない。旧claim形式のspecも新形式へ変換して再実行できる。プロパティ未追加でも投入は成功する(欠落耐性=リスト抜きリトライ＋警告)。
- **参考資料欄**(読者公開)は別物で、統計・健康系の記事のみ本文HTML末尾に置く**独立ブロック**。基本はテキスト表記(出典名＋発行年)、リンク化は連盟・官公庁などの公式ドメインのトップ級 URL に限る。AI 免責文の削除(publish 時 `removeAiDisclaimer`)に巻き込まれないよう免責文とは別ブロックにする。条件・形式の正典は style-guide §15、台帳の純ロジックは `scripts/growth/sourceLedger.ts`。

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
- 前提: Notion「記事ネタ案」に `下書きID`/`下書きプレビューキー`、Vercel に `MICROCMS_API_KEY`。
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
