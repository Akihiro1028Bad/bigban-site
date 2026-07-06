# グロースループ レビュー指摘 修正4件 設計書

- 対象リポジトリ: `bigban-growth-loop-mvp`
- 起票日: 2026-07-06
- 前提レビュー: `docs/superpowers/specs/2026-07-06-growth-article-quality-uplift-design.md` および 2026-07-06 実装レビューの改善バックログ
- 関連正典: `docs/operations/growth/00-canon.md`(pull型・純ロジック分離・欠落耐性・失敗を沈黙させない)、`CLAUDE.md`(TDD 必須・純ロジック 100% カバレッジ・CLI/`run.mjs`/`gen-*` はカバレッジ除外)
- 実装体制: 実装は codex。設計判断は本書で確定済み(codex は覆さない)。疑義は本書「要確認」で明示。

---

## 0. サマリ(この設計書で閉じる4つの穴)

| 修正 | 何が壊れている/足りないか | どのループを閉じるか |
|---|---|---|
| 修正1: SI2 結線 | 学習ログ(SI1)を集める配線は入ったが、weekly が `growth:learning-log:recent` を読む結線が未了で「システム振り返り」が空回りする。 | セルフチューニング(学習→改善提案)ループ |
| 修正2: 投入前ゲート引数欠落 | `publish-draft-cli.ts` の quality-gate が `evaluatePublishGate` に `articleType`・`knownNewsPaths` を渡さず、壊れた内部リンク(§15)を投入前に検出できない。 | 生成→投入の品質ゲート |
| 修正3: weekly モデル固定 | weekly のネタ出しにモデル指定が無く、下流(記事品質)の上限を握る工程が既定モデル任せになっている。 | ネタ出し→執筆の品質底上げ |
| 修正4: 再ゲート | 投入時に1回ゲートするだけで、公開直前・AI 修正適用時の再検査が無い。投入後に本文が変わって block 条件に落ちても素通りする。 | 公開直前・修正適用時の最終防波堤 |

**重大な要確認(先に読むこと)**: 確定済み設計判断のうち、修正2・修正4(b)・修正4(a) に、現行コードと前提が食い違う箇所がある(§10 に集約)。設計方針は維持しつつ、コードに接地する形へ具体化した。codex は §10 を必ず読んでから着手すること。

---

## 1. 背景と目的

グロースループは「pull 型・純ロジック分離・欠落耐性・失敗を沈黙させない」を共通原則に、承認画面(Vercel)は Notion に依頼を書くだけ、重い処理は常時稼働 PC のループが拾う構成で組み上がっている(`00-canon.md`)。今回のレビューで、既に土台のあるループに「最後の一結線」が欠けている箇所が4つ見つかった。いずれも新モード・新ループを増やさず、既存の純ロジック(`evaluatePublishGate`・`summarizeLearningLog` 等)と既存の配線に**1本ずつ結線を足す**ことで閉じる。

---

## 2. 修正1: SI2 結線(学習ログを weekly に読ませる)

### 2.1 目的

SI1(`docs/superpowers/specs/2026-07-05-growth-self-tuning-loop-design.md` §3)で、手動編集・採否・画像試行・工程失敗を Notion「学習ログ」DB に追記する経路は実装済み。SI2 §4 で定義した「weekly のシステム振り返り」を動かすには、weekly が `growth:learning-log:recent` を実行して直近4週の学習ログを読む結線が要る。これが未了。SI2 設計 §4.2 / §8「フェーズ SI2」の 3 項に完全準拠する(乖離させない)。

### 2.2 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `scripts/growth/run.mjs`(41-51 行 weekly モード allow) | weekly の `allow` に `"Bash(npm run growth:learning-log:recent)"` を1要素追加。読み取り1コマンドのみ(append 系は許可しない=SI2 §6.1)。 |
| `scripts/growth/prompts/weekly.md`(`<workflow>` 手順2直後・手順3) | ①手順2(`growth:existing`)の直後に `growth:learning-log:recent` の実行と読み取りを追記。②手順3(マーケター分析)に「システム振り返り」工程を追記。③`<non_negotiables>` に `facility-context.json` 聖域の非交渉ルールを追記。 |

`package.json` は変更不要(`growth:learning-log:recent` = `tsx scripts/growth/learning-log-cli.ts recent 4` は 40-41 行に既存)。

### 2.3 `run.mjs` の allow 追記(正確な差分)

現状(41-51 行):

```js
weekly: {
  prompt: "weekly.md",
  allow: [
    ...COMMON,
    "Bash(npm run growth:fetch)",
    "Bash(npm run growth:existing)",
  ],
},
```

→ `"Bash(npm run growth:existing)",` の直後に `"Bash(npm run growth:learning-log:recent)",` を1行足す。COMMON・他モードは不変。

### 2.4 `weekly.md` への追記(挿入位置・SI2 §4.2 準拠)

`weekly.md` は現状 75 行。挿入位置を行番号で指定する(codex は編集前に再読して最終位置を確認すること。周辺テキストの一意アンカーで特定するのが安全)。

**(a) 入力の追加**: 手順2(24-28 行のブロック)の末尾サブ項目として、以下の趣旨を1項目追加する(SI2 §4.2「入力の追加(手順2の直後)」)。
- `npm run growth:learning-log:recent` を実行し、直近4週の学習ログ(種別別件数・対象別ヒートマップ・画像リトライ上位・失敗モード頻度)を読む。
- この出力は「システム振り返り」の一次データ。**学習ログが空(DS 未設定/0件)なら従来動作**(推測せず、システム改善提案を出さない)。
- weekly が実行してよいのは引数無しの `growth:learning-log:recent` のみ(`-- recent 8` 等の可変引数は人間の手動調査用=SI2 §4.5)。
- **「避ける学習・伸ばす学習」への接続(本タスクの主眼)**: 手順2に既にある「避ける学習(却下理由の一般化)」「伸ばす学習(#221)」の入力として、学習ログの4領域(編集領域ヒートマップ=毎回直される領域 / 採否の採用観点 / 画像リトライ多発スタイル / 失敗モード頻度)を併用する。編集ヒートマップで毎回直される領域は「避ける」側へ、採用観点で伸びている型は「伸ばす」側へ寄せる。

**(b) 分析工程の追加(手順3の後)**: SI2 §4.2「分析工程の追加(手順3の後・システム振り返り)」の①〜④(記事の質 / 運用効率 / ツール機能 / グロース施策の強化)をそのまま記述する。①②の diff 案・③の要件案は施策提案 DB に `カテゴリ=システム改善`・`-SYS-` 施策 ID で登録(SI2 §4.3/§4.4)。**SI2 §4.4 のページ本文フォーマット(`buildSystemProposalBlocks` の構造)に従う**。

**(c) 非交渉ルール**: `<non_negotiables>`(6-12 行)に、SI2 §4.2 の `facility-context` 聖域を追記する:「システム振り返りは `scripts/growth/facility-context.json` の確定事実・doNotWrite を変更する提案を出してはならない(人間だけが更新する聖域)」。

> 注(SI2 との整合): §2.4(b)(c) は SI2 設計で既に「フェーズ SI2」として定義済み。本タスクは **SI2 §8 フェーズ SI2 の 3 項(weekly.md 追記 + run.mjs allow 追加)を実施するもの**。純ロジック `systemProposal.ts`・`カテゴリ=システム改善` 値追加(SI2 §8 の 1・2 項)が未了なら、それらは SI2 側タスクの前提であり本タスクのスコープに含めるか要調整(§10-1)。

### 2.5 データフロー

```
weekly 実行
 └ growth:fetch(スナップショット)
 └ growth:existing(既存3DB・却下理由・成績サマリ)      ← 唯一のグラウンドトゥルース
 └ growth:learning-log:recent(直近4週の学習ログ JSON)   ← 今回結線(読み取りのみ)
 └ マーケター分析6カテゴリ + システム振り返り4領域
 └ 施策提案 DB へ登録(コンテンツ=記事ネタ案 / 他5+システム改善=施策提案)
```

### 2.6 エラー/欠落時の挙動

- `GROWTH_LEARNING_LOG_DS` 未設定 → `learning-log-cli.ts recent`(188-212 行)が `[]` を出力。weekly は「学習ログなし=従来動作」。沈黙落ちしない。
- 学習ログ100件打ち切り時は `recent` が stderr に警告を出す(既存挙動・209 行)。weekly はこれを認識してよいが挙動は変えない。

### 2.7 テスト計画(修正1)

`run.mjs`・`weekly.md` はいずれもカバレッジ除外(薄い配線・プロンプト)。ただし `run.test.ts`(dry-run の起動引数検証)に **weekly の allow 追加を固定するケース**を足す(TDD: 先に RED)。

| テストファイル | ケース名(新規) | 期待値 |
|---|---|---|
| `scripts/growth/run.test.ts` | `weekly は learning-log:recent を allowedTools に含む` | `dryRun("weekly")` の出力が `growth:learning-log:recent` を含む |
| `scripts/growth/run.test.ts` | `weekly には --model を付けない`(既存・§4 修正3で更新) | 修正3で weekly に model が付くため、このケースは修正3で置換(§4.6 参照) |

> `run.test.ts` は `execFileSync` で dry-run 出力の**部分文字列**を検証する方式(既存 18-56 行)。allow は `.join(" ")` で空白展開されるため、`growth:learning-log:recent` の部分一致で確実に拾える(§2.3 の現行 weekly dry-run 出力に `Bash(npm run growth:fetch) Bash(npm run growth:existing)` が並ぶのと同じ形)。

---

## 3. 修正2: 投入前ゲートの引数欠落(`articleType`・`knownNewsPaths`)

### 3.1 目的

`publish-draft-cli.ts` の quality-gate ステージ(184-195 行)は `evaluatePublishGate({ bodyHtml, title })` しか渡していない。`publishGate.ts`(§25-27 行)は `articleType`・`knownNewsPaths` を受けられるのに未指定のため:
- 文字数チェックが常に `single` 閾値(cornerstone 記事が過小判定される)。
- **§15 壊れた内部リンク検査が完全にスキップされる**(`draftQuality.ts` 195-198 行: `knownNewsPaths` 未指定なら検査ゼロ)。

承認画面 API(`draft/route.ts`)は `knownArticlePaths(media)` で既知パスを組み立てて `knownNewsPaths` を渡している(89-95 行)。同じ判定を投入前にも効かせ、単一ソース化する。

### 3.2 knownNewsPaths ビルダーの共有純ロジック抽出

**現状の重複源**: `src/app/api/growth/draft/route.ts` 46-53 行 `knownArticlePaths(media)`:
```ts
async function knownArticlePaths(media: GrowthMedia): Promise<string[]> {
  const segment = growthArticleSegment(media);
  const slugs = segment === "columns" ? await getColumnSlugs() : await getNewsSlugs();
  return slugs.filter((s) => s.locale === "ja").map((s) => `/ja/${segment}/${s.slug}`);
}
```

**抽出方針(pull型・純ロジック分離)**: slug 取得(IO)そのものは純ロジックにできないため、「slug 配列 → パス集合」の**純関数**と、「media → slug 取得 → パス集合」の**薄い IO ラッパ**に分ける。

| 新規/変更ファイル | 内容 |
|---|---|
| `scripts/growth/knownPaths.ts`(新規・純ロジック) | `buildKnownArticlePaths(segment, slugs): string[]`。`segment`(`"news"\|"columns"`)と `slugs: ReadonlyArray<{ locale: string; slug: string }>` を受け、`locale==="ja"` を `/ja/${segment}/${slug}` へ写像。**IO を持たない=テスト対象・100% カバレッジ**。 |
| `src/lib/growth/knownPaths.ts`(新規・再エクスポート) | `export * from "../../../scripts/growth/knownPaths"`(既存再エクスポートの作法に合わせる)。 |
| `scripts/growth/knownArticlePaths.ts`(新規・薄い IO ラッパ)または既存 route 内関数の移設先 | `knownArticlePathsForMedia(media, deps)`: `growthArticleSegment(media)` → `deps.getColumnSlugs()`/`deps.getNewsSlugs()` → `buildKnownArticlePaths`。slug 取得関数は引数注入にして CLI(node)と route(next)双方から使えるようにする。**IO ラッパはカバレッジ除外**(vitest.config.ts の exclude に追記)。 |
| `src/app/api/growth/draft/route.ts`(46-53 行) | ローカル `knownArticlePaths` を削除し、共有ラッパ(または純関数 + 既存 slug 取得)を呼ぶ形に置換。**挙動不変**(既存 route テストを壊さない)。 |
| `scripts/growth/publish-draft-cli.ts`(184-195 行) | quality-gate で共有ラッパを best-effort 呼び出し、`evaluatePublishGate` に `articleType`・`knownNewsPaths` を渡す。 |

> **API キー種別(裏取り済み)**: route 側 `getColumnSlugs`/`getNewsSlugs`(`src/lib/microcms/columnsQueries.ts` / `queries.ts`)は `client.ts` 経由で **`MICROCMS_API_KEY`**(content 読み取りキー)を使う。CLI は現状 `MICROCMS_CONTENT_API_KEY ?? MICROCMS_MANAGEMENT_API_KEY`(publish-draft 138-141 行)。**CLI から slug 一覧を引くには読み取り可能な content キーで足りる**(公開一覧の GET)。ただし CLI 側で `getColumnSlugs`/`getNewsSlugs` をそのまま使うと `MICROCMS_API_KEY` に依存する。CLI は既に `dotenv/config` を読むので `MICROCMS_API_KEY` が env にあれば流用可。**要確認(§10-2)**: CLI 実行環境に `MICROCMS_API_KEY` が無い場合に備え、slug 取得の失敗は §3.4 のフォールバックで吸収する(投入は止めない)。

### 3.3 articleType(cornerstone/single)の判定

**重大な前提の食い違い(§10-3 に詳細)**: `evaluatePublishGate` の `articleType`(`draftQuality.ts` 14-15 行)は `"single" | "cornerstone"` の**文字数閾値の軸**。一方 `spec.payload.articleType` は microCMS の select 値で `["獲得"]`/`["不安解消"]` 等の**マーケティング記事タイプ**(`drafts.md` 57 行・別軸 #C4)。**両者は無関係な別軸**であり、`spec.payload.articleType` から `cornerstone`/`single` を直接読むことはできない。

**確定判断を接地させる判定ロジック(採用)**:
- 投入 spec に cornerstone を示す明示フラグが無い現状では、`evaluatePublishGate` へ渡す `articleType` は **`spec.payload` の cornerstone 指示を優先し、無ければ `single`(既定=現行挙動)** とする。具体的には次の優先順で判定する純関数 `resolveGateArticleType(spec.payload)` を `publishGate.ts`(または `knownPaths.ts` と別の純ロジック)に置く:
  1. `spec.payload.cornerstone === true`(boolean)なら `cornerstone`。
  2. それ以外は `single`。
- **理由**: 承認画面 UI(`DetailPanel.tsx` 259-265 行)も現状 `articleType` を渡さず常に `single` で判定している。投入前ゲートを承認画面と同基準にするなら **`single` 既定が現行と最も整合**する。cornerstone を効かせたい記事は下書きモードが `payload.cornerstone: true` を明示ステージする運用に寄せる(drafts.md 側の追記は本タスクのスコープ外=§8 に明記。当面は全記事 single で現行と同挙動)。

> この判定は「設計判断そのものを覆さない」範囲での具体化。確定判断「spec.payload から cornerstone/single を判定」を、実在しない `spec.payload.articleType` ではなく **`spec.payload.cornerstone` フラグ**で実装する(§10-3 で承認要否を明示)。

### 3.4 欠落耐性(確定・§10-2 の吸収)

quality-gate ステージの擬似コード:
```
run: async () => {
  let knownNewsPaths: ReadonlySet<string> | undefined;
  try {
    const media = growthMediaForRow(spec.media);          // 既存(publish-draft 135 行)
    const paths = await knownArticlePathsForMedia(media, deps);
    knownNewsPaths = new Set(paths);
  } catch (e) {
    knownNewsPaths = undefined;                            // 取得失敗=検査スキップにフォールバック
    const msg = `品質ゲート: 既知記事パスの取得に失敗。壊れリンク検査をスキップして続行します: ${errMsg(e)}`;
    process.stderr.write(`${msg}\n`);
    await notifyLineBestEffort(msg);                       // 既存 109-121 行の best-effort 通知
  }
  const gate = evaluatePublishGate({
    bodyHtml: String(spec.payload.bodyHtml ?? ""),
    title: String(spec.payload.title ?? ""),
    articleType: resolveGateArticleType(spec.payload),
    knownNewsPaths,
  });
  if (!gate.ok) throw new Error(`品質ゲート不合格(投入中断): ${gate.blockReasons.join(" / ")}`);
}
```
- `knownNewsPaths` 取得失敗 → `undefined` を渡す=`draftQuality` の §15 検査スキップ(従来動作)。**投入自体は止めない**。警告 stderr + LINE best-effort 通知。
- `gate.ok === false`(§5 免責欠落 / §13 doNotWrite 断定 / §15 壊れリンク)→ 既存どおり `throw`。`runStages` の `failedAt` 経路で分類 + throttle + LINE 通知(publish-draft 321-368 行)に自然に載る。

### 3.5 データフロー

```
publish-draft -- spec.json
 └ quality-gate ステージ
     ├ media 判定(growthMediaForRow)
     ├ 既知記事パス取得(best-effort・失敗→undefined+通知)
     └ evaluatePublishGate(bodyHtml, title, articleType=single|cornerstone, knownNewsPaths)
         └ block あり → throw(投入中断・既存の failedAt 通知経路)
 └ body-images → create → eyecatch → notion:update
```

### 3.6 テスト計画(修正2)

| テストファイル | ケース名 | 期待値 |
|---|---|---|
| `scripts/growth/knownPaths.test.ts`(新規) | `ja のみ /ja/{segment}/{slug} に写像する` | news/columns 双方で ja slug のみ変換・en/他 locale 除外 |
| 〃 | `空 slug 配列で空配列` | `[]` |
| 〃 | `segment=columns は /ja/columns/ を作る` | パスに `columns` セグメント |
| `scripts/growth/publishGate.test.ts`(既存に追記) | `resolveGateArticleType: cornerstone フラグで cornerstone` | `{cornerstone:true}` → `"cornerstone"` |
| 〃 | `resolveGateArticleType: 既定は single` | フラグ無し/false/文字列 articleType → `"single"` |
| 〃 | `knownNewsPaths を渡すと壊れリンクが block になる` | 既知に無い `/ja/news/x` を含む本文で `ok=false`・`blockReasons` に §15 が入る |
| 〃 | `knownNewsPaths 未指定なら §15 は検査されない` | 壊れリンクありでも `ok=true`(§5/§13 が無い場合) |

- 純ロジック(`buildKnownArticlePaths`・`resolveGateArticleType`・`evaluatePublishGate`)は 100% カバレッジ。
- IO ラッパ(`knownArticlePathsForMedia`)・CLI 配線・route 差し替えはカバレッジ除外(既存 `draft/route.ts` は route テストで担保・挙動不変)。
- **既存テストを壊さない**: `draft/route.ts` のローカル関数削除後も、公開 slug 取得のモックが同じ形なら route テストは通る。codex は route の既存テスト(`src/app/api/growth/draft/route.test.ts` があれば)を先に走らせて RED/GREEN を確認。

---

## 4. 修正3: weekly モデル固定

### 4.1 目的

ネタ出し(weekly)の質が下流(記事品質)全体の上限を決めるため、weekly も執筆モードと同様に明示モデルを固定する。既定は `claude-opus-4-8`、`GROWTH_WEEKLY_MODEL` で上書き可。`DRAFTS_MODEL`(39 行)と同じイディオム・コメントスタイルにする。

### 4.2 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `scripts/growth/run.mjs`(39 行付近) | `DRAFTS_MODEL` 定義の直後に `WEEKLY_MODEL` を追加。 |
| `scripts/growth/run.mjs`(44-51 行 weekly モード) | weekly に `model: WEEKLY_MODEL` を設定。 |
| `.env.example`(GROWTH_ セクション) | `GROWTH_WEEKLY_MODEL=`(任意・既定 claude-opus-4-8)を追記。 |
| `docs/operations/growth/00-canon.md`(23 行) | 「下書き系の勝負所モデル」記述に weekly も含める旨を追記(§4.5)。 |

### 4.3 `run.mjs` の差分

39 行の直後に足す(DRAFTS_MODEL のコメントスタイルに合わせる):
```js
// 週次(ネタ出し)は下流(記事品質)全体の上限を握る勝負所なので既定で Opus 4.8 に固定する。
// GROWTH_WEEKLY_MODEL で上書き可能。
const WEEKLY_MODEL = process.env.GROWTH_WEEKLY_MODEL || "claude-opus-4-8";
```
weekly モード(44-51 行)へ `model: WEEKLY_MODEL,` を追加:
```js
weekly: {
  prompt: "weekly.md",
  allow: [ ...COMMON, "Bash(npm run growth:fetch)", "Bash(npm run growth:existing)",
    "Bash(npm run growth:learning-log:recent)" ],   // 修正1
  model: WEEKLY_MODEL,                                // 修正3
},
```

### 4.4 起動引数・DRYRUN への影響

- 188-190 行 `if (cfg.model) args.push("--model", cfg.model);` は既存のまま。weekly に `model` が付くことで `--model claude-opus-4-8` が起動引数に載る。
- DRYRUN 出力(194-204 行)は `args.join(" ")` をそのまま出すので、weekly dry-run に `--model claude-opus-4-8` が現れる。**これは既存 `run.test.ts` の「weekly には --model を付けない」ケース(29-31 行)を破る** → §4.6 で更新。

### 4.5 ドキュメント更新の要否(裏取り)

`00-canon.md` 23 行は「下書き系の勝負所モデルは既定 `claude-opus-4-8`(`GROWTH_DRAFTS_MODEL` で上書き可)」。weekly も同モデル固定になるため、この行に **weekly を含める1文**を足す(例:「weekly(ネタ出し)も同様に既定 opus・`GROWTH_WEEKLY_MODEL` で上書き可」)。他の docs(`00-canon.md` 以外)は「下書き系の既定モデル」記述が無いため更新不要。

### 4.6 テスト計画(修正3)

`run.test.ts`(カバレッジ除外だが dry-run 引数の回帰テストとして維持)を **RED→GREEN** で更新:

| ケース | 変更 |
|---|---|
| `weekly には --model を付けない`(29-31 行) | **削除または反転**。→ `weekly は既定で --model claude-opus-4-8 を付ける` に置換(`dryRun("weekly")` が `--model claude-opus-4-8` を含む)。 |
| 新規 `GROWTH_WEEKLY_MODEL で週次モデルを上書きできる` | `dryRun("weekly", { GROWTH_WEEKLY_MODEL: "claude-sonnet-4-6" })` が `--model claude-sonnet-4-6` を含む(drafts の 23-27 行と対称)。 |

> TDD 順序: 先に新ケースを書いて RED(現状 weekly に model 無しで落ちる)→ `run.mjs` 実装 → GREEN。既存 29-31 行の反転も同一コミットで行う。

---

## 5. 修正4: 再ゲート(公開直前 + AI 修正適用時)

投入時に1回だけゲートする現状に対し、**本文が投入後に変わりうる2点**で再検査を足す。純ロジック(ゲート判定・対象選別・新旧差分の block 比較)を切り出し、CLI/route は薄い配線に留める。

### 5.1 (a) 公開直前ゲート

#### 5.1.1 対象と body ソース(裏取り済み・§10-4)

公開経路は2つ:
- **予約公開 CLI**: `scripts/growth/publish-due-cli.ts`(到来分を公開)。
- **即時公開 route**: `src/app/api/growth/publish/route.ts`(承認画面の「公開」)。

両経路とも body ソースは **microCMS ではなく Notion ミラー `下書き本文HTML`**(`draftBodyOf(page)` / `richTextOf(page, "下書き本文HTML")`)であり、`removeAiDisclaimer` で注記除去 → `patchDraft` で microCMS へ同期 → `publishContent` の順(#95 / #176)。

> **確定判断との差分(要確認 §10-4)**: 確定判断は「microCMS から最新の bodyHtml/title を取得して再ゲート」。しかし現行アーキテクチャの**プレビュー正本は Notion ミラー**であり、公開直前に patchDraft する本文もこのミラー由来。**再ゲートは Notion ミラー本文(`removeAiDisclaimer` 適用後)に対して行うのが現行と整合**する(承認画面 UI も `draftQuality` を同ミラーで判定)。microCMS を別途 GET する関数は現状存在しない(§10-4)。本設計は**ミラー本文で再ゲート**を採用する。

#### 5.1.2 純ロジック(テスト対象)

`scripts/growth/publishQueue.ts`(公開キューの純ロジック集約先)に追加、または新規 `scripts/growth/publishGateSelect.ts`:
- `evaluatePublishGate` は既存(`publishGate.ts`)。公開直前は **除去前の raw ミラー本文**で呼ぶ(レビュー確定)。
  - **理由(重要)**: `draftQuality` の block には「§5 AI免責文の欠落」が含まれる。`removeAiDisclaimer` 適用後の本文でゲートすると**全記事が常に免責欠落 block となり公開が全停止**する。下書きの正本(raw ミラー)には免責文が必ず含まれるため、raw でゲートすれば §5 チェックは正しく通り、§13 doNotWrite・§15 壊れリンクの検査対象テキストも実質同一。
- 対象選別は既存の `selectDuePublications`(到来分)+ 既存の `hasUnfinishedImageGeneration`(画像未完スキップ)に、**ゲート block を新たな「要対応」理由として足す**。純関数として `publishGateReason(bodyHtml, title, articleType, knownNewsPaths): string | null`(block があれば理由文字列・無ければ null)を切り出し、テスト可能にする。

#### 5.1.3 CLI/route 配線(薄い)

`publish-due-cli.ts` の `for (const item of due)` ループ(137-175 行)内、`publishContent` の**直前**に:
```
const rawBody = richTextOf(page, "下書き本文HTML");
const knownNewsPaths = <best-effort 取得・失敗→undefined>;    // 修正2 の共有ラッパ
// ゲートは raw ミラー本文(免責文あり)に対して行う(§5.1.2 レビュー確定)。
// removeAiDisclaimer 後の cleanBody は従来どおり公開用 patchDraft にのみ使う。
const reason = publishGateReason(rawBody, title, resolveGateArticleType(...), knownNewsPaths);
if (reason) {
  // その記事だけスキップ(他は続行)・LINE 通知・次回再試行できる冪等設計
  gateSkipped.push({ title, reason });
  continue;   // ステータスは 下書き作成済み/承認 のまま=次回ループで再評価(冪等)
}
const { body: cleanBody } = removeAiDisclaimer(rawBody);     // 既存 156-157 行(位置は現状維持でも可)
await patchDraft(...); await publishContent(...); ...
```
- **他の記事は続行**(`continue` で当該のみスキップ)。
- **Notion への書き込みはしない(§10-5 レビュー確定)**: 当初案の `却下理由` 追記は**不採用**。`却下理由` は `existing.ts` が weekly の「避ける学習」入力として LLM に渡すため、公開ゲート保留(却下ではない)を書くと**学習データを汚染**する。可視化は (1) LINE 通知(下記)と (2) 承認画面 UI が同じ `draftQuality` block を赤バッジ表示すること、の2経路で担保し「沈黙させない」を満たす。ステータス・予約時刻は変えない=次回再評価の冪等を保つ。
- **LINE 通知**: 既存 `publishDueNotify.ts` のイディオム(`buildPublishDueSkipMessage` 相当)に倣い、`buildPublishDueGateBlockMessage(items)` を追加(純ロジック・テスト対象)。CLI は `notifyLine` で送るだけ。publish-due は繰り返し実行されるため、同一記事・同一理由の連続通知は既存 `notify-throttle.ts` のイディオムでスロットリングする(実装形は既存パターンに従う)。
- **冪等**: ステータスを公開済みにしないので、次回 publish-due 実行で同じ行を再評価。人が本文を直せば次回通る。予約(`公開予約時刻`)は消さない。

即時公開 route(`publish/route.ts`)も同様に `publishContent` 直前(131-144 行付近)へ再ゲートを1段挟む。block 時は 409 相当(`{ success:false, error }`)を返し公開しない。route は薄く、判定は `publishGateReason` を共有。

#### 5.1.4 テスト計画(修正4a)

| テストファイル | ケース名 | 期待値 |
|---|---|---|
| `scripts/growth/publishQueue.test.ts` または `publishGateSelect.test.ts`(新規) | `publishGateReason: block ありで理由を返す` | §5 免責欠落本文 → 非 null 理由 |
| 〃 | `publishGateReason: block なしで null` | 正常本文(免責文あり raw) → `null` |
| 〃 | `publishGateReason: raw 本文で免責文 block が誤発火しない` | 免責文を含む raw 本文 → §5 は block にならない(除去後本文を渡す誤実装の回帰防止) |
| `scripts/growth/publishDueNotify.test.ts`(既存に追記) | `buildPublishDueGateBlockMessage: 対象を列挙` | タイトル+理由の要約・0件で空 |

CLI/route の配線はカバレッジ除外。

### 5.2 (b) AI 修正適用時ゲート

#### 5.2.1 適用箇所の再特定(重大な要確認 §10-6)

確定判断は「`advise-apply.ts` と comment-revise 系で **patchDraft による本文更新の前**に新旧両方の bodyHtml を `evaluatePublishGate` に通す」。しかし裏取りの結果:
- `advise-apply.ts`(1-368 行)・`bodyComment.ts` は**純ロジックのみで patchDraft を呼ばない**。CLI(`advise-apply-cli.ts` 11 行・`comment-revise-cli.ts` 11 行)は明示的に「**本文・下書き・microCMS には書き込まない**(反映は人が承認画面で行う)」。
- **実際の本文反映(patchDraft)は `/api/growth/draft/edit`**(`draft/edit/route.ts` 141 行)で起きる。advise-apply / comment-revise の採用反映は、承認画面が `source: "advise-apply" | "comment-revise"` 付きで**この edit route を叩く**(`draft/edit/route.ts` 75-77 行 `isAdopt` 判定)。

→ **確定判断のロジックは維持しつつ、適用箇所を実在する `patchDraft` 呼び出し=`draft/edit/route.ts` に接地させる**のが正しい。「新規発生する block のみで適用中止」というゲートは、**edit route の `source==="advise-apply"||"comment-revise"` の分岐(=AI 修正適用時)にだけ適用**する。純粋な手動編集(source 無し)は修正4(c) のとおりスコープ外(§5.3)。

#### 5.2.2 純ロジック(新旧差分の block 比較・テスト対象)

`scripts/growth/publishGate.ts` に追加(または `publishGateSelect.ts`):
```ts
export interface RegateInput {
  before: string; after: string; title: string;
  articleType?: ArticleType; knownNewsPaths?: ReadonlySet<string>;
}
export interface RegateResult {
  /** after で新規に発生した block(before に無かったもの)。 */
  newBlocks: string[];
  /** newBlocks が空なら true(適用してよい)。 */
  ok: boolean;
}
export function evaluateRegate(input: RegateInput): RegateResult;
```
- `before`/`after` それぞれ `evaluatePublishGate` に通し、`blockReasons` の集合差(after − before)を `newBlocks` とする。
- **既存 block(before にもあった block)は通す**=修正で直す機会を奪わない(確定判断)。
- `newBlocks` が非空のときだけ `ok=false`。

#### 5.2.3 route 配線(薄い・edit route)

`draft/edit/route.ts` の `patchDraft`(140-146 行)**直前**に、`isAdopt`(75-77 行)が true のときだけ:
```
if (isAdopt) {
  const knownNewsPaths = <best-effort>;
  const regate = evaluateRegate({ before: previousBody, after: sanitized, title,
                                  articleType: <既定 single>, knownNewsPaths });
  if (!regate.ok) {
    // 適用中止: applied:false 相当・要確認・LINE 通知(既存イディオム)
    return NextResponse.json(
      { success:false, error:`修正適用で新たな品質不合格が発生したため中止しました: ${regate.newBlocks.join(" / ")}` },
      { status: 409 }
    );
  }
}
```
- `previousBody`(97/112 行で取得済み)= before、`sanitized`(128 行)= after。**既に route 内に両方揃っている**ため追加取得不要。
- 中止時は `patchDraft` を呼ばず本文を変えない(既存 block を残したまま人が承認画面で直せる)。
- **既存イディオムへの整合**: advise-apply / comment-revise の失敗系は `applied:false / reason / 要確認 / LINE 通知`(`advise-apply.ts` `buildApplyFailProps` 274-280 行・`bodyComment.ts` 同種)。edit route は現状 LINE を送らない。**LINE 通知は追加しない(§10-6 レビュー確定)**: 採用反映は人が承認画面を操作している最中の同期アクションであり、409 のエラー表示がその場で本人に届くため、LINE は冗長。

#### 5.2.4 テスト計画(修正4b)

| テストファイル | ケース名 | 期待値 |
|---|---|---|
| `scripts/growth/publishGate.test.ts` | `evaluateRegate: 新規 block のみ検出` | before に無く after で発生した block を `newBlocks` に、既存 block は含めない |
| 〃 | `evaluateRegate: 既存 block は通す(ok=true)` | before/after 双方に同 block → `ok=true`・`newBlocks` 空 |
| 〃 | `evaluateRegate: after で新 block → ok=false` | after のみ §5 欠落 → `ok=false` |

route 配線(`draft/edit/route.ts` 分岐追加)はカバレッジ除外だが、既存 route テストがあれば `isAdopt` 経路の 409 を1ケース追加(RED→GREEN)。

### 5.3 (c) 手動編集 route はスコープ外(明記)

`/api/growth/draft/edit`(`source` 無し=純粋な手動リッチ編集)の再ゲートは**本タスクのスコープ外**とする。理由:
- 手動編集は**承認画面 UI が編集中にリアルタイムで `draftQuality` を再計算**しており(`DetailPanel.tsx` 257-266 行)、人がその場で block を視認できる。
- さらに**修正4(a) の公開直前ゲートが最終防波堤**として全経路をカバーする。
- 人が意図的に block 状態で保存(後で直す前提)する自由を、AI 適用と違って残すべき。

→ したがって §5.2 の再ゲートは `isAdopt`(advise-apply / comment-revise)分岐**のみ**に効かせ、手動編集分岐(else)には効かせない。

### 5.4 (a)(b) 共通のデータフロー

```
公開直前(publish-due / publish route):
  Notion ミラー raw 本文(免責文あり) → publishGateReason
    └ block → その記事だけスキップ + LINE(スロットリング付き) + 次回再評価(冪等)
    └ ok   → removeAiDisclaimer → patchDraft → publishContent

AI 修正適用時(draft/edit route の isAdopt 分岐):
  previousBody(before) / sanitized(after) → evaluateRegate
    └ 新規 block → 409 で中止(本文変えない・既存 block は残す)
    └ ok        → patchDraft(既存フロー)
```

---

## 6. 影響範囲と後方互換

| 変更 | 後方互換 | env |
|---|---|---|
| 修正1(allow 追加・weekly.md) | weekly の挙動追加のみ。学習ログ空で従来動作。 | 追加なし(`GROWTH_LEARNING_LOG_DS` は SI1 で既存) |
| 修正2(gate 引数・ビルダー抽出) | `knownNewsPaths` 取得失敗→undefined で従来動作(検査スキップ)。`articleType` 既定 single=現行 UI と同挙動。route は挙動不変。 | `MICROCMS_API_KEY`(既存)を CLI が参照する可能性(§10-2) |
| 修正3(weekly model) | 既定 opus。既存 weekly の出力品質が上がる方向のみ。dry-run 引数が1つ増える(test 更新済み)。 | `.env.example` に `GROWTH_WEEKLY_MODEL=` 追記 |
| 修正4a(公開直前) | block が無ければ従来どおり公開。block 記事のみ保留(沈黙させず通知)。冪等。 | 追加なし |
| 修正4b(適用時) | 既存 block は通す=修正機会を奪わない。新規 block のみ中止。 | 追加なし |

**`.env.example` 追記**: `GROWTH_WEEKLY_MODEL=`(修正3・GROWTH_ セクション、`GROWTH_LEARNING_LOG_DS=` の近く)。他の修正は env 追加不要。

**vitest.config.ts 追記**: 新規 IO ラッパ(`knownArticlePaths.ts` 等)を `coverage.exclude` に追記。新規純ロジック(`knownPaths.ts`・`publishGateSelect.ts` 等)は**除外しない**(100% カバレッジ対象)。

---

## 7. 実装順序(依存関係)

1. **修正3(weekly モデル固定)** — 独立・最小。`run.mjs` + `run.test.ts` 更新 + `.env.example` + `00-canon.md`。まず GREEN にして回帰の土台を作る。
2. **修正1(SI2 結線)** — `run.mjs` allow 追加(修正3 と同じ weekly ブロックを触るので順序を続ける)+ `weekly.md` 追記 + `run.test.ts` に allow ケース。
   - 前提: SI2 の `systemProposal.ts` と `カテゴリ=システム改善` 値が未了なら §10-1 で扱いを確定。
3. **修正2(knownNewsPaths ビルダー抽出 + gate 引数)** — `knownPaths.ts`(純)→ `knownArticlePaths.ts`(IO ラッパ)→ `draft/route.ts` 差し替え(挙動不変・既存テスト GREEN 維持)→ `publish-draft-cli.ts` quality-gate 結線。**ここで抽出したビルダーと `resolveGateArticleType` を修正4 が再利用する**。
4. **修正4(再ゲート)** — 修正2 の共有ビルダー・`resolveGateArticleType` に依存。
   - 4a: `publishGateReason` + `buildPublishDueGateBlockMessage`(純)→ `publish-due-cli.ts` / `publish/route.ts` 配線。
   - 4b: `evaluateRegate`(純)→ `draft/edit/route.ts` の `isAdopt` 分岐配線。

> **依存の要点**: 修正2 の `knownArticlePathsForMedia` / `resolveGateArticleType` を修正4 の両方が使う。修正2 を先に完了させること(確定判断どおり)。

---

## 8. スコープ外(明記)

- **手動編集 route(`/api/growth/draft/edit` の `source` 無し分岐)の再ゲート**(§5.3)。承認画面 UI の再計算 + 修正4(a) 最終ゲートでカバー。
- **styleLint / StyleHints の draftQuality 合流(🟡5)**(`DetailPanel.tsx` 13/256 行「将来拡張」)。本タスクは `draftQuality`(本番チェック)のみ。
- **cornerstone を効かせる drafts.md 側の運用追記**(`payload.cornerstone: true` のステージ手順)。本タスクは gate 側の受け口(`resolveGateArticleType`)まで。当面は全記事 single(現行同挙動)。
- **microCMS を直接 GET する本文取得関数の新設**(§10-4)。再ゲートは Notion ミラー本文で行うため不要。
- **SI2 の `systemProposal.ts`・`カテゴリ=システム改善` 値追加**(SI2 §8 の別項)。本タスクは weekly 結線のみ(§10-1 で境界確定)。
- **数値ゲート(§5 ルブリック)のスコア機械記録・週次集計**(quality-uplift spec §5.4 の後続タスク)。
- その他バックログ(`project_growth_loop_review_backlog.md` の未着手12件)。

---

## 9. 受け入れ基準

**修正1**:
- `run.mjs` weekly dry-run 出力に `growth:learning-log:recent` が含まれる(`run.test.ts` GREEN)。
- `weekly.md` に(a)学習ログ入力、(b)システム振り返り工程、(c)`facility-context` 聖域が記載され、SI2 §4.2 と乖離しない。
- `GROWTH_LEARNING_LOG_DS` 未設定でも weekly が「学習ログなし」で従来動作。

**修正2**:
- `publish-draft` quality-gate が `articleType`・`knownNewsPaths` を渡す。壊れた内部リンクを含む投入 spec が**投入前に block される**(§15)。
- `knownNewsPaths` 取得失敗時は undefined で従来動作 + 警告 + LINE best-effort、投入は止まらない。
- `draft/route.ts` の既存挙動不変(route テスト GREEN)。純ロジック 100% カバレッジ。

**修正3**:
- weekly 起動に `--model claude-opus-4-8` が付く。`GROWTH_WEEKLY_MODEL` で上書き可(`run.test.ts` GREEN)。`.env.example`・`00-canon.md` 更新済み。

**修正4a**:
- 公開直前(publish-due / publish route)で **raw ミラー本文**(免責文除去前)が block を持つ記事は公開されず、他記事は公開される。block 記事は LINE 通知(同一記事・同一理由はスロットリング)され、次回実行で再評価される(冪等)。Notion のステータス・予約時刻・却下理由は変更されない。
- 免責文を含む正常な raw 本文が §5 免責チェックで誤 block されない(回帰テストあり)。

**修正4b**:
- advise-apply / comment-revise の採用反映(edit route の `isAdopt`)で、**適用後に新規発生する block があるときのみ**適用中止(409)。既存 block は通る。手動編集(source 無し)は中止しない。

**共通**:
- TDD(RED→GREEN)。純ロジックのテストが先。CLI/route/run.mjs/weekly.md はカバレッジ除外。
- 無人での commit/push なし(`run.mjs` DISALLOW 不変)。

---

## 10. 要確認(設計判断とコードの食い違い・codex 着手前に確認)

> 確定済み設計判断は覆さない。以下は「判断を実コードに接地させる際の解釈確定/オーナー承認が要る点」。**全項 2026-07-06 の fable レビューで確定済み**(各項末尾の【確定】参照)。codex は確認不要でこのまま着手してよい。

**10-1. 修正1 と SI2 の境界(スコープ確認)**
SI2 設計 §8「フェーズ SI2」は (1)`カテゴリ=システム改善` 値追加、(2)`systemProposal.ts`、(3)weekly.md + run.mjs allow、(4)docs、の4項。本タスクの「修正1」は (3) を指す。(1)(2) が未実装なら、weekly が `システム改善` 施策を本文フォーマット付きで登録しても登録先の select 値が無い可能性がある(SI2 §4.3 は「作らず報告」の欠落耐性を定義済み)。**採用**: 本タスクは (3) のみ実施し、(1)(2) は SI2 側の状態に従う(未了なら weekly は「システム改善カテゴリ未追加のため登録スキップ+報告」= SI2 §4.3 の既定挙動)。【確定】(3) のみ。(1)(2) は別タスク。

**10-2. 修正2 の CLI 側 slug 取得キー**
`getColumnSlugs`/`getNewsSlugs` は `MICROCMS_API_KEY`(`client.ts`)依存。CLI(publish-draft)は `MICROCMS_CONTENT_API_KEY`/`MANAGEMENT` を使っており、実行 env に `MICROCMS_API_KEY` があるかは環境依存。**採用**: slug 取得失敗は §3.4 のフォールバック(undefined + 通知 + 続行)で吸収するので、キー欠落でも投入は止まらない。【確定】採用案どおり。常時稼働 PC の env 確認はオーナーの運用タスクとして完了報告に記載する(実装のブロッカーにしない)。

**10-3. 修正2 の `articleType` 判定源(重要)**
確定判断「spec.payload から cornerstone/single を判定」。しかし `spec.payload.articleType` は `["獲得"]` 等の**マーケティング軸**で、gate の `single|cornerstone`(文字数軸)とは無関係(`draftQuality.ts` 14-15/145-146 行 vs `drafts.md` 57 行)。**採用**: `resolveGateArticleType(payload)` を新設し `payload.cornerstone === true` のときだけ cornerstone、既定 single(承認画面 UI と同じ)。【確定】採用案どおり `payload.cornerstone` フラグで判定。当面は全記事 single(現行同挙動)で、cornerstone 運用開始時に drafts.md 側でフラグを立てる(スコープ外 §8)。

**10-4. 修正4a の body ソース(重要)**
確定判断「microCMS から最新の bodyHtml/title を取得」。現行は両公開経路とも **Notion ミラー `下書き本文HTML`** を body ソースにし、microCMS を単体 GET する関数は存在しない(`content.ts` に getDraft 無し)。**採用**: 再ゲートは Notion ミラー本文に対して行う(承認画面 UI の判定源と一致・追加 IO 不要)。【確定】ミラー本文採用。ただしゲート対象は **`removeAiDisclaimer` 適用「前」の raw 本文**とする(§5.1.2 参照。除去後だと §5 免責欠落 block が全記事で誤発火し公開が全停止するため)。microCMS 直接 GET は不要(スコープ外 §8)。

**10-5. 修正4a の Notion マーク先**
記事ネタ案 DB に「要確認」status 値は無い(`ステータス` = 承認/生成中/下書き作成済み/却下/公開済み)。**当初採用案**: 既存 `却下理由` へ追記。【確定・変更】**Notion への書き込みは行わない**。`却下理由` は `existing.ts`(95-135 行)が weekly の「避ける学習」入力として LLM へ渡すプロパティであり、公開ゲート保留(却下ではない)を書き込むと学習データを汚染する。可視化は LINE 通知(スロットリング付き)+ 承認画面 UI の同一 block 赤バッジ表示で担保(§5.1.3 参照)。専用「要確認」status 値の追加も本タスクでは行わない。

**10-6. 修正4b の適用箇所(重要)**
確定判断「advise-apply.ts と comment-revise 系で patchDraft の前」。しかし両者は純ロジック/CLI とも**本文を書き込まない**(明示コメント)。実際の patchDraft は `draft/edit/route.ts` の採用反映(`source==="advise-apply"||"comment-revise"`)。**採用**: 再ゲート(新規 block のみ中止)を `draft/edit/route.ts` の `isAdopt` 分岐に接地(before=previousBody / after=sanitized は既に route 内に揃う)。【確定】採用案どおり。LINE 通知は**追加しない**——採用反映は人が承認画面を操作中の同期アクションで、409 エラー表示が本人にその場で届くため冗長(§5.2.3 参照)。

---

## 11. 制約(プロジェクト規約・再掲)

- TDD 必須。純ロジック(`knownPaths`・`resolveGateArticleType`・`publishGateReason`・`evaluateRegate`・`buildPublishDueGateBlockMessage`)は 100% カバレッジ。CLI・route・`run.mjs`・`weekly.md`・IO ラッパは `vitest.config.ts` の `coverage.exclude` に追記。
- TS strict / `any` 禁止(外部入力は `unknown`＋zod/型ガード)/ `import type` / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- 純ロジック分離: ロジックは `scripts/growth/*.ts`＋`src/lib/growth/*` 再エクスポート。gate/ビルダーの単一ソース化(route と CLI で同一関数)。
- pull 型・欠落耐性・失敗を沈黙させない(全 block/取得失敗は stderr + LINE で可視化)。
- 出力(spec/計画/コミット/説明)は日本語。無人での push/commit 禁止(`run.mjs` DISALLOW 継続)。push 時のみ `ttmakhr1028ai-art`。
