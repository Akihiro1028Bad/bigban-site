# グロース画像アートボード P4a(誌面俯瞰・記法拡張・旧UI全撤去)実装計画

**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推奨)または superpowers:executing-plans でタスク単位に実装する。各ステップは checkbox(`- [ ]`)で進捗管理する。
> **本計画の実装者は Codex CLI**(`codex exec`)。各タスクは自己完結ブリーフとして渡す。コードは完全転記せず、正確なインターフェース・受け入れ挙動・テストケース一覧・参照イディオム(実在ファイル指名)を指定する。実装者は必ず参照ファイルの現物イディオムに合わせること。曖昧さが致命的な箇所(記法の正規表現・表示名マップ・シリアライズ出力例)だけ具体値/コードを書く。

**Goal:** グロース記事の本文画像の入口を「誌面アートボード」1 つに集約する — 構成案から「アイキャッチ枠＋各セクション見出し＋画像スロット」を 1 枚の誌面として俯瞰し、スロットをタップして 6 スタイル・説明(AIプリフィル)・文字指定(textSpec)・おまかせ/画像なしを編集→ `/api/growth/revise/edit` で構成案テキストへ永続化する。旧 2 系統 UI(ImageDirector 系統・`SectionImages` の画像追加)と `isEyecatch` 概念を全撤去する。記法を `textSpec`・`[画像:なし]` へ拡張し、`outline.ts` を生成側と揃った 6 語彙へ統一する。下書き投入(`publish-draft-cli`)へ `textSpec` を反映する(spec §3 全体 / §6 / §8)。

**Architecture:** pull 型・純ロジック分離を踏襲する。記法拡張と 6 語彙統一は `src/app/growth/approve/outline.ts`(承認画面ローカル純ロジック・Notion 非依存)に閉じる。スタイルの単一ソースは `@/lib/growth/bodyImage`(=`scripts/growth/body-image.ts` の再エクスポート)の `RequestedBodyImageStyle` に一本化し、`outline.ts` の重複定義を廃止する。説明プリフィル `suggestImageIdea` とスロット状態 `slotStateOf` を純関数で新設する。誌面 UI(`ArtboardView`)は薄い presentation とし、保存は既存 `useReviseEditing.persistOutline` と同型の `serializeOutlineSections`→ `postReviseEdit`(`/api/growth/revise/edit` に `{ pageId, outline }`)経路を使う。`DetailPanel` の構成案クラスタに「誌面」リーフを足し、`ConsultComposer` の `SectionImages` を「誌面タブで編集」リンクへ置換する。`textSpec` は `buildBodyImageSpec` の第 4 引数として下書き投入プロンプトへ織り込む。

**Tech Stack:** Next.js 16 App Router / TypeScript strict / React 19 + RTL / Vitest / framer-motion(使用ファイルは `"use client"`)/ Notion pull 型・`/api/growth/revise/edit` 手動上書き経路。

**タスク分割の判断(1-2 行):** 純ロジック(記法・辞書・状態関数)を先に固め(T1/T2)、それを消費する下書き投入(T3)と UI(T4/T5)を積み、依存が消える最後に旧系統を撤去(T6)、API ガードと文書(T7)、仕上げ(T8)の順にする。撤去(T6)を T4/T5 より後に置くのは、置換先(ArtboardView・誌面リンク)が動いてから旧参照を消して常時 GREEN を保つため。

## Global Constraints

- TDD 必須(Red → Green → Refactor)。実装より先に失敗するテストを書く。
- カバレッジ 100% ゲート。CLI・`run.mjs`・`gen-*` は除外。薄い presentation は `vitest.config.ts` の `coverage.exclude` に**理由コメント付き**で追記する。純ロジック(`outline.ts` 記法拡張・`suggestImageIdea`・`slotStateOf`・`body-image.ts` の `textSpec` 合成・旧→新後方互換マップ)を優先的にテストする。
- TS strict / `any` 禁止(`unknown`+narrowing)/ `React.FC` 禁止 / `import type` / boolean は is/has/should/can / handler props は on・関数は handle / `@ts-ignore` 禁止(最後の手段のみ `@ts-expect-error`+理由)。
- 命名規約: Components `PascalCase.tsx`・utilities `camelCase.ts`・scripts 純ロジックは `scripts/growth/*.ts`(kebab)＋ `src/lib/growth/*` 再エクスポート。テストは co-located。
- pull 型・純ロジック分離を維持する。`ArtboardView` は render するだけ(重い処理を持たない)。
- **`ImageStyleKey` を廃止**し `RequestedBodyImageStyle`(`@/lib/growth/bodyImage`)を単一ソースにする。波及先(`SectionImages`〔撤去〕・`useReviseEditing`・`outline.test.ts`)を全て追随させる。
- コミットは日本語 Conventional Commits。**git commit は Codex にさせず、レビュー後に fable5 が代行する**(各タスク末尾のコミットメッセージ案は fable5 用)。**push しない**。
- **P4b・P4c のスコープ混入禁止**: `roughUrl`・`| ラフ:` 記法・画像プラン(`image-plan`)・ラフ生成(`rough`)・ゴーストプレビュー・参照画像による構図保持は本計画に**入れない**。`OutlineImage` に足すのは `textSpec?` のみ(`roughUrl?` は足さない)。`OutlineSection` に足すのは `suppressImage?` のみ。

---

## T1: `outline.ts` の記法拡張＋6 語彙統一(純ロジック・TDD)

**Files:**
- Modify: `src/app/growth/approve/outline.ts`(L8 `ImageStyleKey` 廃止・L11 `IMAGE_STYLES`・L27 `imageStyleKeyFromLabel`・L32 `OutlineImage`・L37 `OutlineSection`・L50 `IMAGE_DIRECTIVE_RE`・L56 `parseImageDirectives`・L67 `serializeImageDirective`・L78 `parseOutlineSections`・L128 `serializeOutlineSections`)
- Test: `src/app/growth/approve/outline.test.ts`(既存 describe を新語彙へ更新＋新記法 describe 追記)

**Interfaces(Produces):**
- `ImageStyleKey` を**廃止**し、`import type { RequestedBodyImageStyle } from "@/lib/growth/bodyImage";` を導入。`OutlineImage.style: RequestedBodyImageStyle`(= `"mascot" | "illust" | "court" | "flow" | "infographic" | "auto"`)。既存 `import { ImageStyleKey } from "./outline"` は全て `RequestedBodyImageStyle` へ移行する(消費側は T3/T5/T6 で追随)。
- `IMAGE_STYLES: readonly { key: RequestedBodyImageStyle; label: string }[]` を **6 語彙**(表示名は style-guide §9〔`docs/operations/growth-article-style.md` の本文画像表〕と完全一致)にする:

  | key | 表示名(label) |
  |---|---|
  | `auto` | おまかせ |
  | `mascot` | 宇宙人マスコット |
  | `illust` | 雰囲気イラスト |
  | `court` | コート図・ルール図解 |
  | `flow` | 手順・フロー図 |
  | `infographic` | 比較・インフォグラフィック |

  ※ `bodyRegenRequest.ts` の `BODY_IMAGE_STYLE_CHIPS` は短縮ラベル(「コート図」等)を持つが**別物**。構成案へ書き出す正典表示名は `IMAGE_STYLES` のフル表示名を使う(チップ表示ラベルとシリアライズ表示名を分離)。
- `interface OutlineImage { style: RequestedBodyImageStyle; description: string; textSpec?: string; }`(**`textSpec?` を追加**・`roughUrl` は足さない)。
- `interface OutlineSection { heading: string; description: string; images: OutlineImage[]; suppressImage?: boolean; }`(**`suppressImage?` を追加**)。
- `imageStyleKeyFromLabel(label: string): RequestedBodyImageStyle | null` — `KEY_BY_LABEL`(新 6 表示名から導出)に加え、**旧 3 表示名の後方互換マップ**を持つ。旧→新は生成側 `normalizeBodyImageStyle`(`body-image.ts` L260・`minimal→illust`/`diagram→court`)と整合させる:
  - `マスコット・コスミック` → `mascot`
  - `ミニマル図解` → `illust`
  - `詳しい図解` → `court`

  未知の表示名は `null`(画像として採用しない・沈黙させず呼び出し側で通常テキスト扱い)。**書き出しは常に新語彙**(`serializeImageDirective` は `IMAGE_STYLES` の新表示名のみ使う。旧表示名は書き出さない)。
- `serializeImageDirective(image: OutlineImage): string` — `textSpec` があれば ` | 文字: <textSpec>` を付与する。区切りは**書き出しは常に半角** `|`。出力例:
  - textSpec なし: `[画像:コート図・ルール図解: 俯瞰でコートの区画を示す]`
  - textSpec あり: `[画像:コート図・ルール図解: 俯瞰でコートの区画を示す | 文字: 幅6.1m/長さ13.4m]`
- `parseOutlineSections`: 「なし」トークン(`[画像:なし]`)を検出したら `current.suppressImage = true` を立て、**`images` には積まない**。「なし」検出は `parseOutlineSections` 側で行い、`parseImageDirectives` の戻り値互換(`OutlineImage[]`)は保つ。
- `serializeOutlineSections`: `suppressImage` が真なら該当セクションに `[画像:なし]` を **1 行**書く(その場合 `images` は空である前提)。真でなければ従来どおり各 `image` を `serializeImageDirective` で書く。

**記法・正規表現(曖昧さ排除・具体値必須):**
- `IMAGE_DIRECTIVE_RE`(global・matchAll/replace 専用・exec 共有禁止のコメントは維持)を、説明部の後に**任意で** `| 文字: <textSpec>` を取れるよう拡張する。表示名・説明・textSpec は閉じ括弧を含まない。区切りは**半角 `|` と全角 `｜` の両方**を許容する。参考形(実装時に既存の `[:：]` 許容と整合させて確定):
  ```
  /\[画像[:：]\s*([^:：|｜\]]+?)\s*[:：]\s*([^|｜\]]+?)\s*(?:[|｜]\s*文字[:：]\s*([^\]]+?)\s*)?\]/g
  ```
  - match[1]=表示名 / match[2]=説明 / match[3]=textSpec(任意・未指定は `undefined`)。
  - `parseImageDirectives` は match[1] を `imageStyleKeyFromLabel` で解決し、`description`(=match[2].trim())が非空のときだけ `OutlineImage` を作る。`textSpec` は trim して非空なら載せ、空なら省く(`textSpec?` 省略)。
- `[画像:なし]` の検出: 表示名部が `なし`(前後 trim)のトークンを専用判定する。`imageStyleKeyFromLabel("なし")` は `null`(未知表示名)なので、`parseImageDirectives` は `OutlineImage` を作らない。`parseOutlineSections` が「画像指示だけの行」判定(`withoutImages === ""`)の中で、その行が `[画像:なし]` を含むなら `current.suppressImage = true` を立てる。混在行(テキスト＋トークン)の既存仕様(行全体を説明として残す)は維持する。

**受け入れ挙動:**
- 新記法(`| 文字:` 付き・全角 `｜` 付き)を parse し、`OutlineImage.textSpec` に反映する。
- serialize→parse の往復で `style`/`description`/`textSpec`/`suppressImage` が保存される(書き出しは半角 `|`)。
- 旧 3 表示名を含む既存構成案を読み込むと新キー(`mascot`/`illust`/`court`)へマップされ、再シリアライズすると新表示名で書き出される。
- `[画像:なし]` は `suppressImage=true`・`images=[]`。記法なしのセクションは `suppressImage` 未設定・`images=[]`(=未指定と明示除外の区別)。
- `court`/`flow`/`infographic` 以外で `textSpec` が書かれていても parse は受理する(CLI 側で無視・T3)。

**テストケース一覧:**
- 新記法 parse: `[画像:コート図・ルール図解: 説明 | 文字: A/B]` → style=court・textSpec="A/B" / textSpec なしトークン → textSpec undefined / 全角 `｜` 区切りを受理 / 全角コロン `：` と混在。
- serialize: textSpec あり → ` | 文字: ` 付き(半角)/ textSpec なし → 付かない / trim される。
- 往復(parse→serialize→parse)で 6 語彙 × textSpec あり/なしが不変。
- 旧表示名読み込み: `マスコット・コスミック`→mascot / `ミニマル図解`→illust / `詳しい図解`→court、再 serialize で新表示名。
- 「なし」: `[画像:なし]` 単独行 → suppressImage=true・images 空 / 記法なしセクション → suppressImage 未設定(undefined)で区別 / serialize で `suppressImage=true` → `[画像:なし]` 1 行。
- 混在行の既存仕様維持(テキスト＋トークン → 行全体が description・画像化しない)。
- 未知表示名 → null(採用しない)・説明空 → 採用しない。
- 既存テストの旧語彙(`マスコット・コスミック`/`ミニマル図解`/`詳しい図解`)を使うケースを、意図に応じて「後方互換読み込みテスト」として残すか、新語彙表示名へ更新する(混在させない)。

**参照イディオム:** 既存 `outline.ts` の `matchAll`/`replace` による `IMAGE_DIRECTIVE_RE` 運用・`LABEL_BY_KEY`/`KEY_BY_LABEL` の `Object.fromEntries` 導出・`parseOutlineSections` の「画像指示だけの行」判定(L96-101)。

**Steps:** 失敗テスト→RED(`npx vitest run src/app/growth/approve/outline.test.ts`)→実装→GREEN→コミット案 `feat(growth): 誌面記法を textSpec・[画像:なし] へ拡張し outline を6語彙へ統一`

---

## T2: `suggestImageIdea` ＋ `slotStateOf`(純ロジック・TDD)

**Files:**
- Create: `scripts/growth/suggest-image-idea.ts`(説明プリフィル辞書ロジック)
- Create: `src/lib/growth/suggestImageIdea.ts`(`export * from "../../../scripts/growth/suggest-image-idea";`)
- Create: `src/app/growth/approve/artboardState.ts`(`slotStateOf` — 承認画面ローカル純ロジック・Notion 非依存)
- Test: `scripts/growth/suggest-image-idea.test.ts`(新規)・`src/app/growth/approve/artboardState.test.ts`(新規)

**Interfaces(Produces):**
- `suggestImageIdea(heading: string, style: RequestedBodyImageStyle): string`(`import type { RequestedBodyImageStyle } from "@/lib/growth/bodyImage";`。scripts 側では相対 import `../../src/lib/...` ではなく `body-image.ts` から type import 可。実装時に既存 `body-image-regen.ts` 等の import 流儀に合わせる)。
  - スタイル別辞書。見出しの語(正規表現)→「図の切り口」テンプレを返す。例(具体値):
    - `court` かつ見出しに `/ルール|規格|コート|広さ|区画/` → 「◯◯を俯瞰コート図で示す」相当。
    - `flow` かつ見出しに `/手順|流れ|ステップ|予約|始め方/` → 「◯◯の手順をフロー図で示す」相当。
    - `infographic` かつ見出しに `/比較|違い|選び方|どっち|メリット/` → 「◯◯を比較インフォグラフィックで示す」相当。
    - `mascot` → 「宇宙人が◯◯する」相当(既存 `imageIntent.ts` の `ACTION_DICT` の題材を 6 スタイル向けに再設計)。
    - `illust` → 「◯◯の雰囲気を抽象イラストで」相当。
    - `auto` → スタイル未確定向けの中立プリフィル(「このセクションに合う図」相当)。
  - **ネットリサーチしない・未確定事実(営業時間・料金・面数・所要分)を入れない**(style-guide §9 / 正典の絶対禁止に準拠)。空見出しは中立フォールバック文言を返す(常に非空文字列)。
  - **既存 `imageIntent.ts` の `suggestActions`/`ACTION_DICT` を参考に再設計するが、撤去予定ファイル(`imageIntent.ts`〔T6 で削除〕)からは import しない**(コピーで独立させる。import すると T6 で壊れる)。
- `slotStateOf(image: OutlineImage | undefined, roughUrl: string | undefined, isRegenerating: boolean): "empty" | "specified" | "rough-ready" | "generating"`(spec §3.2.2)。
  - **P4a で実際に使うのは `empty`/`specified` のみ**だが、型は 4 状態で定義する(P4c 拡張時に本体を変えないため)。
  - 分岐: `isRegenerating` が真 → `"generating"` / `roughUrl` が非空 → `"rough-ready"` / `image`(記法あり)→ `"specified"` / それ以外 → `"empty"`。
  - `import type { OutlineImage } from "@/app/growth/approve/outline";`。`roughUrl` 引数は P4c 前提の型シグネチャで、P4a の呼び出しは常に `undefined` を渡す(引数自体は残す)。

**受け入れ挙動:**
- `suggestImageIdea` はスタイル×見出しで妥当なプリフィル文を返し、未確定事実を含まない。空見出しでも非空を返す。
- `slotStateOf` は全 4 分岐を返し、優先順(generating > rough-ready > specified > empty)が明確。

**テストケース一覧:**
- suggestImageIdea: 各スタイル(6 種)× 代表見出しでキーワードにヒットする切り口が返る / キーワード非ヒット時のスタイル既定文 / 空見出しフォールバック / 出力に営業時間・料金等の数値が混入しない(辞書に固定数値を書かない担保)。
- slotStateOf: image=undefined → empty / image あり・rough なし・regen なし → specified / roughUrl あり → rough-ready(image 有無に関わらず) / isRegenerating 真 → generating(他条件より優先)。

**参照イディオム:** `src/lib/growth/imageIntent.ts` の `ACTION_DICT`(データ駆動の `{ pattern, actions }` 配列)と `suggestActions` の「ヒット収集→フォールバック」形。再エクスポートは既存 `src/lib/growth/bodyImage.ts`(`export * from "../../../scripts/growth/body-image";`)の形。

**Steps:** 失敗テスト→RED→実装→GREEN→コミット案 `feat(growth): 誌面スロットの説明プリフィル suggestImageIdea と slotStateOf を追加`

---

## T3: 下書き投入への `textSpec` 反映(PC 側)

**Files:**
- Modify: `scripts/growth/body-image.ts`(L89 `BodyImageSpec`・L102 `buildBodyImageSpec`・L74 `buildBodyImagePrompt` 周辺)
- Modify: `scripts/growth/publish-draft-cli.ts`(L86 `DraftImageInput`・L208 の `buildBodyImageSpec` 呼び出し)
- Modify: `scripts/growth/prompts/drafts.md`(images[] output_schema・記法説明・語彙刷新)
- Test: `scripts/growth/body-image.test.ts`(describe 追記)

**Interfaces(Produces):**
- `BodyImageSpec` に `textSpec?: string` を追加。
- `buildBodyImageSpec(index: number, style: BodyImageStyle, description: string, textSpec?: string): BodyImageSpec` — **第 4 引数 `textSpec?` を追加**。`textSpec` が非空のとき、`court`/`flow`/`infographic` の `prompt` に「図に入れる文字・数値」を織り込む。`mascot`/`illust` では `textSpec` を無視する(それらは文字なしスタイル)。`alt` への影響は**現行踏襲**(`buildBodyImageAlt` は変更しない — 図解系は「イメージ図: 説明」のまま)。
  - `prompt` 合成は `TEXT_ONLY_AS_SPECIFIED`(既存・L45)と整合する文言にする(spec §3.4.7)。参考: description に加えて「Render exactly this text/numbers: <textSpec>」相当を図解系プロンプトへ足す。**捏造防止句(明示値以外の数値を描かない)を壊さない**こと。実装時に `PROMPT_BUILDERS` の court/flow/infographic ビルダーへ textSpec を渡す形へ小さく拡張する(builder シグネチャに任意 textSpec を追加、または `buildBodyImagePrompt(style, description, textSpec?)`)。
- `publish-draft-cli.ts` の `DraftImageInput`(L86-90)に `textSpec?: string` を追加し、L208 を `buildBodyImageSpec(im.index, normalizeBodyImageStyle(im.style), im.description, im.textSpec)` にする。

**受け入れ挙動:**
- `buildBodyImageSpec(..., textSpec)` で `court`/`flow`/`infographic` の prompt に textSpec 文字が織り込まれ、`TEXT_ONLY_AS_SPECIFIED` の「明示値以外を描かない」制約が残る。
- textSpec なし(undefined/空)は現行と同一 prompt(回帰なし)。
- `mascot`/`illust` は textSpec を渡しても prompt 不変(文字なし維持)。
- `spec.images`(spec.json 未検証 JSON)に `textSpec` が無くても落ちない(任意)。

**テストケース一覧(body-image.test.ts):**
- textSpec あり(court/flow/infographic)→ prompt に textSpec が含まれ、`TEXT_ONLY_AS_SPECIFIED` 相当句も残る。
- textSpec なし → 既存 prompt と同一(スナップショットではなく含有/不含有アサート)。
- mascot/illust + textSpec → prompt に textSpec を含まない(文字なし維持)。
- alt は現行どおり(図解系=「イメージ図: …」・mascot/illust=説明そのまま)。
- `index < 1` の既存 throw は不変。

**prompts/drafts.md 更新(カバレッジ除外・tsc/目視で担保):**
- images[] output_schema に `textSpec?`(任意・`court`/`flow`/`infographic` のみ意味を持つ・1000 字以内)を追記。
- 記法の読み方を追記: `[画像:<表示名>: <説明> | 文字: <textSpec>]`(`| 文字:` は全角縦棒 `｜` 可)と `[画像:なし]`(このセクションに画像を出さない)。
- **旧 3 語彙(L14/L18 相当)を 6 語彙＋おまかせへ刷新**する(表示名は style-guide §9 準拠)。旧値の後方互換マップ(`マスコット・コスミック`→`mascot` / `ミニマル図解`→`illust` / `詳しい図解`→`court`)を注記。
- **注:** style-guide §9 の記法は `docs/operations/growth/20-draft.md` にも旧語彙が残る(L14/L18)。実ファイルとして更新すべきは `scripts/growth/prompts/drafts.md`(下書き生成プロンプト)と `20-draft.md`(運用ドキュメント)の両方。20-draft.md の刷新は T7 に集約するが、drafts.md は本タスクで更新する(両ファイルを確認し、いずれも旧語彙なら両方が更新対象)。

**Steps:** 失敗テスト→RED→`body-image.ts` 実装→`publish-draft-cli.ts` 4 引数化→`drafts.md` 更新→GREEN＋`npx tsc --noEmit` 0→コミット案 `feat(growth): 下書き投入の本文画像に textSpec を反映しプロンプトを6語彙へ刷新`

---

## T4: `ArtboardView` 新設(誌面キャンバス＋スロットエディタ)

**Files:**
- Create: `src/app/growth/approve/ArtboardView.tsx`(`"use client"`・薄い presentation)
- Modify: `vitest.config.ts`(`coverage.exclude` に `ArtboardView.tsx` を**理由コメント付き**で追記。純ロジックは T1/T2 でテスト済みである旨)
- Test: `src/app/growth/approve/ArtboardView.test.tsx`(新規・薄い presentation でも最低限の結線挙動をテストする=挙動担保目的)

**Interfaces(props 契約・親〔T5〕が消費):**
```ts
interface ArtboardViewProps {
  sections: OutlineSection[];        // outline.ts の parse 済みセクション(images/suppressImage 込み)
  eyecatchUrl?: string;              // 実画像 URL(無ければプレースホルダ)
  onSave: (sections: OutlineSection[]) => Promise<boolean>; // 編集後のセクション配列を保存
  onOpenEyecatch: () => void;        // アイキャッチ枠タップ→既存アイキャッチ動線へ案内
  isSaving: boolean;                 // 保存中(スロットエディタの保存ボタン disabled 等)
  saveError?: string;                // 保存失敗/409 の文言(親から素通し)
}
```
- `import type { OutlineSection } from "./outline";`。ハンドラは on* prop・handle* 関数(命名規約)。
- `onSave` は `serializeOutlineSections` を**親側で**呼ぶ(ArtboardView は `OutlineSection[]` を返すだけ)か、ArtboardView 内で serialize してテキストを返すかは**親側 serialize** に統一する(spec §3.3「保存」は `serializeOutlineSections`→ POST の親経路)。本 props は `OutlineSection[]` を渡す形にする。

**受け入れ挙動(spec §3.2/§3.3):**
- **描画要素(上から)**: (1) アイキャッチ枠(16:9・1 枠)= `eyecatchUrl` があれば `next/image` で実画像、無ければ「下書き生成時に自動生成されます」プレースホルダ。タップで `onOpenEyecatch`。(2) セクション行 = h2 見出し実文(`section.heading`)＋グレースケルトンバー(`section.description` の行数感を模した 2〜4 本)＋画像スロット(`slotStateOf` で状態決定・§3.2.2)。
- **スロット状態(P4a は empty/specified)**: `empty`=破線枠＋「＋画像を置く」/ `specified`=スタイルバッジ(6 色)＋説明先頭＋スタイル別プレースホルダ(`mascot`=🛸 等の静的アイコン背景)。`slotStateOf(image, undefined, false)` で判定する(roughUrl・regen は P4a では常に未使用)。
- **3 枚上限表示**: `specified` の実スロットが記事全体で `BODY_IMAGE_MAX`(=3・`@/lib/growth/bodyImage` から import)に達したら、以降のセクションの `empty` スロットは「上限 3 枚(他のセクションの画像を減らすと追加できます)」表示にし「＋画像を置く」を無効化する。
- **レイアウト**: lg 以上=2 カラム(左キャンバス固定幅 ~280px / 右スロットエディタ)。lg 未満=縦積み・スロットタップで該当直下にインライン展開。既存トークン `--p-*`・DetailPanel のインライン展開/二段ナビのパターンを踏襲(新規トークンを足さない)。
- **スロットエディタ**: (a) 6 スタイルチップ = `BODY_IMAGE_STYLE_CHIPS`(`bodyRegenRequest.ts`)を**共有 import**(新規チップを作らない)。先頭 `auto`=「おまかせ」。(b) 説明 textarea = `suggestImageIdea(heading, style)`(T2)で初期値プリフィル(空欄から書かせない)。(c) `textSpec` 欄 = `style ∈ {court, flow, infographic}` のときのみ表示・`maxLength={1000}`。(d)「画像なし」= セクション単位で `suppressImage=true` を選べる。(e) 保存で `section.images` を差し替えた新 `OutlineSection[]` を `onSave` に渡す。「おまかせ」は `style="auto"`(表示名「おまかせ」でシリアライズ)。
- **シリアライズ表示名**は `IMAGE_STYLES`(T1)のフル表示名を使う(チップの短縮ラベルとは分離)。

**テストケース一覧(ArtboardView.test.tsx・単体で・ApproveClient 経由でなく):**
- `empty` スロットタップ→エディタ表示→スタイル選択＋説明編集＋保存→`onSave` が新 `sections`(該当 section.images に 1 件追加)で呼ばれる。
- `court` 選択で textSpec 欄が出る / `mascot` 選択で出ない。
- 説明が `suggestImageIdea` でプリフィルされている(初期 value 非空)。
- 「画像なし」選択→保存で `onSave` の該当 section が `suppressImage=true`・`images=[]`。
- 3 枚 specified 済みのとき、空スロットの「＋画像を置く」が無効・上限文言表示。
- アイキャッチ枠タップ→`onOpenEyecatch` 呼び出し / `eyecatchUrl` ありで実画像・なしでプレースホルダ。
- `isSaving` で保存ボタン disabled・`saveError` 表示。

**参照イディオム:** `SectionImages.tsx`(スタイル select・説明 textarea・バッジ表示の見た目)、`BodyImageRegenModal`(6 チップ選択の結線・カバレッジ除外の薄 presentation 例)、`DetailPanel.tsx` の `--p-*` トークン・二段ナビ/インライン展開。`bodyRegenRequest.ts` の `BODY_IMAGE_STYLE_CHIPS` import。

**Steps:** 失敗テスト(純ロジックは T1/T2 済み・ここは結線挙動)→RED→UI 実装→GREEN→`vitest.config.ts` 追記→コミット案 `feat(growth): 誌面アートボード(キャンバス＋スロットエディタ)を新設`

---

## T5: DetailPanel/ApproveClient 結線＋`SectionImages` 置換

**Files:**
- Modify: `src/app/growth/approve/DetailPanel.tsx`(L52 `DetailTab`・L61 `tabsFor`・L90 `clustersFromLeaves`・L431 本文分岐・props)
- Modify: `src/app/growth/approve/ApproveClient.tsx`(L526 `detailTab`・DetailPanel props 渡し L1108-1157・保存/タブ遷移ハンドラ)
- Modify: `src/app/growth/approve/consult/ConsultComposer.tsx`(L21 `SectionImages` import・L157-177 `renderSectionImages`・L200 `images` 渡し)
- Modify: `src/app/growth/approve/hooks/useReviseEditing.ts`(SectionImages 用の画像編集 state/関数を撤去・`ImageStyleKey` 参照を除去)
- Delete: `src/app/growth/approve/SectionImages.tsx`(co-located テストは無い)
- Test: `src/app/growth/approve/ApproveClient.test.tsx`(誌面タブ遷移・保存 POST・409 表示。旧 SectionImages を叩くテスト L1677-1823 を置換/削除)。ConsultComposer は coverage 除外(結線挙動は ApproveClient.test で担保)

**Interfaces / 変更点:**
- **DetailPanel**:
  - `DetailTab`(L52)に `"artboard"` を追加: `"outline" | "prompt" | "preview" | "images" | "artboard"`。
  - `tabsFor()`(L61)へ `{ key: "artboard", label: "誌面", icon: <IconLayout size={14} /> }` を追加(既存 `IconLayout`/`IconImage` を使う・新規アイコン不要)。
  - `clustersFromLeaves`(L90-98)の「構成案」クラスタ(L95)を `pick("outline")` → `pick("outline", "artboard")` にする。構成案クラスタ配下に「構成案」(OutlineView)と「誌面」(ArtboardView)の 2 リーフが並ぶ。
  - 本文分岐(L431 付近)に `safeTab === "artboard"` を追加し `ArtboardView` を描画(props 素通し)。
  - props に `onOpenArtboard` は不要(遷移は ApproveClient が `onTabChange("artboard")` を実装)。ArtboardView 用 props(`eyecatchUrl`/`onSaveArtboard`/`onOpenEyecatch`/`isSavingArtboard`/`artboardSaveError`)を DetailPanelProps に追加し ArtboardView へ素通しする。`sections` は既存の `sections`(OutlineViewSection)ではなく `outline.ts` の `OutlineSection[]` が必要 → ArtboardView 用に別 prop `artboardSections: OutlineSection[]` を渡す(ApproveClient が `outlineSections(item.outline)` で作る)。
  - **撤去**(T6 と連動・本タスクで DetailPanel の該当 props を消してよい): `imageInstructions`/`onUpdateImage` props と OutlineView への受け渡し(L436/L440)。`import type { ImageInstruction }`(L28)。
- **ApproveClient**:
  - `onSave`(誌面): `serializeOutlineSections(nextSections)` → `postReviseEdit(token, item.id, { outline })`(`/api/growth/revise/edit`)→ 成功で盤再取得(`revise.refreshItems()` 相当)・失敗トースト。**REVISE_BUSY の 409** は「この記事はAI修正処理中です。完了後に編集してください。」(route の 409 文言)を表示する。`useReviseEditing.persistOutline`/`submitReviseEdit`(L184-208)と同型なので、可能なら `persistOutline` を再利用する(`persistOutline(item, nextSections)` は既に `serializeOutlineSections`→ `/revise/edit`)。
  - `onOpenArtboard`: `setDetailTab("artboard")`。
  - アイキャッチ枠タップ(`onOpenEyecatch`): 既存 `onPickEyecatch`(`setMediaFor(item)`)/`onRegenEyecatch`(`requestEyecatchRegen`)へ案内する(タブは画像タブ or 誌面内で既存動線を呼ぶだけ・生成経路は変えない)。
  - **撤去**(T6 連動): `imageInstructions` state(L527)・`setImageInstructions`(L530)・`updateImageInstruction`(L534)・`import type { ImageInstruction }`(L51)・DetailPanel への `imageInstructions`/`onUpdateImage` 渡し(L1142/L1153)。
- **ConsultComposer**(revise モード):
  - `import { SectionImages }`(L21)を外す。`renderSectionImages`(L157-177)を削除し、`Section` の `images` prop(L200)へ渡すものを「**誌面タブで画像を編集**」リンク(親から渡す `onOpenArtboard(): void` を呼ぶボタン)に置換する。`ConsultComposerProps`/`ReviseComposerProps` に `onOpenArtboard: () => void` を足し、ApproveClient が `() => setDetailTab("artboard")`(＋相談ドロワーを閉じる)を渡す。
  - `Section` の `images` は presentation なので、リンクボタン 1 個を描く小さな JSX に差し替える(`SectionEditor`/`Section` 自体は不変)。
- **useReviseEditing**:
  - SectionImages 専用 state/関数を撤去する: `imageFormFor`/`editingImageIdx`/`imageStyle`/`imageDesc`(L43-46)・`setImageStyle`/`setImageDesc`・`startAddImage`/`startEditImage`/`cancelImage`/`saveImage`/`deleteImage`(L236-288)。return からも外す(L313-339 の該当キー)。`import { ImageStyleKey }`(L18)を除去。`persistOutline`/`serializeOutlineSections` は**残す**(誌面保存で ApproveClient が使う)。`useEffect` リセット(L83-85 の imageForm 系)も掃除する。
  - **注意**: `useReviseEditing.test.ts` は存在しない(未作成)。回帰は ApproveClient.test.tsx が担う。

**受け入れ挙動:**
- 構成案クラスタに「構成案」「誌面」の 2 リーフが出て、`onTabChange("artboard")` で誌面が描画される。
- 誌面スロット編集→保存で `/api/growth/revise/edit` に新記法入り `outline` が POST され、成功で盤が最新化される。409 で route の日本語文言が表示される。
- 相談ドロワーの revise モードから `SectionImages` フォームが消え、「誌面タブで画像を編集」リンクで誌面へ遷移する。

**テストケース一覧(ApproveClient.test.tsx):**
- 誌面タブ遷移: 構成案クラスタ→「誌面」で ArtboardView が出る。
- 保存 POST: 誌面でスロット追加→保存→`/api/growth/revise/edit` に新記法(`[画像:表示名: 説明 | 文字: …]` or `[画像:なし]`)入り outline が渡る。
- 409: MSW で revise/edit を 409 にし、「AI修正処理中」文言表示。
- ConsultComposer 置換: 相談 revise モードに「誌面タブで画像を編集」リンクがあり、クリックで詳細タブが `artboard` になる(旧「画像を追加: A」ボタンは無い)。
- **既存テスト置換**: L1677-1823 の SectionImages テスト群(旧語彙 `詳しい図解`/`ミニマル図解`/`マスコット・コスミック` を叩く)を削除、または誌面経由の同等テストへ書き換える。

**参照イディオム:** `DetailPanel.tsx` の `clustersFromLeaves`/`tabsFor`/本文分岐、`useReviseEditing.ts` の `persistOutline`/`submitReviseEdit`、`api.ts` の `postReviseEdit`、`ConsultComposer.tsx` の `Section` `images` slot。

**Steps:** 失敗テスト→RED→DetailPanel/ApproveClient/ConsultComposer/useReviseEditing 実装→SectionImages 削除→GREEN(`npx vitest run src/app/growth/approve/`)→コミット案 `feat(growth): 誌面リーフを結線し SectionImages を誌面編集リンクへ置換`

---

## T6: 旧 ImageDirector 系統の全撤去

**Files(削除・spec §3.1.3):**
- Delete: `src/app/growth/approve/ImageDirector.tsx`
- Delete: `src/app/growth/approve/ImageStateToggle.tsx`
- Delete: `src/app/growth/approve/ImageSlot.tsx`
- Delete: `src/app/growth/approve/ImagePlanBanner.tsx`
- Delete: `src/app/growth/approve/HouseStylePreview.tsx`
- Delete: `src/app/growth/approve/imageDirectorFlag.ts` ＋ co-located `imageDirectorFlag.test.ts`
- Delete: `src/app/growth/approve/imageIntentTypes.ts`(`ImageInstruction`/`ImageMode`/`ImageOutlineSection` 型・`isEyecatch` 概念廃止)
- Delete: `src/lib/growth/imageIntent.ts` ＋ co-located `src/lib/growth/imageIntent.test.ts`

**Files(修正):**
- Modify: `src/app/growth/approve/OutlineView.tsx`(画像レーン撤去・テキスト＋コメントレーン専用へ戻す)
- Modify: `src/app/growth/approve/OutlineView.test.tsx`(画像ディレクター系テスト削除)
- Modify: `vitest.config.ts`(削除ファイルが exclude に載っていれば除去。`OutlineView.tsx` の exclude は残す)
- Modify(必要時): `src/app/growth/approve/mediaLibrary.ts`/`MediaLibraryModal.tsx` の**コメント**(`HouseStylePreview / ImageSlot が使用中` という注記・実 import ではない。文言のみ整える。`mediaSvgUrl` の実利用があるか確認し、無ければコメント修正のみ)

**変更詳細:**
- **OutlineView.tsx**: `import { ImageDirector }`(L20)・`isImageDirectorEnabled`(L21)・`ImagePlanBanner`(L22)・`ImageSlot`(L23)・`ImageStateToggle`(L24)・`@/lib/growth/imageIntent`(L19)・`import type { ImageInstruction, ImageMode }`(L26)を全て外す。`OutlineViewProps` から `imageInstructions`/`onUpdateImage`/`hue`(画像レーン専用なら)を削除。`showImageDirector`・`changeMode`・`ImagePlanBanner` 描画(L154-162)・コントロール行の画像レーン(L245-259)・`editingImg === i` の `ImageDirector` 描画(L262-273)を撤去。`effectiveMode`/`recommendOff`/`resolveAction`/`ImageSlot`/`ImageStateToggle` 参照を消す。OutlineView は「仮説カード＋コメントレーン＋セクション行(見出し/説明/コメント)」専用に戻る。
  - **注**: `hue` は画像レーン(house style プレビュー色相)専用のため撤去してよいが、他参照が無いことを確認する。DetailPanel/ApproveClient から OutlineView への `hue` 渡しも掃除する。
- **DetailPanel/ApproveClient**: T5 で `imageInstructions`/`onUpdateImage`/`ImageInstruction` import は撤去済み。残るは `hue` prop(L128 `hue: number`・L1128 `hue={200}`)の要否確認 — OutlineView が `hue` を使わなくなり ImagesView(`ImagesView` の `hue`)がまだ使うなら DetailPanel の `hue` は残す。ImagesView の `hue` 利用有無を確認して判断する(ImagesView は撤去対象外)。
- **isEyecatch 概念の廃止**: `imageIntentTypes.ts` 削除で `ImageInstruction.isEyecatch?` ごと消える。他に `isEyecatch` 参照が無いことを grep で確認する(spec §3.1.4)。

**受け入れ挙動:**
- ImageDirector 系統 8 ファイル(＋2 テスト)が消え、`OutlineView` が画像レーンなしに戻る。
- `ImageInstruction`/`ImageMode`/`isEyecatch`/`imageIntent`/`imageDirectorFlag` への参照がリポジトリから消える(`approve-proto/` は対象外・触らない)。
- 全スイート GREEN。

**テストケース一覧:**
- 削除に伴う既存テスト整理: `imageDirectorFlag.test.ts`・`imageIntent.test.ts` を削除。`OutlineView.test.tsx` の画像ディレクター系 describe を削除し、テキスト/コメントレーンのテストは残す。
- `ApproveClient.test.tsx` の imageInstructions/画像レーン依存が残っていれば除去(T5 で概ね対応済み)。
- 回帰確認: `grep -rn "imageIntent\|ImageInstruction\|isEyecatch\|imageDirectorFlag\|SectionImages" src/app/growth/approve src/lib/growth`(`approve-proto` を除く)が 0 件。

**参照イディオム:** 既存の削除系タスク(死に UI 撤去)と同様、grep で参照ゼロを確認してから削除する。`approve-proto/`(プロトタイプ)は別系統なので**触らない**。

**Steps:** T4/T5 GREEN を前提に削除→OutlineView/テスト修正→`npx tsc --noEmit` 0＋全テスト GREEN→コミット案 `refactor(growth): 旧ImageDirector系統と isEyecatch 概念を全撤去`

---

## T7: `revise/edit` の outline 上限ガード＋文書更新

**Files:**
- Modify: `src/app/api/growth/revise/edit/route.ts`(outline 最大長ガード追加)
- Modify: `src/app/api/growth/revise/edit/route.test.ts`(上限ケース追記)
- Modify: `docs/operations/growth/20-draft.md`(L14/L18 の旧 3 語彙刷新＋記法拡張追記)
- Modify: `docs/operations/growth-article-style.md`(§9 本文画像小節へ記法拡張追記)
- Modify: `docs/operations/growth-weekly-runbook.md`(L154 付近の旧 3 スタイル刷新＋「文字崩れは AI 再生成で直す」運用追記)

**API ガード(現物確認済み・未実装なので追加):**
- `revise/edit/route.ts`(現状 L37-92)には **outline の最大長ガードが無い**(`isNotionPageId` と非空チェックのみ)。**`outline` 全体長の上限 20000 字ガードを追加する**。位置は `hasOutline`/`hasTitle` 判定(L53-57)の直後・`getPage` より前(追加 I/O なし)。超過時は 400・日本語メッセージ:
  - 例: `outlineStr.length > 20000` → `badRequest("構成案が長すぎます(20000字以内)。")`
  - `title` にも既存上限が無ければ同様に妥当な上限(例 200 字)を検討してよいが、**本タスクのスコープは outline のみ**(title は既存挙動を変えない)。
- 防御多重化(spec §3.4.5): 誌面エディタ(クライアント)は textSpec を 1000 字で頭打ちにするが、サーバ側は textSpec 個別ではなく **outline 全体長**で頭打ちにする(記法は自由入力の集合体のため個別制約は掛けない)。

**テストケース一覧(route.test.ts):**
- outline が 20000 字以内 → 従来どおり 200(既存テスト不変)。
- outline が 20001 字 → 400・日本語メッセージ・`updatePageProps` 未呼出。
- 上限は境界値(20000 ちょうどは許可)。

**文書更新:**
- `docs/operations/growth/20-draft.md`(L12-18 の本文画像節):
  - L14「スタイル `mascot`/`minimal`/`diagram`」→ 6 スタイル(`mascot`/`illust`/`court`/`flow`/`infographic`＋`auto`=おまかせ)へ。
  - L18 の旧 3 語彙マッピングを、style-guide §9 の 6 語彙表示名＋旧→新後方互換マップ(`マスコット・コスミック→mascot` / `ミニマル図解→illust` / `詳しい図解→court`)へ差し替え。
  - 記法拡張の読み方を追記: `[画像:<表示名>: <説明> | 文字: <textSpec>]`(`| 文字:` は全角縦棒 `｜` 可)と `[画像:なし]`(このセクションに画像を出さない)。`textSpec` は `court`/`flow`/`infographic` の画像内文字へ織り込まれ、下書き投入で反映される旨。
  - 誌面(アートボード)で画像を編集する導線になった旨(承認画面の構成案クラスタ「誌面」リーフ)。
- `docs/operations/growth-article-style.md` §9 本文画像小節(現 L125-138):
  - 表示名は既に 6 語彙で正典(**変更不要**)。記法拡張(`[画像:… | 文字: …]`・全角縦棒可・`[画像:なし]`)を追記する。
- `docs/operations/growth-weekly-runbook.md`(L154 付近の本文画像記述):
  - 旧「`mascot`(参照画像方式)/ `minimal` / `diagram`(text-to-image)の 3 種」→ 6 種(§9 準拠)へ刷新。記法 `[画像:<スタイル>: <説明>]` を拡張記法へ更新。
  - 「文字崩れは画像タブの AI 再生成(前段 spec P2・検証ループあり)で直す」運用を明記(初回下書きの `court`/`flow`/`infographic` は決定的 CLI で文字検証ループが無く崩れうるため=spec §3.4.7)。

**Steps:** 失敗テスト→RED→route ガード実装→GREEN→文書 3 ファイル更新→コミット案 `feat(growth): revise/edit に outline 上限ガードを追加し記法拡張を文書へ反映`

---

## T8: 仕上げ(型・lint・全テスト・カバレッジ)

**Files:**
- Modify(必要時のみ): `vitest.config.ts`(`ArtboardView.tsx` 追記済み確認・削除ファイルの除外エントリ掃除)
- 検証:
  - `npx tsc --noEmit` 0(`ImageStyleKey` 廃止の波及・`textSpec`/`suppressImage` の型整合・削除 import ゼロ)。
  - `npm run lint`(`.growth-tmp/` 既知 12 件以外 0)。
  - `npx vitest run --coverage` 全 GREEN。新規/変更**純ロジック 100%**: `src/app/growth/approve/outline.ts` / `scripts/growth/suggest-image-idea.ts` / `src/app/growth/approve/artboardState.ts` / `scripts/growth/body-image.ts` / `src/app/api/growth/revise/edit/route.ts`。
  - `ArtboardView.tsx`(薄 presentation)は `coverage.exclude` に載っているため 100% 対象外だが、`ArtboardView.test.tsx` で結線挙動を担保する。

**Steps:** 検証→(変更があれば)コミット案 `test(growth): 画像アートボード P4a のカバレッジを100%に揃える`

---

## 受け入れ基準(spec §3.5・現状に合わせ)

1. 承認画面の構成案クラスタに「誌面」リーフがあり、タップで記事全体の画像配置(アイキャッチ枠＋各セクション見出し＋画像スロット)を 1 枚で俯瞰できる。
2. `empty` スロットをタップ→6 スタイルチップ(`auto` 含む)＋説明(AI プリフィル済み)＋文字指定(`court`/`flow`/`infographic` 時のみ)を編集→保存で、構成案テキストに新記法(`[画像:表示名: 説明 | 文字: …]` / `[画像:なし]`)で永続化される。
3. 「おまかせ」で AI 任せ、「画像なし」で明示除外ができる。3 枚上限到達で `empty` スロットが「上限 3 枚」表示になる。
4. 下書き生成(`publish-draft`)が新記法を読み、`textSpec` を織り込んだ画像入り下書きを作る。
5. 旧 2 系統 UI(ImageDirector 系統・`SectionImages` の画像追加)が消え、画像の入口が「誌面」1 つに集約される。`isEyecatch` 概念が撤去されている。
6. `outline.ts` の `IMAGE_STYLES` が 6 語彙(style-guide §9 準拠表示名)に統一され、旧 3 表示名は読み込み時に新キーへマップされる。
7. `/api/growth/revise/edit` に outline 上限(20000 字)ガードがある。20-draft.md / style-guide §9 / runbook が記法拡張・6 語彙で更新されている。
