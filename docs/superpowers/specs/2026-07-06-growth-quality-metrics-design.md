# グロースループ 品質・計測 改善3件 設計書

- 対象リポジトリ: `bigban-growth-loop-mvp`
- 起票日: 2026-07-06
- 前提: `docs/superpowers/specs/2026-07-06-growth-red-fixes-design.md`(🔴4件・実装済み=ワーキングツリーに未コミットで載っている)、2026-07-06 実装レビュー改善バックログ(`project_growth_loop_review_backlog.md`)
- 関連正典: `docs/operations/growth/00-canon.md`(pull型・純ロジック分離・欠落耐性・失敗を沈黙させない)、`CLAUDE.md`(TDD 必須・純ロジック 100% カバレッジ・CLI/`run.mjs`/`gen-*`/IO ラッパはカバレッジ除外)
- 実装体制: 実装は codex。設計判断は本書で確定済み(codex は覆さない)。疑義は本書「要確認」で採用案付きに明示。
- **並行作業の境界**: 別エージェントが `existing.ts` / `weekly.md` / `metricsReview.ts` のラベル結線(改善6・9)を同時設計中。**本設計書は `existing.ts` と `weekly.md` を変更対象にしない**。`metricsReview.ts` は本設計書でも触れる(改善7・8)ため、変更点は §10 の要確認で境界を明示し、競合しない差分に限定する。

---

## 0. サマリ(この設計書で閉じる3つの穴)

| 改善 | 何が足りないか | どう閉じるか |
|---|---|---|
| 改善5: styleLint を warn 統合 | `styleLint.ts`(§6誇大語・§14 AI定型・括弧直訳の辞書検出)は**どの本番経路にも結線されていない**(自前テストと DetailPanel のコメントのみ)。編集者も投入ゲートも辞書検出の結果を見られない。 | `draftQuality` に **warn レベル**で合流(block にはしない=誤検知許容)。投入時 LINE 通知に warn 件数の要約を出して沈黙させない。 |
| 改善7: keyEvents「未計測」と「実0」 | GA4 keyEvents 未設定でも `keyEvents.current=0` が入り、「読まれるがCTA弱い」(views≥50 & keyEvents=0)が**未計測期間にも誤発火**する。表示上も 0 と未計測を区別できない。 | env `GROWTH_GA4_KEYEVENTS_SINCE` を導入。未計測は「CV未計測」ラベルへ切替え、`keyEventsMeasured` を成績データに載せて後方互換で区別。 |
| 改善8: 前週比1点比較の脱却 | 前週比(current/prior)は2点比較で、単発の変動をトレンドと誤認する。母数が小さいラベルも信頼度が示されない。 | 保存済みスナップショット直近4週から週次系列+4週移動平均を組む純ロジック `trend.ts`(新規 API 呼び出しなし)。`metricsReview` に最低母数の注記を追加。 |

**先に読むこと(重大な前提の食い違い)**: 確定済み設計判断のうち、改善5(DetailPanel の既存 styleLint 直接利用)と改善7(env をどこで読むか)に、現行コードと前提が食い違う箇所がある(§10 に集約)。設計方針は維持しつつ、コードに接地する形へ具体化した。codex は §10 を必ず読んでから着手すること。

---

## 1. 背景と目的

グロースループは「pull型・純ロジック分離・欠落耐性・失敗を沈黙させない」を共通原則に組み上がっている(`00-canon.md`)。🔴4件で品質ゲートの結線(`evaluatePublishGate`/`resolveGateArticleType`/`evaluateRegate`/`publishGateReason`/`knownArticlePathsForMedia`)は完了した。今回の3件は「品質と計測の見え方」を1段上げるもので、いずれも**新モード・新 API 呼び出しを増やさず**、既存の純ロジックと既存の配線に結線を足すことで閉じる。

- 改善5: 眠っている `styleLint` を本番チェックに合流(誤検知を許容し warn 止まり)。
- 改善7: keyEvents の「未計測」と「実0」を分離(env 基準日で判定)。
- 改善8: 前週比の一点比較から、蓄積スナップショットのトレンド+最低母数ガードへ。

---

## 2. 改善5: styleLint を品質チェックに warn として統合

### 2.1 目的と現状(重大な前提の訂正)

`src/lib/growth/styleLint.ts` は §6(誇大・煽り・医療断定)・§14(AI定型・メタ言及・括弧書き直訳)・#H22 用語統一の**確定的辞書 linter**(DOM/IO 非依存)。しかし裏取りの結果:

- **`styleLint`/`termHints`/`styleLintSummary` はどの本番経路からも呼ばれていない**。参照は `styleLint.test.ts`(自前テスト)と `DetailPanel.tsx` の**コメント2箇所のみ**(13行「styleLint/StyleHints の合流は将来拡張」・256行 同旨)。UI も投入ゲートも辞書検出の結果を一切見ていない。
- したがって確定判断「DetailPanel の既存 styleLint 直接利用を draftQuality 経由に置き換えるか併存か」は**前提が成立しない**(置き換える対象の「既存直接利用」が無い)。→ §10-1 で採用を確定。

**目的**: 眠っている辞書 linter を `draftQuality`(公開前チェックの単一ソース)へ **warn レベル**で合流し、UI(承認画面フッター)・投入前ゲート(通知)の双方で見えるようにする。

### 2.2 block にしない(確定・再掲)

辞書検出は誤検知がある(「最高」「絶対」等は文脈で正当)。block にすると正当な記事の投入・公開が止まる。したがって:

- **`draftQuality` では warn 固定**(既存の warn 項目=文字数・見出し等と同じ扱い)。
- **`evaluatePublishGate`/`publishGateReason`/`evaluateRegate` の block 判定は不変**(warn は `blockReasons` に入らない)。投入前ゲート・公開直前ゲート・再ゲートの中断条件は従来どおり block のみ。styleLint 由来で投入・公開が止まることはない。
- 誤検知率を運用で見てから block 昇格を判断(将来スコープ=§5)。

### 2.3 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/app/growth/approve/draftQuality.ts` | `draftQuality(input)` の返す配列末尾に **styleLint 由来の warn チェック**を追加する。プレーンテキスト(`plainText(input)`)に `styleLint` を掛け、`styleLintSummary` の件数を1つの `QualityCheck`(level=`warn`/`ok`)に集約する。純ロジック・100% カバレッジ。 |
| `src/lib/growth/styleLint.ts` | **変更なし**(既存関数をそのまま利用)。ただし `src/lib/growth/styleLint.ts` は `src/app/growth/approve/draftQuality.ts` から相対 import 可能(同一 `src/` ツリー)。 |
| `scripts/growth/publish-draft-cli.ts`(quality-gate ステージ内) | ゲート判定(block)は不変。加えて **warn 要約を stderr + LINE best-effort で出す**(下記 §2.5)。 |
| `docs/operations/growth/20-draft.md`(任意・1行) | 公開前チェックに文体 linter の warn が出る旨を1行(別設計書と競合しないファイル)。**任意**。 |

> **import 方向の注意**: `draftQuality.ts` は `src/app/growth/approve/` にあり、`styleLint.ts` は `src/lib/growth/` にある。`draftQuality.ts` から `@/lib/growth/styleLint`(または相対)で import する。`publishGate.ts`(scripts 側)は `draftQuality` を `../../src/app/growth/approve/draftQuality` で読んでいるため、draftQuality が styleLint を取り込めば **scripts 側の publishGate 経由でも同じ warn が見える**(単一ソース化が自動的に効く)。CLI(node/tsx)から src の import 解決が通ることは既存の publishGate→draftQuality の依存で実証済み。

### 2.4 draftQuality への warn チェック追加(実装形)

既存の `warnIf` ヘルパ(158-160行)と同じ形にする。プレーンテキストは既に `draftQuality` 内で `plain = plainText(input)`(164行)として得ている。

追加する `QualityCheck`(`draftQuality` の return 配列に1要素足す。挿入位置は既存 warn 群の後・block 群の前が自然だが、順序は表示都合のみで判定に影響しない):

```ts
// styleLint(#C5): §6/§14 辞書に基づく文体注意点。誤検知があるため warn 止まり(block にしない)。
const styleHits = styleLint(plain);
const styleSummary = styleLintSummary(styleHits); // 0件カテゴリは含まない
const styleTotal = styleHits.length;
// value 例: "3(誇大2・AI定型1)" / 0件なら "0"
const styleValue =
  styleTotal > 0
    ? `${styleTotal}(${styleSummary.map((s) => `${s.category}${s.count}`).join("・")})`
    : "0";
```

チェック本体(`warnIf` ではなく明示。hint に上位カテゴリを出す):

```ts
{
  label: "文体注意",
  value: styleValue,
  level: styleTotal > 0 ? "warn" : "ok",
  hint: styleTotal > 0 ? "§6/§14 の要確認語(誤検知あり・人が判断)" : undefined,
}
```

- **後方互換**: `draftQuality` は入力に依存せず必ずこのチェックを1つ返す。既存の consumer(`DetailPanel`・`QualityChecklist`・`countByLevel`・`hasBlockingCheck`・`evaluatePublishGate`)はすべて **level ベース**で扱うため、warn が1つ増えても block 判定は変わらず、UI は自然に1項目増える。`countByLevel` の warn 件数が増えるのは意図どおり(可視化)。
- **DetailPanel の既存コメント**(13行・256行「styleLint 合流は将来拡張」)は本改善で実現されるため、コメントを実態に合わせて更新する(「draftQuality に warn 統合済み」)。DetailPanel のロジック変更は不要(draftQuality 経由で自動的にフッターへ出る)。

> `termHints`(#H22 用語統一)は本改善では合流しない(スコープを styleLint の §6/§14 辞書に絞る=誤検知率の観測を先にする)。termHints の合流は将来スコープ(§5)。

### 2.5 投入時 LINE 通知への warn 要約(沈黙させない)

**現状の裏取り**: 下書き完成の LINE 通知は `publish-draft-cli.ts` ではなく **別 CLI `notify-drafts.ts`(`growth:notify-drafts`)** が送る。しかし `notify-drafts` は microCMS から `title,excerpt,category,eyecatch` のみ取得し(`draft-meta.ts` `fetchContentSummary` 96行)、**bodyHtml を持たない**ため styleLint を掛けられない。

一方 `publish-draft-cli.ts` は `spec.payload.bodyHtml` を持ち(投入対象そのもの)、既に quality-gate ステージで body を評価している。**warn 要約は publish-draft-cli の quality-gate ステージで出すのが最小変更**(bodyHtml がその場にあり、`notifyLineBestEffort` も既存)。

**実装**: `publish-draft-cli.ts` の quality-gate ステージ(194-220行)内、gate 判定(block で throw)の**成功側で**、warn 要約を best-effort 通知する。純ロジックは `draftQuality` を再利用(既に import 済みの `evaluatePublishGate` と同じ draftQuality を1回呼ぶ形か、warn 抽出の小さな純関数を1つ足す)。

採用: `draftQuality.ts` に **warn 要約を返す純関数**を1つ足す(テスト対象):

```ts
/** styleLint 由来 warn を含む warn チェックを人向け1行に要約する(0件なら null)。 */
export function summarizeStyleWarnings(bodyHtml: string, title: string): string | null
```

- 実装は `draftQuality({ bodyHtml, body:"", title })` を呼び、`level==="warn"` かつ `label==="文体注意"` の項目(または warn 全般)の value/hint を1行に整形。0件なら null。
- **どの warn を要約に含めるか(確定)**: 「文体注意」項目のみ(styleLint 由来)。文字数/見出し等の既存 warn は投入時に毎回出ると冗長なので含めない。styleLint warn が 0 件なら通知を足さない(沈黙させない=**出す価値がある時だけ出す**)。

publish-draft-cli 側(quality-gate 成功後):

```ts
const styleWarn = summarizeStyleWarnings(
  String(spec.payload.bodyHtml ?? ""),
  String(spec.payload.title ?? "")
);
if (styleWarn) {
  const msg = `文体チェック(要確認・投入は継続): ${String(spec.payload.title ?? "")} / ${styleWarn}`;
  process.stderr.write(`${msg}\n`);
  await notifyLineBestEffort(msg);
}
```

- **投入は止めない**(warn は情報提供)。通知失敗も致命ではない(`notifyLineBestEffort` は既存の握り潰し方針)。
- publish-due(公開直前)や notify-drafts への追加はしない(bodyHtml を持たない・重複通知になる)。可視化は (1) 投入時 LINE の1行 と (2) 承認画面フッターの「文体注意」warn バッジ、の2経路で足りる。

### 2.6 データフロー(改善5)

```
draftQuality(input)
 └ 既存 warn(文字数・見出し・画像・内部リンク・タイトル長)
 └ 【追加】文体注意 warn(styleLint→styleLintSummary)   ← UI フッター・countByLevel に自然合流
 └ 既存 block(§5 免責・§13 doNotWrite・§15 壊れリンク)  ← 判定は不変

publish-draft(投入):
  quality-gate ステージ
   ├ evaluatePublishGate(block あれば throw=従来)
   └ summarizeStyleWarnings(warn あれば stderr + LINE best-effort・投入は継続)
```

### 2.7 テスト計画(改善5)

| テストファイル | ケース名(新規) | 期待値 |
|---|---|---|
| `src/app/growth/approve/draftQuality.test.ts` | `文体注意: styleLint ヒットで warn` | 「最高」「この記事では」等を含む本文 → `文体注意` の level=`warn`・value に件数とカテゴリ |
| 〃 | `文体注意: ヒット無しで ok` | 正常本文 → level=`ok`・value=`0` |
| 〃 | `文体注意 warn は block 判定に影響しない` | styleLint ヒットのみの本文 → `hasBlockingCheck`=false・`evaluatePublishGate.ok`=true |
| 〃(`publishGate.test.ts` 既存) | `styleLint warn は blockReasons に入らない` | 誇大語のみ本文 → `evaluatePublishGate` の `blockReasons` 空 |
| `src/app/growth/approve/draftQuality.test.ts` | `summarizeStyleWarnings: warn ありで1行を返す` | 誇大語本文 → 非 null・カテゴリ名を含む |
| 〃 | `summarizeStyleWarnings: warn 無しで null` | 正常本文 → `null` |

- 純ロジック(`draftQuality` 追加分・`summarizeStyleWarnings`)は 100% カバレッジ。
- `publish-draft-cli.ts` の配線(通知1行追加)はカバレッジ除外(薄い IO)。
- **既存テストを壊さない**: `draftQuality.test.ts` は返り値配列を label で検索する形なら1項目増でも通る。件数を固定長で assert しているケースがあれば +1 に更新(codex は先に既存テストを走らせて RED/GREEN 確認)。

---

## 3. 改善7: GA4 keyEvents「未計測」と「実0」の区別

### 3.1 目的

GA4 keyEvents(予約/LINE/IG クリック)は**オーナーが GA4 管理画面で key event を設定するまで常に 0**で返る(60-kpi-tree.md §3 が既知問題として明記)。現行 `reviewLabels`(`metricsReview.ts` 71-73行)は `views≥50 && keyEvents===0` で「読まれるがCTA弱い」を付けるため、**未計測期間の全記事に誤ってこのラベルが付く**。また成績表示上も「実0(CTA が本当に押されていない)」と「未計測(そもそも計測していない)」が区別できない。

### 3.2 判定基準(env 基準日 + 記事の publishedAt)

env `GROWTH_GA4_KEYEVENTS_SINCE`(`YYYY-MM-DD`・GA4 keyEvents 設定完了日)を導入する。

- **未設定** → keyEvents は全記事「未計測」扱い。
- **設定済み** → 基準日と記事の関係で判定する。**基準日以降に計測が始まる**ため、`GROWTH_GA4_KEYEVENTS_SINCE` **より前に公開され、かつ成績集計期間が基準日をまたぐ/下回る**記事は keyEvents が過小になる。実装を単純かつ安全にするため、採用基準は:
  - **記事の `publishedAt`(microCMS・ISO)が `GROWTH_GA4_KEYEVENTS_SINCE` 以降**なら「計測済み」(その記事の全集計期間で key event が有効)。
  - `publishedAt` が基準日より前、または `publishedAt` 不明 → 「未計測」(過小の可能性があるため keyEvents=0 を実0と断定しない)。
  - **理由**: 記事単位で `publishedAt` は既に metrics に載る(`ArticleMetrics.publishedAt`・`metrics.ts` 50行)。「公開が計測開始後」なら期間全体で計測が有効=最も誤りが少ない。期間境界の厳密突き合わせ(週の一部だけ計測)は over-engineering なので採らない(§10-2)。

### 3.3 `keyEventsMeasured` を成績データに載せる(env をどこで読むか=重大)

**重大な前提**: `reviewLabels` の consumer は (1)承認画面 `PerformanceBoard.tsx`(**client component**・`"use client"`+`useState`)と (2)`review-due-cli.ts`(node)。**client component は server-only の `process.env` を読めない**。したがって env `GROWTH_GA4_KEYEVENTS_SINCE` を UI へ prop 直挿しするのは、pull型(承認画面は Notion ミラーを読むだけ)に反し配線も増える。

**採用(§10-3 確定)**: keyEvents 計測済みか否かを **`metrics-cli.ts`(env を読める書き込み側)が判定して `ArticleMetrics` に `keyEventsMeasured?: boolean` として載せる**。承認画面は成績データ(Notion ミラー)を読むだけで計測状態を知れる。純ロジック `reviewLabels` はこのフラグを見て分岐する。

| 変更ファイル | 内容 |
|---|---|
| `scripts/growth/metrics.ts` | `ArticleMetrics` に `keyEventsMeasured?: boolean` を追加(optional=後方互換)。`metricsSchema`(194-203行)に `keyEventsMeasured: z.boolean().optional()` を追加(旧データも valid のまま)。判定の純関数 `isKeyEventsMeasured(publishedAt, sinceYmd): boolean` を新設(env 文字列は CLI が渡す・純ロジック)。 |
| `scripts/growth/metrics-cli.ts` | env `GROWTH_GA4_KEYEVENTS_SINCE` を読み、記事ごとに `isKeyEventsMeasured(sl.publishedAt, since)` を計算して `metrics` に載せる(216-220行の metrics 合成に1フィールド足す)。薄い配線=カバレッジ除外。 |
| `scripts/growth/metricsReview.ts` | `reviewLabels` を修正: keyEvents 未計測なら「読まれるがCTA弱い」を付けず、代わりに「CV未計測」を出す。`ReviewLabel` 型に `"CV未計測"` を追加。 |
| `src/lib/growth/metrics.ts` / `metricsReview.ts` | 再エクスポートのみ(実体は scripts)。変更不要(`export *`)。 |
| `.env.example`(GROWTH セクション) | `GROWTH_GA4_KEYEVENTS_SINCE=`(任意・未設定=未計測扱い)を追記。 |
| `docs/operations/growth/60-kpi-tree.md` | §3 の keyEvents 注記に「設定完了日を `GROWTH_GA4_KEYEVENTS_SINCE` に入れる。未設定なら CV系ラベルは『CV未計測』」を1行追記(別設計書が触る `weekly.md`/`existing.ts`/`metricsReview.ts` とは別ファイル)。 |

### 3.4 `reviewLabels` の分岐(実装形)

`ReviewLabel` に `"CV未計測"` を追加。`reviewLabels(metrics, daysPublished)` の keyEvents 分岐(71-73行)を差し替える:

```ts
const keyEvents = metrics.keyEvents?.current ?? 0;
const keyEventsMeasured = metrics.keyEventsMeasured === true; // 未指定=未計測(安全側)

// ... views===0 && clicks===0 の早期 return は不変 ...

if (views >= CTA_WEAK_VIEWS) {
  if (!keyEventsMeasured) {
    labels.push("CV未計測");        // 計測前は「弱い」と断定せず沈黙もさせない
  } else if (keyEvents === 0) {
    labels.push("読まれるがCTA弱い"); // 計測済みで実0=本当に弱い
  }
}
```

- **`views < CTA_WEAK_VIEWS`(=50未満)では CV未計測も出さない**(そもそも読まれていない記事に CV の話をしない。従来「読まれるがCTA弱い」が付かなかった範囲と一致)。
- **後方互換**: 旧成績データ(`keyEventsMeasured` 無し)は `undefined` → `false` 扱い=「CV未計測」。これは正しい(旧データは keyEvents 設定前に取った可能性が高く、0 を実0と断定しないのが安全)。UI/CLI は `ReviewLabel` の新値を表示するだけ(表示側は union を map するので追従不要だが、色分け等を持つ箇所があれば既定色にフォールバック=§10-4)。

> **`未計測`(既存)と `CV未計測`(新規)の違い(明示)**: 既存 `"未計測"` は `views===0 && clicks===0`(そもそもトラフィックが無い)。新規 `"CV未計測"` は「読まれてはいるが keyEvents 計測が始まっていない」。両者は別事象なので別ラベルにする(混同しない)。

### 3.5 成績表示・サマリでの区別

- **PerformanceBoard**(client): `reviewLabels` の返す `"CV未計測"` をそのまま表示。keyEvents の数値表示がある箇所は、`keyEventsMeasured===false` のとき「0」ではなく「未計測」と出す(表示ロジックの小変更・該当があれば)。数値表示が無ければラベルのみで足りる。
- **`成績データ` JSON スキーマ**: `keyEventsMeasured` は optional 追加のみ=**既存スキーマを壊さない**(旧データも `parseMetrics` を通る)。

### 3.6 テスト計画(改善7)

| テストファイル | ケース名(新規) | 期待値 |
|---|---|---|
| `scripts/growth/metrics.test.ts` | `isKeyEventsMeasured: publishedAt が since 以降なら true` | `("2026-07-10","2026-07-01")` → true |
| 〃 | `isKeyEventsMeasured: publishedAt が since より前なら false` | `("2026-06-20","2026-07-01")` → false |
| 〃 | `isKeyEventsMeasured: since 未指定/publishedAt 不明で false` | `(undefined, ...)` / `(..., undefined)` → false |
| 〃 | `metricsSchema: keyEventsMeasured 無しの旧データも valid` | 旧 JSON → `parseMetrics` 成功 |
| `scripts/growth/metricsReview.test.ts` | `未計測期間: views≥50 keyEvents=0 は CV未計測(CTA弱いにしない)` | `keyEventsMeasured:false` → labels に `CV未計測`・`読まれるがCTA弱い` を含まない |
| 〃 | `計測済み: views≥50 keyEvents=0 は 読まれるがCTA弱い` | `keyEventsMeasured:true` → `読まれるがCTA弱い`・`CV未計測` 無し |
| 〃 | `計測済み: keyEvents>0 はどちらも付かない` | `keyEventsMeasured:true, keyEvents>0` → 両ラベル無し |
| 〃 | `views<50: CV未計測も付かない` | views=10 → CV 系ラベル無し(既存挙動維持) |

- 純ロジック(`isKeyEventsMeasured`・`reviewLabels`)は 100% カバレッジ。`metrics-cli.ts` の env 読みは配線=除外。
- **既存 `metricsReview.test.ts` の更新**: 65行「読まれるがCTA弱い: views>=50 かつ keyEvents=0」ケースは、`keyEventsMeasured:true` を明示しないと `CV未計測` に倒れる。→ このケースに `keyEventsMeasured:true` を追加して意図を固定(RED→GREEN)。**別エージェントが metricsReview を触る場合の競合注意**は §10-4。

---

## 4. 改善8: 前週比1点比較の脱却(トレンド+最低母数ガード)

### 4.1 目的と原則

前週比(`deltaPct` = current vs prior)は2点比較で、単発の上下をトレンドと誤認する。蓄積済みスナップショット(`data/snapshots/<YYYY-MM-DD>.json`・`growth:fetch` が毎週保存)を**再利用**し、直近4週の週次系列+4週移動平均を組む。**新規 API 呼び出しなし**(既存ファイルを読むだけ)。

- スナップショットは `cli.ts`(`growth:fetch`)が `data/snapshots/<実行日>.json` に保存(実行日=`jstDateString(now)`)。中身の `period`(`{start,end}`)が**実際に集計した週**(実行週の前週)。実在ファイル: `data/snapshots/2026-07-06.json`(現時点で1件)。
- ファイル読みは注入式(`SnapshotFs` と同じ作法)でテスト可能にする。

### 4.2 新規純ロジック `scripts/growth/trend.ts`

| 新規/変更ファイル | 内容 |
|---|---|
| `scripts/growth/trend.ts`(新規・純ロジック) | スナップショット群 → 週次系列+4週移動平均。**IO を持たない**(スナップショット配列を受ける純関数)+ 薄い読み込みヘルパ(fs 注入)。100% カバレッジ対象は純関数部分。 |
| `src/lib/growth/trend.ts`(新規・再エクスポート) | `export * from "../../../scripts/growth/trend"`(既存の作法)。承認画面が将来使う余地を残す(本改善では UI 表示はしない)。 |
| `scripts/growth/cli.ts`(`growth:fetch`) | 保存済みスナップショットを読み `trend` を組んで、**fetch 出力 JSON に `trend` 節として同梱**する(§4.4)。薄い配線=カバレッジ除外。 |

**純ロジックの型(案)**:

```ts
/** trend が対象にする指標のキー。GA4 と GSC の主要指標。 */
export type TrendMetricKey =
  | "sessions" | "activeUsers" | "keyEvents"          // GA4 summary
  | "clicks" | "impressions" | "ctr" | "position";   // GSC summary

/** 1週分の1指標の値(週の識別は period.end=集計週の末日)。 */
export interface TrendPoint {
  /** 集計週の末日(YYYY-MM-DD)。スナップショット内 period.end。 */
  weekEnd: string;
  value: number | null;   // 欠落は null(沈黙させない)
}

export interface TrendSeries {
  metric: TrendMetricKey;
  /** 古い→新しい順の週次系列(最大4点)。 */
  points: TrendPoint[];
  /** 4週移動平均(母数が4未満なら組める分の平均)。 */
  movingAvg: number | null;
  /** 直近週の値。 */
  latest: number | null;
}

export interface TrendReport {
  /** 蓄積週数(0〜4)。 */
  weeks: number;
  series: TrendSeries[];
  /** 参考値である旨(蓄積4週未満なら注記)。0件でも空文字ではなく明示。 */
  note: string;
}

/** スナップショット配列(順不同可)から直近4週の trend を組む。純ロジック。 */
export function buildTrend(snapshots: readonly SnapshotLike[]): TrendReport;
```

- `SnapshotLike` は `{ period?: { end?: string }, ga4?: {summary?:...}, gsc?: {summary?:...} }`(collect.ts の `GrowthSnapshot` の必要部分だけを構造的に受ける・`notify-build.ts` の `SnapshotShape` と同じ薄い型で足りる)。
- **週の識別は `period.end`**(ファイル名=実行日ではなく、集計週の末日を使う)。`period.end` でソートし直近4週を採る。`period` 欠落のスナップショットはスキップ(欠落耐性)。
- 値の抽出は `snapshot.ga4?.summary?.[0]?.metrics?.[key]?.current`(`notify-build.ts` `extractMetrics` と同じ経路)。GSC も同様。欠落は `null`。
- **移動平均**: 非 null の points の平均。0 点なら null。

### 4.3 コールドスタート耐性

- スナップショットが4週未満(現状1件)なら**組める分だけ出す**。`weeks` に実蓄積数、`note` に「蓄積N週・参考値(4週で移動平均が安定)」を明記。
- **0件でも `growth:fetch` を落とさない**: `buildTrend([])` は `weeks:0`・`series` 各指標 points 空・`note` に「スナップショット未蓄積」。cli.ts 側は trend 組成失敗を握って `trend:{weeks:0,note:...}` を出す(fetch 本体は継続)。

### 4.4 出力形態(fetch 出力に同梱=採用)

**採用(§10-5)**: 別コマンド `growth:trend` を新設せず、`growth:fetch` の出力 JSON に `trend` 節を足す。理由:

- weekly の allow は `growth:fetch`/`growth:existing`/`growth:learning-log:recent` の3つ(run.mjs 49-54行)。**新コマンドを増やすと weekly の allow 変更が要る**(=別エージェント担当の weekly.md/allow に触れる)。fetch 同梱なら **allow 変更不要**・競合ゼロ。
- weekly は既に `growth:fetch` を実行してスナップショットを読む。同じ出力に trend が載れば、weekly はそのまま参照できる(weekly.md への読み方追記は別設計書へ委譲=§4.6)。

cli.ts の変更(薄い):

```ts
// snapshot 保存後、蓄積済みスナップショットを読んで trend を組む(best-effort)。
let trend: TrendReport = { weeks: 0, series: [], note: "スナップショット未蓄積" };
try {
  const snapshots = await readRecentSnapshots({ readFile, readdir }, dir, 4); // 薄い IO ヘルパ
  trend = buildTrend(snapshots);
} catch (e) {
  process.stderr.write(`(trend 組成をスキップ: ${errMsg(e)})\n`); // fetch 本体は落とさない
}
const output = { ...snapshot, trend };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
```

- **保存する snapshot 自体には trend を含めない**(スナップショットは生データのアーカイブ。trend は導出物で毎回組み直せる)。trend は**標準出力(weekly が読む)にだけ**同梱する。→ `saveSnapshot(snapshot, ...)` は不変・後方互換。
- `readRecentSnapshots`(fs 注入・`data/snapshots/*.json` を新しい順に最大4件読む薄い IO ヘルパ)はカバレッジ除外。`buildTrend`(純)は 100%。

### 4.5 最低母数ガード(metricsReview の注記)

**採用(確定)**: `metricsReview.ts` のラベルを**消さず、信頼度を明示**する。判定に使う母数がしきい値未満のラベルには「母数小・参考値」の注記を付ける方式。

- **具体案**: `reviewLabels` は `ReviewLabel[]`(文字列 union)を返す純関数。母数注記を型に混ぜると consumer(表示・review-due)が壊れるため、**母数小の判定を別の純関数で返す**設計にする:

```ts
/** ラベルの母数が小さく参考値かどうか(信頼度)。true=母数小。 */
export function isLowSample(metrics: ArticleMetrics): boolean;
```

- **しきい値(既存定数と整合)**: 既存の `CTR_WEAK_IMPRESSIONS = 100`(impressions 母数)・`CTA_WEAK_VIEWS = 50`(views 母数)を流用する。採用値: **impressions < `CTR_WEAK_IMPRESSIONS`(=100) かつ views < `CTA_WEAK_VIEWS`(=50)** のとき「母数小」。=検索表示もセッションも小さく、どのラベルも参考値。新しい定数は増やさない(既存としきい値を一致させる)。
- consumer(PerformanceBoard/review-due)は `isLowSample(metrics)` が true のとき、ラベル群に「(参考値)」の但し書きを添える表示にする(表示側の小変更・任意)。**ラベル自体は消さない**。
- **`reviewLabels` の返り値・既存ラベルは不変**(改善7 の `CV未計測` 追加を除く)。母数注記は追加の純関数なので、別エージェントの metricsReview 変更(改善6・9)と**同じ関数を書き換えない**=競合しにくい(§10-4)。

### 4.6 weekly.md への追記は別設計書へ委譲(文言案は本書に記載)

trend の読み方を weekly.md に足すのは、weekly.md を担当する別設計書(改善6・9)へ委譲する(ファイル競合回避)。委譲する文言案(そのまま渡してよい):

> **委譲用・weekly.md 追記案(手順2「growth:fetch」直後)**: 「`growth:fetch` 出力の `trend` 節(直近4週の週次系列+4週移動平均)を読み、前週比(2点)ではなくトレンドで増減を判断する。`trend.weeks < 4` のときは `trend.note` の『参考値』を尊重し、断定を避ける。指標は sessions/activeUsers/keyEvents(GA4)・clicks/impressions/ctr/position(GSC)。」

### 4.7 データフロー(改善8)

```
growth:fetch(cli.ts)
 └ collectGrowthData → snapshot(生データ)を data/snapshots/<実行日>.json に保存(不変)
 └ readRecentSnapshots(直近4週・fs 注入) → buildTrend(純) → trend
 └ 標準出力: { ...snapshot, trend }        ← weekly がそのまま読む(allow 変更不要)

metricsReview(記事ラベル):
 └ reviewLabels(既存 + CV未計測)
 └ isLowSample(母数小=参考値) ← ラベルを消さず信頼度を添える(表示側)
```

### 4.8 テスト計画(改善8)

| テストファイル | ケース名(新規) | 期待値 |
|---|---|---|
| `scripts/growth/trend.test.ts`(新規) | `4週分から週次系列と移動平均を組む` | period.end で昇順・latest=直近週・movingAvg=4点平均 |
| 〃 | `蓄積2週なら組める分だけ・note に参考値` | weeks=2・movingAvg=2点平均・note に「参考値」 |
| 〃 | `0件でも落ちず weeks=0` | `buildTrend([])` → weeks=0・series points 空・note 明示 |
| 〃 | `period 欠落スナップショットはスキップ` | period 無しを混ぜても他週で組める |
| 〃 | `指標欠落は null(沈黙させない)` | ga4.summary 欠落週 → その週 value=null・移動平均は非 null のみ平均 |
| 〃 | `直近4週だけ採る(5件以上でも4件)` | 5スナップショット → points 最大4 |
| `scripts/growth/metricsReview.test.ts` | `isLowSample: impressions<100 かつ views<50 で true` | 該当 → true |
| 〃 | `isLowSample: どちらか母数が十分なら false` | views≥50 or impressions≥100 → false |

- 純ロジック(`buildTrend`・`isLowSample`)は 100% カバレッジ。`readRecentSnapshots`・cli.ts 配線はカバレッジ除外。
- **vitest.config.ts**: `scripts/growth/trend.ts` の IO ヘルパ(`readRecentSnapshots`)を書く場合、純ロジックと別ファイル or 除外指定にする。採用: `buildTrend` は `trend.ts` の純関数、`readRecentSnapshots` は `cli.ts` 直下 or `trend-io.ts`(除外)に置き、`trend.ts` 自体は 100% カバレッジ対象のまま保つ(§10-5)。

---

## 5. スコープ外(明記)

- **styleLint を block に昇格**・**termHints(#H22)の draftQuality 合流**(改善5)。誤検知率の観測が先。当面 warn 止まり・§6/§14 辞書のみ。
- **keyEvents の期間境界の厳密突き合わせ**(改善7)。記事の `publishedAt` が基準日以降か否かで判定する簡易方式を採用(週の一部だけ計測、の按分はしない)。
- **trend の UI 表示**(改善8)。本改善は fetch 出力への同梱 + weekly が読むまで。承認画面での trend グラフ表示は将来スコープ(`src/lib/growth/trend.ts` 再エクスポートで受け口だけ用意)。
- **`existing.ts` / `weekly.md` の変更**。改善6・9 を担当する別設計書へ委譲(§4.6 の trend 読み方追記も委譲)。本書は文言案のみ提供。
- **`metricsReview.ts` の改善6・9 側ラベル結線**(別設計書)。本書は `CV未計測` 追加・`isLowSample` 追加のみに限定し、既存ラベル計算を書き換えない(§10-4)。
- **新コマンド `growth:trend` の新設**(§4.4 で不採用)・**別 env のオーナー運用**(GA4 keyEvents 設定作業そのもの)は実装ブロッカーにしない。

---

## 6. 実装順序(依存関係)

1. **改善5(styleLint warn 統合)** — 独立・最小。`draftQuality.ts`(warn チェック + `summarizeStyleWarnings`)→ テスト → `publish-draft-cli.ts` に通知1行 → DetailPanel コメント更新 → `20-draft.md`(任意)。他改善に依存しない。
2. **改善7(keyEvents 未計測分離)** — `metrics.ts`(`isKeyEventsMeasured` + schema)→ `metricsReview.ts`(`CV未計測`)→ `metrics-cli.ts` 配線 → `.env.example` → `60-kpi-tree.md`。改善8 の `isLowSample` と同じ `metricsReview.ts` を触るため、**改善8 の母数注記と同一コミット/近接コミットで**進めると衝突が最小(§10-4)。
3. **改善8(トレンド + 母数ガード)** — `trend.ts`(`buildTrend` 純)→ テスト → `cli.ts` に同梱配線 + `readRecentSnapshots`(IO) → `metricsReview.ts`(`isLowSample`)→ `src/lib/growth/trend.ts` 再エクスポート。

> **依存の要点**: 改善7・8 はいずれも `metricsReview.ts` を触る。**同じ関数(`reviewLabels`)は改善7だけが書き換え、改善8 は `isLowSample` を新規追加**にとどめる。別エージェント(改善6・9)との三者競合を避けるため、着手前に `metricsReview.ts` の最新を再読し、`reviewLabels` の変更は最小差分にする(§10-4)。

---

## 7. 受け入れ基準

**改善5**:
- `draftQuality` の返り値に「文体注意」warn が1項目加わる。styleLint ヒットで `level=warn`、ヒット無しで `ok`。**block 判定・`evaluatePublishGate.blockReasons` は不変**(styleLint で投入・公開が止まらない)。
- 承認画面フッターに「文体注意」warn が出る(DetailPanel はロジック変更なしで自動反映)。
- 投入時、styleLint warn があれば `publish-draft` が stderr + LINE best-effort で1行通知(投入は継続)。warn 0 件なら通知しない。
- 純ロジック(`draftQuality` 追加分・`summarizeStyleWarnings`)100% カバレッジ。

**改善7**:
- `GROWTH_GA4_KEYEVENTS_SINCE` 未設定 or 記事 `publishedAt` が基準日より前 → 「読まれるがCTA弱い」を付けず「CV未計測」を出す(views≥50 のとき)。
- 基準日以降に公開・`keyEvents=0` → 従来どおり「読まれるがCTA弱い」。`keyEvents>0` → どちらも付かない。
- `成績データ` JSON に `keyEventsMeasured` が optional 追加され、旧データも `parseMetrics` を通る(後方互換)。
- `.env.example`・`60-kpi-tree.md` 更新済み。純ロジック 100% カバレッジ。

**改善8**:
- `growth:fetch` の標準出力に `trend` 節(直近4週の週次系列+4週移動平均)が同梱される。保存する snapshot ファイルは不変(後方互換)。
- スナップショット4週未満でも fetch は落ちず、`trend.note` に「蓄積N週・参考値」。0件でも落ちない。
- `metricsReview` に `isLowSample`(母数小=参考値)が加わり、母数不足のラベルに信頼度を添えられる(ラベルは消さない)。しきい値は既存定数(impressions<100 & views<50)と一致。
- weekly の allow 変更なし(新コマンドを増やさない)。純ロジック 100% カバレッジ。

**共通**:
- TDD(RED→GREEN)。純ロジックのテストが先。CLI/route/`run.mjs`/prompts/IO ラッパはカバレッジ除外。
- pull型・欠落耐性・失敗を沈黙させない。無人での commit/push なし(`run.mjs` DISALLOW 不変)。push 時のみ `ttmakhr1028ai-art`。

---

## 8. 影響範囲と後方互換

| 変更 | 後方互換 | env / 設定 |
|---|---|---|
| 改善5(draftQuality warn 追加) | warn 1項目増のみ。block 判定・ゲート不変。既存 consumer は level ベースで自然追従。 | 追加なし |
| 改善5(投入時通知) | warn 0 件なら通知しない。投入は止めない。 | 追加なし(LINE は既存) |
| 改善7(keyEventsMeasured) | optional 追加。旧成績データも valid。`ReviewLabel` に `CV未計測` 追加(表示は union map で追従)。 | `.env.example` に `GROWTH_GA4_KEYEVENTS_SINCE=` 追記(未設定=未計測扱い) |
| 改善8(trend 同梱) | fetch 標準出力に節追加のみ。保存 snapshot 不変。既存の snapshot 読み手に影響なし。 | 追加なし |
| 改善8(isLowSample) | 追加の純関数。既存 `reviewLabels` の返り値不変。 | 追加なし |

**`.env.example` 追記**: `GROWTH_GA4_KEYEVENTS_SINCE=`(改善7・GROWTH セクション、`GROWTH_WEEKLY_MODEL=` の近く)。他は env 追加不要。

**vitest.config.ts**: 新規 IO ヘルパ(`readRecentSnapshots` を別ファイルに置く場合)を `coverage.exclude` へ追記。新規純ロジック(`trend.ts` の `buildTrend`・`metrics.ts` の `isKeyEventsMeasured`・`metricsReview.ts` の `isLowSample`・`draftQuality.ts` の追加分)は**除外しない**(100% 対象)。

---

## 9. 制約(プロジェクト規約・再掲)

- TDD 必須。純ロジック(`summarizeStyleWarnings`・`isKeyEventsMeasured`・`reviewLabels` 変更分・`isLowSample`・`buildTrend`・draftQuality 追加分)は 100% カバレッジ。CLI・prompts・`run.mjs`・IO ヘルパは `vitest.config.ts` の `coverage.exclude`。
- TS strict / `any` 禁止(外部入力は `unknown`＋zod/型ガード)/ `import type` / boolean は is/has/should/can(`keyEventsMeasured`・`isLowSample` は規約準拠)/ handler は on/handle / `@ts-ignore` 禁止。
- 純ロジック分離: ロジックは `scripts/growth/*.ts`＋`src/lib/growth/*` 再エクスポート。単一ソース化(draftQuality は UI・投入ゲート・通知で同一関数)。
- pull型・欠落耐性・失敗を沈黙させない(warn/未計測/母数小/取得失敗はすべて stderr or 表示で可視化)。
- 出力(spec/計画/コミット/説明)は日本語。無人での push/commit 禁止(`run.mjs` DISALLOW 継続)。

---

## 10. 要確認(設計判断とコードの食い違い・codex 着手前に確認)

> 確定済み設計判断は覆さない。以下は「判断を実コードに接地させる際の解釈確定」。各項に採用案を明記済み。codex はこのまま着手してよい。

**10-1. 改善5 の DetailPanel「既存 styleLint 直接利用」は存在しない(重要)**
確定判断「DetailPanel の既存 styleLint 直接利用を draftQuality 経由に置き換えるか併存か」。裏取りの結果、**styleLint はどの本番経路からも呼ばれていない**(参照は自前テストと DetailPanel の**コメント2箇所**のみ)。置き換える対象が無い。**採用**: DetailPanel はロジック変更せず、`draftQuality` に warn を足すことで自動的にフッターへ出す。DetailPanel の該当コメント(13行・256行)は「draftQuality に warn 統合済み」に更新する。挙動退行なし(warn 増のみ・block 不変)。【確定】置き換え/併存の判断は不要(既存直接利用が無いため)。

**10-2. 改善7 の計測判定基準(期間境界)**
確定判断「基準日より前の期間・記事は未計測扱い(適切な基準を設計)」。**採用**: 記事の `publishedAt`(microCMS・既に metrics に載る)が `GROWTH_GA4_KEYEVENTS_SINCE` 以降なら計測済み、それ以外(前・不明)は未計測。週の一部だけ計測、の期間按分はしない(over-engineering)。`publishedAt` 不明は安全側で未計測。【確定】publishedAt≥since で計測済み。

**10-3. 改善7 の env をどこで読むか(重要)**
`reviewLabels` の consumer に承認画面 `PerformanceBoard.tsx`(**client component**)がある。client は server-only env を読めない。**採用**: `metrics-cli.ts`(env を読める書き込み側)が `keyEventsMeasured` を判定し `ArticleMetrics`(成績データ)に載せる。承認画面は Notion ミラーを読むだけ(pull型維持)。純ロジック `reviewLabels` はフラグで分岐。UI へ env を prop 直挿ししない。【確定】書き込み側で判定・データに同梱。

**10-4. 改善7・8 と別エージェント(改善6・9)の `metricsReview.ts` 三者競合**
本書は `metricsReview.ts` に (a)`reviewLabels` の keyEvents 分岐差し替え + `CV未計測` 追加(改善7)、(b)`isLowSample` 新規追加(改善8)を入れる。別エージェントも `metricsReview.ts` のラベル結線を触る。**採用**: 競合最小化のため、(b) は新規純関数の追加のみ(既存を書き換えない)、(a) は `reviewLabels` の keyEvents 分岐という局所差分に限定する。**codex は着手前に `metricsReview.ts` の最新(別エージェント反映後かもしれない)を再読し、`reviewLabels` の該当ブロックだけを最小差分で更新**する。`ReviewLabel` union への `CV未計測` 追加は破壊的でない(表示は map)。表示側で色分け等の網羅 switch があれば default フォールバックを確認(§3.4)。【確定】新関数追加+局所差分。着手前に再読。

**10-5. 改善8 の出力形態と IO/純の分離**
確定採用「fetch 出力に同梱(weekly の allow 変更不要)」。**採用**: 保存 snapshot ファイルは不変(生データアーカイブ)、trend は fetch の**標準出力にだけ**同梱。`buildTrend` は純(100%)、`readRecentSnapshots`(fs 注入の薄い読み込み)は別配置でカバレッジ除外。新コマンド `growth:trend` は作らない。【確定】fetch 標準出力同梱・純/IO 分離。

**10-6. 改善5 の警告 typo 防止(軽微)**
§2.4 の hint 文字列例に全角混じりの下書き表現があるが、実装では正しい日本語(例「§6/§14 の要確認語(誤検知あり・人が判断)」)にする。文言は codex 裁量で自然文に整える(挙動に影響なし)。【確定】文言は自然文に整える。

---

## 11. 参照(裏取り済みの要点)

- `styleLint.ts`(`src/lib/growth/`): `styleLint(plain)`→`StyleLintHit[]`、`styleLintSummary(hits)`→カテゴリ別件数。本番未結線(自前テストのみ)。
- `draftQuality.ts`(`src/app/growth/approve/`): warn は `warnIf` で level 判定、`plainText(input)` で本文取得済み。`evaluatePublishGate`(`publishGate.ts`)は block のみ抽出。
- `metrics.ts`(`scripts/growth/`): `ArticleMetrics` に `keyEvents?`・`publishedAt?` あり(optional・後方互換)、`metricsSchema`(zod)で旧データも valid。`metrics-cli.ts` が `publishedAt` を microCMS から取得済み(126行)。
- `metricsReview.ts`(`scripts/growth/`): `reviewLabels(metrics, daysPublished)`。既存定数 `CTR_WEAK_IMPRESSIONS=100`・`CTA_WEAK_VIEWS=50`。consumer は `PerformanceBoard.tsx`(client)・`review-due-cli.ts`(node)。
- `collect.ts`/`snapshot.ts`/`cli.ts`(`scripts/growth/`): snapshot 構造は `{generatedAt, period{start,end}, priorPeriod, ga4{summary,...}, gsc{summary,...}, errors}`。ファイル名=`jstDateString(実行日)`、`period` が集計週。ga4/gsc の summary は `[{keys:[],metrics:{<name>:{current,prior,deltaPct}}}]`。実在: `data/snapshots/2026-07-06.json`。
- `run.mjs` weekly allow: `growth:fetch`/`growth:existing`/`growth:learning-log:recent`(fetch 同梱なら不変)。
- 🔴4件(未コミット)確認済み: `publishGate.ts` に `resolveGateArticleType`/`publishGateReason`/`evaluateRegate`、`publish-draft-cli.ts` に quality-gate ステージ+`knownArticlePathsForMedia`、`.env.example` に `GROWTH_WEEKLY_MODEL=`、`00-canon.md` に weekly モデル記述、いずれも本設計の前提と整合。
