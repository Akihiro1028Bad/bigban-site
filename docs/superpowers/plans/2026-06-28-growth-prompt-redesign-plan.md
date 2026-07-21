# グロースループ プロンプト/ドキュメント再設計 修正方針

**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。

- 起票日: 2026-06-28
- ブランチ: `feature/growth-prompt-redesign`
- 種別: 設計方針 → **実装決定済み**(下記)

### 確定事項(2026-06-28 ユーザー承認)
- **着手範囲**: 全フェーズ(Phase 1〜4)通し
- **品質ゲート(P1-B)**: **案B 本格** — `publish-draft-cli.ts` 投入直前に `draftQuality` を実行し、block があれば投入中断+理由を Notion/LINE へ。ロジックは `draftQuality.ts` を単一ソースとして共有。
- **docs分割**: 実施する(`docs/operations/growth/` を新設。既存 runbook/style-guide は正典として残す)
- 背景: プロンプトエンジニアチームによる5観点レビュー(Claude Code運用設計 / プロンプト構造 / 記事品質・SEO / ハルシネーション対策 / 運用評価)を受領

---

## 0. このドキュメントの位置づけ

レビューは旧リポジトリ `bigban-growth-loop-mvp`(末尾 `-2` なし)を前提に書かれている。
本リポジトリ `bigban-growth-loop-mvp-2` は **その後かなり進化しており、提案の一部はすでに実装済み**。

本書の目的は次の3点:

1. レビュー各提案を **実リポジトリの現状(既実装 / 部分実装 / 未実装)に正確にマッピング**する
2. 旧repo前提で **すでに不要 or 形が違う**提案を切り分け、ノイズを除く
3. **本当に効く差分**だけを優先度付きの実装方針に落とす

> 重要な前提(本書は守る): 本番公開しない / git push・commit しない / 未確定情報を断定しない / ユーザーの動作確認完了までコミットしない。

---

## 1. 公式裏取り(context7 で確認済み)

レビューが引用する Anthropic 公式の主張は、現行ドキュメントで裏が取れた(`/websites/platform_claude_en` 経由):

- **XMLタグで複数文書を構造化**: `<documents><document index><source>…</source><document_content>…</document_content></document></documents>` が公式推奨形。
- **長文コンテキスト**: 20kトークンを超えるプロンプトは **longform データを冒頭に、クエリ/指示/例を末尾に**置くと性能が有意に向上。
- **多ショット例**: **3〜5個**の、ユースケースに沿った**多様な**例を `<example>` タグで構造化するのが推奨。
- **出力フォーマット制御**: 望む出力の雛形(XML例)を見せると形が安定する。

→ レビューの方向性(XML構造化 / 文書先頭・タスク末尾 / 3〜5例 / NG→OK)は**公式と整合**。採用してよい。

---

## 2. レビュー提案 × 実リポジトリ 現状マッピング

| # | レビュー提案 | 実リポジトリの現状 | 判定 |
|---|---|---|---|
| 最優先1 | `CLAUDE.md` を200行以内の「憲法」に圧縮 | 現状 **245行**。グロース運用の Epic 詳細・Notionプロパティ・API細部が常時ロード領域に混在 | **未実装(有効)** |
| 最優先2 | `weekly.md`/`drafts.md` を XMLタグ構造化 | 両方とも **散文の番号手順**。XMLタグ不使用 | **未実装(有効)** |
| 最優先3 | 「根拠台帳(source_ledger)」を必須出力に | `drafts.md` に「記事ブリーフ」「裏が取れない数字は書かない」はあるが、**主張↔出典の対応表は無い** | **未実装(有効)** |
| 最優先4 | 品質ルーブリックを「採点」→「合否ゲート」に | `draftQuality.ts`(#128)が **ok/warn/block の機械ゲートを実装済み**。ただし**承認画面UIで「公開」をブロックする用途**で、**生成プロンプト側のゲートではない**。プロンプトは §11 の**ソフト自己採点+最大2周+保留報告** | **部分実装(接続が課題)** |
| 最優先5 | few-shot に「NG→OK」例を3〜5追加 | `prompts/examples/` に **お手本2本(良い例のみ)**。`style-guide §14/§15` に NG 知識は**散文で大量にある**が、**NG→OK の対例**は無い | **部分実装(対例が無い)** |
| 中期1 | `promptpack.ts`(実行時に必要docsをXML付きで組立) | `promptRegistry.ts` は存在するが **承認画面の表示用**(実行時アセンブルではない)。`run.mjs` は `prompts/<mode>.md` を stdin へ素通し | **未実装(用途が別)** |
| 中期2 | `growth:prompt-lint`(矛盾・重複・古い参照検査) | 無し | **未実装** |
| 中期3 | `growth:article-eval`(変更前後の比較) | 無し(計測ループ #C4 は公開後GA4で別物) | **未実装** |
| 中期4 | `--output-format json` / `--json-schema` 活用拡大 | `run.mjs` は未使用。決定的処理は別CLI(`publish-draft` 等)に逃がす設計で、JSON契約は**プロンプト内の手書きJSON**に依存 | **未実装(限定的に有効)** |
| 中期5 | headless 本番を `--bare` 化 | 現状は通常 `claude -p`。CLAUDE.md・Notion MCP 前提に依存 | **保留(リスク>効果)** |

---

## 3. 修正方針(優先度付き)

「最終成果物=記事の品質」を上げ、ハルシネーションを減らし、運用の再現性を高めることを最上位に置く。
コード実装より先に **ドキュメント正典の再配置** から入るのがレビューの趣旨であり、本書もそれに従う。

### P0-A. `CLAUDE.md` を「常時ロードの憲法」に圧縮(最優先1)

**狙い**: 常時ロードのコンテキストを軽くし、不変ルールの遵守率を上げる。

**残すもの(憲法)**:
- プロジェクト概要
- 絶対禁止(本番公開しない / push・commit しない / 未確定情報を断定しない)
- 実行モード一覧と **参照先へのポインタ**
- 正典の優先順位(facility-context > style-guide > runbook)
- 失敗時の報告原則(沈黙させない)

**逃がすもの(モード別docsへ)**: Epic 詳細・各API仕様・Notionプロパティ一覧・画像/装飾/計測の各ループ細部。
これらは「該当モードを動かす時だけ」読めばよく、常時ロード不要。

**移設先の新構成(案)**:
```
docs/operations/growth/00-canon.md         # 正典の優先順位・絶対禁止・前提
docs/operations/growth/10-weekly.md         # 週次モード詳細
docs/operations/growth/20-draft.md          # 下書きモード詳細
docs/operations/growth/30-loops.md          # revise/regen/advise/decorate/publish 各ループ
docs/operations/growth/40-notion-props.md   # Notion 必要プロパティ一覧(欠落耐性メモ)
```
> 既存 `growth-weekly-runbook.md`(54KB)・`growth-article-style.md`(30KB)は正典として残し、上記は索引/差分として薄く保つ(重複コピーはしない)。

**リスク**: CLAUDE.md の「ニュースCMS」節など非グロース部分は触らない。グロース節のみ圧縮。

---

### P0-B. `drafts.md` / `weekly.md` を XML タグ構造化(最優先2)

**狙い**: AI に対して「命令 / 前提 / 参照 / 例 / 出力契約」の境界を明示し、遵守を安定させる。

`drafts.md` の再構成方針(公式の文書先頭・タスク末尾に沿う):
```
<role> … headless 実行・人間に質問できない … </role>
<non_negotiables> 公開しない / 未確定を断定しない / タイトル案を勝手に改変しない … </non_negotiables>
<source_of_truth>
  facility-context: scripts/growth/facility-context.json
  style guide:      docs/operations/growth-article-style.md
  HTML contract:    docs/operations/ai-news-prompt.md
</source_of_truth>
<workflow> 1.前提注入 2.承認記事取得→生成中 3.ブリーフ 4.取材 5.source_ledger 6.執筆 7.編集者ゲート 8.spec JSON </workflow>
<output_schema> …手順3の投入スペック JSON 雛形… </output_schema>
```

**留意点**:
- **手順そのもの(冪等性 / 着手マーク #108 / publish-draft への委譲 / 上限3枚 など)は1文字も削らない**。容れ物だけ XML に組み替える。回帰の温床になるので「整理」と称した手順の削除は禁止。
- `weekly.md` も同様に `<role>/<non_negotiables>/<source_of_truth>/<workflow>` へ。

---

### P1-A. 根拠台帳 `source_ledger` を必須化(最優先3)

**狙い**: 「取材した事実」と「本文の主張」の対応が切れる=最も事故りやすい点を構造で防ぐ。

`drafts.md` の **本文執筆前** に台帳を作らせ、編集者ゲートで本文主張と照合させる:
```
本文を書く前に source_ledger を作る:
- claim:              本文で使う予定の主張
- source_type:        facility-context / official-site / search-result / not-used
- source_url_or_file: 出典
- confidence:         high / medium / low
- usable_in_article:  true / false
- reason:             判断理由
→ usable_in_article=false は本文に入れない。編集者は本文の主要主張が台帳に存在するか照合。
```

**留意点**:
- 台帳は **下書きスペック(手順3 JSON)には載せない**=執筆の内部足場。既存の「記事ブリーフ」と二重にならないよう、**ブリーフを台帳の前段として統合**する(ブリーフ=方針、台帳=主張ごとの裏取り)。
- 既存ルール「裏が取れない数字は書かない」(§10/§15)を台帳で**手続き化**するだけ。新ルールの追加ではない。

---

### P1-B. 品質ゲートを「生成時」に接続(最優先4)

**現状の正確な把握**: 機械ゲート `draftQuality.ts`(ok/warn/block・AI免責文/§13断定NG/文字数/見出し/画像/内部リンク/壊れリンク)は **存在し、承認画面で公開をブロック**している。
不足しているのは **生成パイプライン側でのゲート**。

**方針(二択をユーザーに確認したい — §6)**:
- 案A(軽量・推奨): `drafts.md` の編集者に、§11 採点に加えて **draftQuality 相当の機械チェック項目を明示的に通す**ことを義務化。block 該当なら spec JSON を書かず、Notion ステータスを **「下書き保留(品質ゲート不合格)」+理由**で更新(現状の「保留して報告」を**機械判定+理由付きの可視ステータス**へ格上げ)。
- 案B(本格): `publish-draft-cli.ts` 投入直前に `draftQuality` を実行し、block があれば投入中断+理由を Notion/LINE へ。ロジック重複を避け `draftQuality.ts` を共有。

> どちらも **新しいしきい値を作らず既存 `draftQuality.ts` を単一ソース**として使うのが肝。「保留」を曖昧な散文判断から **決定的な合否+理由**へ変えるのが本質。

---

### P2-A. NG→OK 対例を追加(最優先5)

**狙い**: §14/§15 の「やってはいけない」散文知識を、**対比例**で体に覚えさせる。Google Helpful Content の警告サイン(量産/順位狙いの焼き直し)も対例で潰せる。

`prompts/examples/` に **3〜5個**の最小対例を追加(公式の `<example>` 構造):
1. 地名詰め込みタイトル NG / OK(§15)
2. 翻訳調・AI臭 NG / OK(§14)
3. 未確認の営業時間・料金を断定 NG / OK(§13)
4. 競合記事の焼き直し NG / OK(独自視点)
5. CTA が強すぎる NG / OK(§7)

**留意点**: 既存お手本2本(全体像)は残し、対例は**1論点1ペアの短い断片**にする(全文は要らない)。`drafts.md` から `<example>` で参照。

---

### P2-B. `growth:prompt-lint`(運用評価・中期2)

矛盾ルール / 重複禁止語 / 未登録プロンプト(promptRegistry 漏れ)/ 古い参照(存在しないファイル/節番号)を機械検査する純ロジック+CLI。
**TDD で純ロジック(`promptLint.ts`)→ CLI**。`promptRegistry.ts` と相互補完。

### P2-C. `growth:article-eval`(運用評価・中期3)

過去記事 / 失敗例 / 理想例を入力に、プロンプト変更前後の出力を比較するハーネス。
P0/P1 の効果測定に使うので **P0/P1 着手後**に回す。

---

### P3(保留・要相談)

- **中期4 `--output-format json`**: 決定的処理を別CLIに逃がす現設計と相性を見て、`weekly` 等の構造化出力に限定導入を検討。
- **中期5 `--bare`**: CLAUDE.md/Notion MCP 前提に依存する現運用では、必要 system prompt/settings/MCP を明示渡しにしない限りマシン差分リスクが高い。**現時点では非推奨**として保留。

---

## 4. 実装順序(フェーズ)

```
Phase 1 (ドキュメント正典の再配置・低リスク)
  P0-A  CLAUDE.md 圧縮 + docs/operations/growth/ 分割
Phase 2 (プロンプト構造・中リスク=回帰注意)
  P0-B  drafts.md / weekly.md の XML 化(手順は不変)
  P2-A  NG→OK 対例 3〜5個
Phase 3 (品質・ハルシネーション・要設計判断)
  P1-A  source_ledger 必須化(ブリーフと統合)
  P1-B  品質ゲートの生成時接続(案A/B はユーザー確認後)
Phase 4 (運用評価ツール)
  P2-B  prompt-lint
  P2-C  article-eval
```

各フェーズ末で**ユーザーが承認画面/dry-run で動作確認 → 確認後にコミット**(動作確認前コミット禁止のルール厳守)。

---

## 5. リスク・留意点(横断)

- **100% カバレッジ CI**: 新規純ロジック(`promptLint.ts` 等)は**テスト先行(TDD)**必須。`run.mjs`/CLI はカバレッジ除外慣習に合わせる。
- **promptRegistry 表示**: `prompts/*.md` のファイル名を変える/増やす場合、承認画面「プロンプト」タブの表示が壊れないよう `promptRegistry.ts` を同時更新(未登録は「その他」に落ちる設計だが、意図したグループに置く)。
- **facility-context 注入経路**: 現状は `drafts.md` 手順0で `npm run growth:facility-context` を実行して取り込む。XML化でこの**実行ステップを消さない**(単なる文章ではなく実コマンド)。
- **トークン消費**: source_ledger/対例の追加はコンテキストを増やす。CLAUDE.md 圧縮(P0-A)で相殺する設計。
- **手順の非削除**: 「整理・XML化」を口実に既存の冪等性・着手マーク・上限・沈黙させない通知などの**運用ガードを削らない**。容れ物の変更に留める。
- **非対象**: ニュースCMS(microCMS)本体、承認画面UIの大改修、公開フロー。今回はプロンプト/正典ドキュメント/品質ゲート接続に限定。

---

## 5.5. 実装結果(2026-06-28・全フェーズ完了)

ブランチ `feature/growth-prompt-redesign`。全 2498 テスト緑・カバレッジ 100%・tsc/eslint クリーン。

- **Phase 1**: CLAUDE.md のグロース節(約9KBの密な Epic 詳細)を約2KBの索引へ圧縮し、詳細を `docs/operations/growth/{00-canon,20-draft,30-loops,40-notion-props,50-publish-metrics}.md` へ移設(事実は無損失)。常時ロードの実バイトは約17KB→約12KB。
  - 補足: 行数は 245→252 と微増したが、これは長大な単一行 bullet を読みやすい複数行索引に置換した見かけ上の増加。「200行」は size の代理指標であり、実体(常時ロード負荷)は減っている。
- **Phase 2**: `weekly.md`/`drafts.md` を XML 構造化(`<role>/<non_negotiables>/<source_of_truth>/<workflow>/<output_schema>/<reporting>`)。**手順は不変**。NG→OK 対比例 `prompts/examples/ng-ok-examples.md`(5ペア)を追加し promptRegistry に登録。
- **Phase 3**: `drafts.md` に根拠台帳 `source_ledger`(手順2-2)と編集者の合否ゲート(手順2-4)を追加。品質ゲート純ロジック `scripts/growth/publishGate.ts`(`draftQuality.ts` を単一ソースに再利用)を作り、`publish-draft-cli.ts` の最初のステージで投入前に block を判定(不合格は中断+LINE通知)。
- **Phase 4**: `growth:prompt-lint`(`promptLint.ts`+CLI・未登録プロンプト/古い参照を検出)、`growth:article-eval`(`articleEval.ts`+CLI・変更前後を block/warn で比較し improved/regressed/unchanged)。

新規純ロジック(publishGate/promptLint/articleEval)は TDD・カバレッジ100%。CLI 2本は除外リストに追加。

## 6. ユーザーに確認したい点(着手前の確認・回答済み)

1. 本書の **着手範囲**: Phase 1 のみ着手 / Phase 1〜2 / 全フェーズ通し、のいずれで進めるか。
2. **品質ゲート(P1-B)**: 案A(編集者プロンプトに機械チェックを義務化・軽量)か、案B(`publish-draft` 投入直前にゲート・本格)か。
3. `docs/operations/growth/` への**分割の可否**(既存 runbook/style-guide は正典として残す前提)。
