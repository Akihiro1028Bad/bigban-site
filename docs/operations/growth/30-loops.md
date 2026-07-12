# pull型 AI ループ(修正・画像再生成・アドバイス・装飾)

> いずれも pull 型: 承認画面が Notion に「依頼」を書き、常時稼働PC のループ(5分間隔・`run.mjs` の lock/1日上限を共有)が headless agent で拾う。既定は承認画面 `AIモデル` の工程別設定で、Claude Code CLI / Codex CLI を工程ごとに選ぶ。
> 共通原則・段階ガードは [00-canon.md](00-canon.md)。必要 Notion プロパティは [40-notion-props.md](40-notion-props.md)。

Codex 強制の初期検証は、本文や microCMS を直接変更しない `growth:advise-loop` と、採用前のメタ提案までに留まる `growth:decorate-loop` から始める。通常運用では `GROWTH_AGENT` を未設定にして工程別設定を使う。

Codex 実行例:

```bash
GROWTH_AGENT=codex GROWTH_CODEX_SANDBOX=danger-full-access npm run growth:advise-loop
GROWTH_AGENT=codex GROWTH_CODEX_SANDBOX=danger-full-access npm run growth:decorate-loop
```

Codex 工程は既定で `danger-full-access`。制限したい環境だけ `GROWTH_CODEX_SANDBOX=workspace-write` などを明示し、常用する前に対象ループを `advise` → `decorate` → その他の順に広げる。

## 構成案/タイトルの修正ループ(Epic #40 / タイトルAI修正 #139B)

- 承認画面で構成案に**行コメント**、またはタイトル専用枠に指示 →「修正を依頼」。
- PC の `revise` モード(`npm run growth:revise-loop`)が headless agent で**指示が来た方だけ**(構成案／タイトル)を修正→提示中。
- ユーザーが**元 vs 新**を見比べ、提案がある方だけまとめて反映。
- タイトルは title型 `タイトル案` を上書き。
- 純ロジック `scripts/growth/revise.ts`、PC配線 `revise-cli.ts`(`present <pageId>` が `.growth-tmp/revise-proposal.txt`／`revise-title.txt` の存在する方を提示)。
- 運用は runbook「構成案の修正ループ」節。

## メディア基盤(#142 / #143)

- **メディア一覧/アップロード API**(#142): `/api/growth/media` GET=一覧・POST=アップロード。microCMS **MANAGEMENT API**(`{domain}.microcms-management.io/api/v1/media`)。
- 純ロジック `src/lib/growth/media.ts`(list/upload のみ・**delete は作らない**・サイズ5MB/MIMEホワイトリスト検証・`sanitizeFileName`・`isMicrocmsAssetUrl`)。
- **アイキャッチ差し替え**(#143): `EyecatchPicker.tsx` でメディア選択/アップロード → `/api/growth/draft/eyecatch` が **単一APIキー**で `patchDraft({eyecatch})` ＋ Notion ミラー `アイキャッチURL` 更新 → プレビュー再取得。`eyecatchUrl` は `images.microcms-assets.io` 厳密一致。

## アイキャッチ AI 再生成(#144)

- `EyecatchPicker` の「AIで再生成」→ `/api/growth/eyecatch/regen` が Notion に依頼記録。
- PC の `npm run growth:regen-loop`(`run.mjs regen`)が `gen-eyecatch`→`upload-media`→`growth:eyecatch-regen done` で差し替え＋LINE通知。
- 純ロジック `scripts/growth/eyecatch-regen.ts`、CLI/run.mjs はカバレッジ除外。

## 本文画像差し替え(#145)/ AI再生成(#156)

- **差し替え**(#145): `BodyImagePicker.tsx` がプレビューの本文画像を一覧 → メディア選択/アップロード → `bodyImageEdit.ts` で該当 `<img src>` を差し替え → `/api/growth/draft/edit` で保存。
- **AI再生成**(#156): `BodyImagePicker` の各画像「AIで再生成」→ `/api/growth/body-image/regen` が Notion に依頼記録(**対象src**＝その時点の画像URLで「どの画像か」を持つ・**インデックスは使わない**)。
  - PC の `npm run growth:regen-body-loop`(`run.mjs regen-body`)が `gen-body-image`→`upload-media`→`growth:body-image-regen done <pageId> <targetSrc> <url>` で本文HTMLの当該 `<img>` を `replaceBodyImageBySrc` で差し替え ＋ 単一APIキーで `patchDraft({bodyHtml})` ＋ Notion ミラー(本文HTML #95)更新 ＋ LINE通知。
  - 新規挿入依頼も同じ Notion キュー・同じ `regen-body` ループで処理する。対象は `placeholder:<id>` として記録し、完了時に `growth:body-image-regen done <pageId> <placeholderId> <url> --alt "<説明>"` が pending figure を実画像 figure へ置換する。
  - 依頼後に本文が変わり対象src が消えたら**失敗通知**(沈黙させない)。
  - 純ロジック `scripts/growth/body-image-regen.ts`(`replaceBodyImageBySrc`/`isMicrocmsAssetUrl` 含む)、CLI/`gen-body-image`/run.mjs はカバレッジ除外。

## スタイリング・アドバイザー(#146・read-only)

- 承認画面の下書きプレビューに「スタイリング・アドバイス」カード(`AdviceCard.tsx`)。
- 「アドバイスを依頼」→ `/api/growth/advise` が Notion に依頼記録(依頼中)。
- PC の `npm run growth:advise-loop`(`run.mjs advise`)が headless agent で本文(Notion ミラー `下書き本文HTML` #95 を読む・本文は送らない)を style-guide §11/§14/§15/§4/§12/§9 に照らして分析 → `growth:advise present <pageId> <jsonファイル>` が**アドバイスJSONを zod 検証**して Notion `アドバイス結果` に書く(提示中)＋LINE通知。
- 承認画面は `/api/growth/draft` GET(`adviceViewOf` で advice も返す)で取得し、総評／観点別スコア／強み／直すべき点(引用＋理由＋修正案)を表示。「閉じる」=`/api/growth/advise/dismiss`。
- **read-only**: 本文・下書き・microCMS には一切書き込まない(書込先は Notion のみ・強権キー不要)。
- 純ロジック `scripts/growth/advise.ts`(`AdviceSchema`/`parseAdvice`(安全側 null)/`serializeAdvice`/`adviceViewOf`/`adviceRowFromPage` 等・`src/lib/growth/advise.ts` 再エクスポート)、CLI/run.mjs はカバレッジ除外。
- #128 `draftQuality.ts`(機械的○×)の**補完**(理由・改善案レイヤー)であり置換ではない。

## 装飾アシスタント(#147・採用→本文反映)

- 承認画面の下書きプレビューに「装飾アシスタント」カード(`DecorationAssistant.tsx`)。
- 「装飾を提案」→ `/api/growth/decorate` が Notion に依頼記録。
- PC の `npm run growth:decorate-loop`(`run.mjs decorate`)が headless agent で本文(Notion ミラー #95)をトップレベル要素ごとに見て【箇所ごとの装飾提案】(op=add/change/remove × decoration=note/caution/highlight/blockquote)を作り、`growth:decorate present <pageId> <json>` が **zod 検証**して Notion `装飾提案` に書く(提示中)。
- 人が採用/却下 →「採用分を反映」で**決定的な `applyDecoration`**(許可リスト内の固定変換)で本文へ反映 → 既存 `/api/growth/draft/edit`(単一APIキー・STRICT再サニタイズ)で保存。
- **安全の要＝AIに生HTMLを出させない**(提案はメタのみ・HTMLはシステムが生成)。アンカーはブロックindex＋抜粋照合(不一致は「要確認」で弾く・誤適用防止)。
- 純ロジック `scripts/growth/decorate.ts`(`splitTopLevelBlocks`/`applyDecoration`/`applyDecorations`/`previewDecoration`/`DecorationProposalSchema`/`parseProposals`(安全側[])/`decorateViewOf` 等・`src/lib/growth/decorate.ts` 再エクスポート)、CLI/run.mjs はカバレッジ除外。
- list/table/cta は初手対象外(随伴バックログ)。

## アドバイス採用→本文反映(#165)/ 本文コメント→AI修正(#182)

- **#165**: 決定的処理は `growth:advise-apply` CLI。headless agent は採用された fix の passage だけを書き換え before/after 案(メタ)を作る。反映は承認画面側。
- **#182**: 本文インラインコメント→AI修正。決定的処理は `growth:comment-revise` CLI。headless agent はコメントされた文を含むブロックだけを書き換え before/after 案(メタ)を作る。反映は承認画面側。
- いずれも `run.mjs` の lock/1日上限を共有。
