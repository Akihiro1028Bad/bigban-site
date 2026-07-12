# グロース記事 画像アートボード（誌面俯瞰・AI先行提案・実ラフ事前生成）設計 — P4a/P4b/P4c

> 作成: 2026-07-05 / ステータス: ドラフト / 対象: 承認画面 `/growth/approve`（構成案クラスタ）・構成案永続化（`outline.ts`＋`/api/growth/revise/edit`）・pull 型 AI ループ（`run.mjs`）・下書き投入（`publish-draft-cli.ts`）
> 関連 Issue: #59（本文画像）/ #61（構成案の画像指示 persist）/ #62（画像ディレクター）
> 関連文書: `docs/operations/growth/00-canon.md`・`20-draft.md`・`30-loops.md`・`40-notion-props.md`・`docs/operations/growth-article-style.md` §9
> 前段 spec: `docs/superpowers/specs/2026-07-04-growth-body-image-full-flow-design.md`（P1〜P3 完了・本文画像の差し替え／AI 再生成／新規挿入・6 スタイル・文字検証ループ）。
>
> **置換宣言**: 本 spec は前段 spec の §13「P4: 構成案の画像指示 UI 復活（概要のみ・詳細別 spec）」を全面的に置換する。前段 spec の P4 は「`ImageInstruction` に `style` を足し `isImageDirectorEnabled()` を ON にする」方向だったが、本 spec ではその旧・画像ディレクター系統を**全撤去**し、三位一体の「画像アートボード」へ作り替える（§3.1）。前段 spec の P1〜P3（本文画像タブ・6 スタイル・文字検証ループ）は本 spec の前提として**そのまま活かす**。

---

## 1. 背景・目的

### 1.1 旧・画像指示 UI の 4 つの痛み（ユーザー実証済み）

1. **記事全体像が見えない**: 画像指示は構成案テキスト（`## 見出し` ＋ `[画像:…]` トークン）の中に散り、「この記事に何枚・どこに・どんな画像が入るか」を俯瞰する面が無い。
2. **導線が分かりにくい（2 系統併存）**: 画像を指定する UI が 2 つある。
   - `ImageDirector`（`src/app/growth/approve/ImageDirector.tsx`）系統。`isImageDirectorEnabled()`（`src/app/growth/approve/imageDirectorFlag.ts`）が **`false` 固定**でそもそも非表示。指定してもセッション state（`ApproveClient` の `imageInstructions: Record<number, ImageInstruction>`・同 L527）にしか載らず、保存先も下書き生成側の読込も無い「死んだ UI」。
   - `SectionImages`（`src/app/growth/approve/SectionImages.tsx`）系統。相談ドロワー（`consult/ConsultComposer.tsx` が `import { SectionImages }`・同 L21）内で**稼働中**。セクション単位に `[画像:…]` を足す／直す／消す。永続化は `/api/growth/revise/edit` 経由（#61）。
3. **セクション別フォームでの指定が面倒**: `SectionImages` は 1 セクションずつフォームを開いて説明を手打ちする。空欄から書かせるため負荷が高い。
4. **仕上がり品質への不安**: 生成前は SVG モックのプレースホルダしか見えず、「実際に何が出てくるか」がガチャ。`court`/`flow`/`infographic` の文字入り図解は特に不安が大きい。

### 1.2 解: 三位一体の「画像アートボード」

| 要素 | 内容 | フェーズ |
|---|---|---|
| **A. 誌面俯瞰キャンバス** | 構成案から「アイキャッチ＋各セクションの見出し＋画像スロット」を 1 枚の誌面として描画。スロットをタップして編集・保存。画像の入口をここに一本化。 | P4a |
| **B. AI 画像プラン先行提案** | 承認画面から依頼→ PC ループの Claude が構成案全体を読み、2〜3 案（A/B/C）の画像配置プランを JSON で提示。選んで一括適用。 | P4b |
| **C. 実ラフ事前生成ギャラリー** | 各スロットに中品質ラフを 2 枚事前生成し、実画像で選ばせる。確定ラフは本生成時に**参照画像**として渡し、構図を保持したまま高品質化。ガチャ感を消す。 | P4c |

### 1.3 確定済みの前提（前段 spec で調査・実装済み）

- 生成パイプラインは **6 スタイル対応済み**: `scripts/growth/body-image.ts` の `BodyImageStyle = "mascot" | "illust" | "court" | "flow" | "infographic"`（同 L12）＋依頼値型 `RequestedBodyImageStyle = BodyImageStyle | "auto"`（同 L15）・`normalizeBodyImageStyle`（同 L260）・`BODY_IMAGE_MAX = 3`（同 L18）。純ロジックは Web 層へ `@/lib/growth/bodyImage`（`export * from "../../../scripts/growth/body-image"`）で再エクスポート済み。
- 構成案テキストの `[画像:<表示名>: <説明>]` 記法（`src/app/growth/approve/outline.ts`）＋ `/api/growth/revise/edit`（`outline` を直接上書き）＋ `serializeOutlineSections`（`outline.ts` L128）が永続化経路として稼働中（#61）。
- スタイル 6 択の依頼チップ `BODY_IMAGE_STYLE_CHIPS`（`src/app/growth/approve/bodyRegenRequest.ts` L22・6 要素・先頭 `auto`）が存在し、生成モーダル `BodyImageRegenModal.tsx` が共有。
- **6 語彙の正典表示名は `docs/operations/growth-article-style.md` §9（L133-137）にある**: 宇宙人マスコット / 雰囲気イラスト / コート図・ルール図解 / 手順・フロー図 / 比較・インフォグラフィック。`おまかせ`＝`auto`。
- 記事は h2 × 5〜6・本文画像 3 枚上限（`BODY_IMAGE_MAX`）＋アイキャッチ 1 枚。

### 1.4 要統一の既知不整合（本 spec で解消する）

- **`outline.ts` の `IMAGE_STYLES` は旧 3 語彙のまま**: `ImageStyleKey = "mascot" | "minimal" | "diagram"`（同 L8）／表示名 `マスコット・コスミック`・`ミニマル図解`・`詳しい図解`（同 L11-15）。生成側の 6 スタイル（`body-image.ts`）と乖離している。P4a で 6 語彙へ統一する（§3.4）。
- **`docs/operations/growth/20-draft.md` L14/L18 も旧 3 語彙のまま**: L18 は「マスコット・コスミック→`mascot` / ミニマル図解→`minimal` / 詳しい図解→`diagram`」。style-guide §9 は 6 語彙に更新済みなのに 20-draft.md が取り残されている。P4a で 6 語彙＋記法拡張へ更新する（§3.4.6）。

**目的**: 画像の入口を「誌面アートボード」1 つに集約し、旧 2 系統 UI を消す。AI に画像プランを先行提案させ、実ラフで仕上がりを事前に見せる。以て 1.1 の 4 痛みを解消する。

---

## 2. スコープ / 非スコープ

- **スコープ**:
  - **P4a**（詳細設計・実装 plan が書ける粒度）: 誌面アートボード＋旧 2 系統 UI 全撤去＋記法拡張（`textSpec`・`[画像:なし]`）＋`outline.ts` の 6 語彙統一。
  - **P4b / P4c**（設計確定・実装可能な粒度。ただしコード転記はしない。実装 plan は各フェーズ開始時に別途起こす）。
- **非スコープ**:
  - **アイキャッチの生成経路変更**: `eyecatchAction`（下書き生成時の自動生成）＋タイトル焼き込み（#163）の現行経路は不変。アイキャッチは盤面に**表示のみ**する（タップは既存のアイキャッチ再生成・差し替え動線＝`onPickEyecatch`/`onRegenEyecatch`へ橋渡しするだけ）。
  - **公開フロー変更**（下書き `status=draft` の範囲のみ）。
  - **SVG/HTML レンダラーによる図解生成**（前段 spec 同様、将来検討）。

---

## 3. P4a: 誌面アートボード

### 3.1 配置と旧 UI 全撤去

#### 3.1.1 新リーフ「誌面」を構成案クラスタに追加

`src/app/growth/approve/DetailPanel.tsx`:

- `DetailTab`（同 L52・現状 `"outline" | "prompt" | "preview" | "images"`）に **`"artboard"` を追加**する。
- `clustersFromLeaves`（同 L90）の「構成案」クラスタ（同 L95・現状 `pick("outline")`）を `pick("outline", "artboard")` にする。構成案クラスタ配下に「構成案」（`OutlineView`）と「誌面」（新 `ArtboardView`）の 2 リーフが並ぶ。
- `tabsFor()`（同 L61）へ `{ key: "artboard", label: "誌面", icon: <IconLayout … /> }` を追加（アイコンは既存の `IconImage`/`IconLayout` から選ぶ・新規アイコン追加不要）。
- 既存の `OutlineView`（テキスト＋コメントレーン）は**不変で並存**する。ただし OutlineView 内の**画像レーン（`ImageDirector`/`ImageSlot`/`ImagePlanBanner` の結線）は撤去**する（§3.1.3）。画像の入口はアートボードに一本化する。

#### 3.1.2 `SectionImages` の画像追加 UI を撤去しリンクに置換

`src/app/growth/approve/consult/ConsultComposer.tsx` の `import { SectionImages }`（同 L21）を外し、`SectionImages` の描画箇所を「**誌面タブで画像を編集**」への遷移リンク（親から渡す `onOpenArtboard(): void` を呼ぶボタン。`ApproveClient` が `onTabChange("artboard")` を実装）へ置換する。`SectionImages.tsx` 本体とテストは削除する（他に import が無いことを確認済み。呼び出しは `ConsultComposer` の 1 箇所のみ）。

#### 3.1.3 旧 ImageDirector 系統を全撤去

以下を**削除**する（ファイル＋co-located テスト）。撤去理由は各行に明記する:

| 対象 | 撤去理由 |
|---|---|
| `src/app/growth/approve/ImageDirector.tsx` | `isImageDirectorEnabled()=false` で常時非表示。セッション state にしか反映されず保存も生成連携も無い死に UI。 |
| `src/app/growth/approve/ImageStateToggle.tsx` | ImageDirector 専用の「オフ/おまかせ/指定」トグル。撤去に連動。 |
| `src/app/growth/approve/ImageSlot.tsx` | ImageDirector 専用スロット。アートボードのスロットに置換。 |
| `src/app/growth/approve/ImagePlanBanner.tsx` | ImageDirector の house style バナー。アートボードのアイキャッチ枠・注記に置換。 |
| `src/app/growth/approve/HouseStylePreview.tsx` | house style プレビュー。アートボードのプレースホルダに置換。 |
| `src/app/growth/approve/imageDirectorFlag.ts` | フラグ自体が不要（系統ごと撤去）。 |
| `src/app/growth/approve/imageIntentTypes.ts` | `ImageInstruction`/`ImageMode` 型。アートボードは `OutlineImage`（`outline.ts`）を単一ソースにするため不要。 |
| `src/lib/growth/imageIntent.ts` | `effectiveMode`/`recommendOff`/`resolveAction`/`migrateImageHint` の純ロジック。旧 house style ロック前提で、6 スタイル体系と両立しない。撤去。 |

連動して次を撤去・修正する:

- `src/app/growth/approve/OutlineView.tsx`: `import { ImageDirector }`（同 L20）・`isImageDirectorEnabled`（L21）・`ImagePlanBanner`（L22）・`ImageSlot`（L23）・`@/lib/growth/imageIntent`（L19）を外し、画像レーンの描画・`onUpdateImage` 呼び出しを撤去する。OutlineView はテキスト＋コメントレーン専用に戻す。
- `src/app/growth/approve/ApproveClient.tsx`: `imageInstructions` state（同 L527）・`setImageInstructions`・`updateImageInstruction`（同 L534）・`import type { ImageInstruction }`（同 L51）・`DetailPanel` への `imageInstructions`/`onUpdateImage`/`on* Image` props 受け渡し（同 L1142/L1153）を撤去する。
- `DetailPanel` の props（`imageInstructions`・`onUpdateImage` 等）と `OutlineView` への受け渡しを撤去する。

#### 3.1.4 `isEyecatch` 概念の廃止（削除理由を明記）

`ImageInstruction.isEyecatch?`（`imageIntentTypes.ts` L11）を廃止する。**削除理由**: `isEyecatch` はどのプロパティにも保存されず（Notion にも構成案テキストにも書かれない）、下書き生成側にも渡らない「宙に浮いた」フィールドである。アイキャッチは `eyecatchAction`（下書き生成時に自動生成・§2 非スコープ）と `onPickEyecatch`/`onRegenEyecatch`（差し替え・再生成）が担い、構成案の画像指示（本文画像＝最大 3 枚）とは別系統。両者を `isEyecatch` フラグで混ぜる設計は不整合の元なので撤去する。アートボードはアイキャッチを「本文画像スロットとは別枠（先頭の 16:9 枠）」として明確に分離表示する（§3.2）。

### 3.2 キャンバス

`ArtboardView`（新規・`src/app/growth/approve/ArtboardView.tsx`。framer-motion 不使用なら Server Component 化可・ただしタップ展開のため `"use client"` を想定）は、構成案テキストを `parseOutlineSections`（`outline.ts` L78）でセクション配列にし、誌面として描画する。

#### 3.2.1 描画要素（上から順に）

1. **アイキャッチ枠**（16:9・1 枠）:
   - `item` の `eyecatchUrl`（既存・下書き投入済みの場合）があれば **実画像**を `next/image` で表示。
   - 無ければ「下書き生成時に自動生成されます」プレースホルダ（16:9・タイトル焼き込み方針の注記）。
   - タップ時: 既存のアイキャッチ動線（`onPickEyecatch`＝差し替え／`onRegenEyecatch`＝AI 再生成。`ApproveClient` 実装済み）へ**案内するだけ**。アートボードでアイキャッチの生成経路は変えない（§2 非スコープ）。
2. **セクション行**（`parseOutlineSections` の各 `OutlineSection` ごと）:
   - **h2 見出しの実文**（`section.heading`）。
   - **グレースケルトンバー**（`section.description` の行数感を模した 2〜4 本のグレーバー）。本文プレビューではなく「そこに文章がある」ことを示す軽量表現。
   - **画像スロット**（`section.images` を元に描画・§3.2.2）。1 セクションに複数スロットは持てるが、記事全体の実画像は `BODY_IMAGE_MAX=3` 枠まで（§3.2.3）。

#### 3.2.2 スロット状態

| 状態 | 見た目 | 導入 |
|---|---|---|
| `empty` | 破線枠＋「＋画像を置く」 | P4a |
| `specified` | スタイルバッジ（6 色）＋説明先頭。P4c 導入前は**スタイル別プレースホルダ**（`mascot`=🛸 等の静的アイコン背景）を表示 | P4a |
| `rough-ready` | 確定ラフの実画像（16:9 サムネ） | P4c |
| `generating` | パルス（処理中バッジ・`regenKeys` と連動） | P4c |

- スロット状態は「構成案の `[画像:…]` 記法があるか（`specified`）／無いか（`empty`）」＋「確定ラフ URL があるか（`rough-ready`）」＋「本文画像再生成が依頼中/処理中か（`generating`・`deriveRegenKeys` 由来）」で決まる。純関数 `slotStateOf(image, roughUrl, isRegenerating): "empty" | "specified" | "rough-ready" | "generating"` を新設する。
- **3 枚上限到達時**: `specified`／`rough-ready` の実スロットが 3 に達したら、以降のセクションの `empty` スロットは「上限 3 枚（他のセクションの画像を減らすと追加できます）」表示にし、`＋画像を置く` を無効化する。

#### 3.2.3 レイアウト

- **lg 以上**: 2 カラム。左＝キャンバス（固定幅 ~280px）／右＝スロットエディタパネル（§3.3）。スロット選択で右パネルが該当スロットの編集に切り替わる。
- **lg 未満**: 縦積み。キャンバス→スロットタップでエディタが**インライン展開**（該当スロットの直下にエディタが開く）。
- 既存デザイントークン `--p-*`（`--p-green`/`--p-purple`/`--p-red`/`--p-amber` 等・DetailPanel で既用）と、既存のインライン展開パターン（DetailPanel のクラスタ二段ナビ等）を踏襲する。新規トークンは足さない。

### 3.3 スロットエディタ

選択スロット 1 枠を編集するパネル / インライン UI。

- **6 スタイルチップ**: `BODY_IMAGE_STYLE_CHIPS`（`bodyRegenRequest.ts` L22）を**共有 import** する（新規チップ定義を作らない）。先頭 `auto`＝「おまかせ」。
- **説明 textarea（AI 下書きプリフィル）**: 空欄から書かせない。見出し・`section.description` から初期値を埋める純関数 `suggestImageIdea(heading: string, style: RequestedBodyImageStyle): string` を新設する。
  - 位置: `scripts/growth/*.ts`（純ロジック）＋ `src/lib/growth/*` から再エクスポート（§6 純ロジック分離原則）。ただし承認画面クライアント専用で PC ループから呼ばないなら `src/app/growth/approve/suggestImageIdea.ts` に置いてもよい（本 spec は「PC ループの画像プラン（P4b）でも同じ辞書を使う可能性がある」ため `scripts/growth/suggest-image-idea.ts`＋再エクスポートを採る）。
  - 中身: 既存の `suggestActions` 相当（相談ドロワーの提案辞書）を**6 スタイル向けに再設計**した辞書ロジック。スタイルごとに「見出しの語 → 図の切り口」のテンプレ（例: `court` かつ見出しに「ルール」を含む→「◯◯のルールを俯瞰コート図で示す」）。ネットリサーチはしない・未確定事実は入れない（§4.2 の出どころルールに準拠）。
- **文字・数値欄（`textSpec`）**: `style ∈ { court, flow, infographic }` を選択したときのみ表示。1000 字上限。図に焼き込む文字・数値を明示する（前段 spec §5 の安全設計に接続）。
- **「おまかせ」チップ選択**: そのセクションは AI 任せ。構成案には `[画像:おまかせ: <説明>]` を書く（`auto` は表示名「おまかせ」でシリアライズ・§3.4）。PC ループが具体スタイルへ解決する。
- **「画像なし」の明示**: セクション単位で「このセクションに画像を出さない」を選べる。構成案に `[画像:なし]` を書く（§3.4）。空（記法なし）＝「未指定（AI が入れるかもしれない）」と、`[画像:なし]`＝「明示的に出さない」を区別する。
- **保存**: スロットの編集は `section.images` を差し替えた新セクション配列を `serializeOutlineSections`（§3.4 拡張版）で構成案テキストへ戻し、`/api/growth/revise/edit` に `{ pageId, outline }` で POST する（§3.4.5）。

### 3.4 永続化（記法拡張）

#### 3.4.1 記法の拡張

既存 `[画像:<表示名>: <説明>]` を次のとおり拡張する:

1. **文字指定セグメント**: `[画像:<表示名>: <説明> | 文字: <textSpec>]`
   - `| 文字:` 区切り。`textSpec` は任意。区切り文字は半角縦棒 `|` と**全角縦棒 `｜` の両方**を許容する。
   - `textSpec` を含むのは `court`/`flow`/`infographic` のみ（他スタイルで書かれていても parse は受理し、CLI 側で無視する）。
2. **画像なし**: `[画像:なし]`
   - このセクションに画像を出さない明示指示。`OutlineImage` としては特殊値（§3.4.3）。

#### 3.4.2 `outline.ts` を 6 語彙へ統一

`src/app/growth/approve/outline.ts`:

- `ImageStyleKey`（同 L8）を **6 語彙**へ変更する。生成側と揃えるため `RequestedBodyImageStyle`（`@/lib/growth/bodyImage`）を再利用し、`ImageStyleKey = RequestedBodyImageStyle`（= `"mascot" | "illust" | "court" | "flow" | "infographic" | "auto"`）とする。`outline.ts` から重複定義を消し、`bodyImage` を単一ソースにする。
- `IMAGE_STYLES`（同 L11）の表示名を **style-guide §9（L133-137）と完全一致**させる:

  | key | 表示名 |
  |---|---|
  | `auto` | おまかせ |
  | `mascot` | 宇宙人マスコット |
  | `illust` | 雰囲気イラスト |
  | `court` | コート図・ルール図解 |
  | `flow` | 手順・フロー図 |
  | `infographic` | 比較・インフォグラフィック |

  （注: `bodyRegenRequest.ts` の `BODY_IMAGE_STYLE_CHIPS` は現状ラベルが短縮形〔「コート図」等〕。誌面編集で書き出す構成案の正典表示名は §9 準拠のフル表示名に統一する。チップの表示ラベルとシリアライズ表示名を分離し、シリアライズは `IMAGE_STYLES` のフル表示名を使う。）

- **旧 3 表示名の後方互換読み込み**: 既存の構成案テキストには旧表示名（`マスコット・コスミック`／`ミニマル図解`／`詳しい図解`）が残り得る。`imageStyleKeyFromLabel`（同 L27）に旧→新マップを追加する（`マスコット・コスミック`→`mascot`／`ミニマル図解`→`illust`／`詳しい図解`→`court`。生成側 `normalizeBodyImageStyle` の `minimal→illust`・`diagram→court` と整合）。**書き出しは常に新語彙**（`serializeImageDirective` は `IMAGE_STYLES` の新表示名のみ使う）。

#### 3.4.3 型・parse/serialize の拡張

- `OutlineImage`（同 L32）に **`textSpec?: string`** を追加する。
- `[画像:なし]` の表現: `OutlineSection` に **`suppressImage?: boolean`**（このセクションは画像を出さない）を追加する。`OutlineImage` の配列とは別のフラグにする（「なし」は画像 0 件かつ明示 suppress を意味し、`images: []` の未指定とは異なる）。
- `IMAGE_DIRECTIVE_RE`（同 L50）を拡張し、説明部の後に任意で `| 文字: <textSpec>` を取れるようにする。`[画像:なし]`（`なし` 表示名）は専用に判定して `suppressImage=true` を立て、`images` には積まない。
- `parseImageDirectives`（同 L56）: `textSpec` を抽出して `OutlineImage.textSpec` に載せる。表示名が「なし」のトークンは `OutlineImage` を作らず `suppressImage` シグナルを返す（parse の戻り値を `{ images, suppress }` 構造にするか、`parseOutlineSections` 側で「なし」トークンを検出して `current.suppressImage=true` を立てる。本 spec は後者＝`parseOutlineSections` で検出を採る。`parseImageDirectives` の戻り値互換を保つため）。
- `serializeImageDirective`（同 L67）: `textSpec` があれば ` | 文字: <textSpec>` を付与する。区切りは半角 `|`（書き出しは常に半角）。
- `serializeOutlineSections`（同 L128）: `suppressImage` が真なら該当セクションに `[画像:なし]` を 1 行書く（`images` は空のはず）。

#### 3.4.4 混在行の扱い（既存仕様を維持）

`parseOutlineSections`（同 L96-101）は「画像指示だけの行」を画像に振り分け、テキストと画像トークンが混在する行は行全体を説明として残す。この既存仕様を維持する。誌面エディタは画像指示を**単独行**で書き出す（`serializeOutlineSections` が保証）ため、混在は起きない。

#### 3.4.5 保存 API（既存 `/api/growth/revise/edit` を流用・変更不要）

`src/app/api/growth/revise/edit/route.ts` は `{ pageId, outline?, title? }` を受け、`outline` を**直接上書き**する（AI を介さない手動編集）。`verifyToken`（同 L37）・`articleEditGuard`（同 L71）・`REVISE_BUSY_STATUSES` 409（同 L69-73）を既に備える。誌面エディタの保存は「構成案テキスト全体を上書き」なので**このルートをそのまま使い、変更は不要**。

- ただし `revise/edit` は `outline` に対する `sanitizeNewsHtml` 相当のサニタイズは行わない（構成案は HTML でなく Markdown ライクなテキスト）。記法は `[画像:…]` トークンのみで、`textSpec` は自由入力。**サーバ側で `textSpec` 部分の長さ制約は掛からない**点に注意。誌面エディタ（クライアント）で 1000 字上限を掛けるが、防御多重化のため `buildOutlineEditProps`（`@/lib/growth/revise`）到達前に `outline` 全体長の既存上限（あれば）で頭打ちにする。**構成案全体の上限が未設定なら本 spec で `revise/edit` に `outline` 最大長（例: 20000 字）の 400 ガードを追加する**（実装 plan で現物確認して確定）。

#### 3.4.6 文書更新（P4a スコープ）

- `docs/operations/growth/20-draft.md`:
  - L14 の「スタイル `mascot`/`minimal`/`diagram`」を 6 スタイルへ更新。
  - L18 の旧 3 語彙マッピングを、style-guide §9 の 6 語彙表示名＋旧→新後方互換マップ（`マスコット・コスミック→mascot`/`ミニマル図解→illust`/`詳しい図解→court`）へ差し替える。
  - **記法拡張の読み方を追記**: `[画像:<表示名>: <説明> | 文字: <textSpec>]`（`| 文字:` は全角縦棒可）と `[画像:なし]`（このセクションに画像を出さない）。`textSpec` は `court`/`flow`/`infographic` の `images[]` の `textSpec` に反映され、下書き投入で画像内文字へ織り込む旨。
- `docs/operations/growth-article-style.md` §9: 記法拡張（`| 文字:`・`[画像:なし]`）を本文画像小節（L125-139）に追記。表示名は既に 6 語彙で正典（変更不要）。
- `publish-draft-cli` への反映は §3.4.7。

#### 3.4.7 下書き投入への `textSpec` 反映

`scripts/growth/publish-draft-cli.ts`:

- 現状 L208 は `buildBodyImageSpec(im.index, normalizeBodyImageStyle(im.style), im.description)`（`textSpec` を渡していない）。
- `buildBodyImageSpec`（`body-image.ts` L102。現状 `(index, style, description)`）に **第 4 引数 `textSpec?: string`** を追加し、`description` に「図に入れる文字・数値」を織り込んだ `prompt`/`alt` を組み立てるよう拡張する（前段 spec §5 の出どころルールに準拠したプロンプト文言）。
- `publish-draft-cli` の `im`（下書き生成 Claude が出す画像スペック）に `textSpec` を通し、`buildBodyImageSpec(im.index, normalizeBodyImageStyle(im.style), im.description, im.textSpec)` にする。
- **初回生成は決定的 CLI（`publish-draft`）で回すため目視検証ループは無い**（前段 spec §5.3 の検証ループは PC ループ側の「本文画像 AI 再生成」#156 だけが持つ）。したがって初回下書きの `court`/`flow`/`infographic` は**文字が崩れる可能性がある**。運用として「文字崩れは画像タブの AI 再生成（前段 spec P2・検証ループあり）で修正する」ことを 20-draft.md／runbook に明記する。

### 3.5 P4a 受け入れ基準

1. 承認画面の構成案クラスタに「誌面」リーフがあり、タップで記事全体の画像配置（アイキャッチ枠＋各セクション見出し＋画像スロット）を 1 枚で俯瞰できる。
2. `empty` スロットをタップ→6 スタイルチップ（`auto` 含む）＋説明（AI プリフィル済み）＋文字指定（`court`/`flow`/`infographic` 時のみ）を編集→保存で、構成案テキストに新記法（`[画像:表示名: 説明 | 文字: …]` / `[画像:なし]`）で永続化される。
3. 「おまかせ」で AI 任せ、「画像なし」で明示除外ができる。3 枚上限到達で `empty` スロットが「上限 3 枚」表示になる。
4. 下書き生成（`publish-draft`）が新記法を読み、`textSpec` を織り込んだ画像入り下書きを作る。
5. 旧 2 系統 UI（ImageDirector 系統・`SectionImages` の画像追加）が消え、画像の入口が「誌面」1 つに集約される。`isEyecatch` 概念が撤去されている。
6. `outline.ts` の `IMAGE_STYLES` が 6 語彙（style-guide §9 準拠表示名）に統一され、旧 3 表示名は読み込み時に新キーへマップされる。

---

## 4. P4b: AI 画像プラン先行提案

構成案全体を Claude が読み、2〜3 案の画像配置プランを提示する。承認画面で選んで一括適用する。pull 型（承認画面は Notion に依頼を書くだけ・PC ループが拾って提示・**反映は人**）。

### 4.1 データモデル（Notion「記事ネタ案」DB・新プロパティ）

| プロパティ | 型 | 用途 |
|---|---|---|
| `画像プランステータス` | select（`なし`/`依頼中`/`処理中`/`提示中`/`失敗`） | プランループの状態。busy 集合＝`{依頼中, 処理中, 提示中}`。 |
| `画像プラン依頼時刻` | date | 依頼時刻。stale 回収（15 分・既存 `selectStale*` 方式）判定用。 |
| `画像プラン提案` | rich_text（JSON） | 提示された 2〜3 案の JSON（§4.3）。 |

- 欠落耐性: 未追加でも沈黙落ちせず `growthApiError`（#177）でプロパティ名つきに可視化する。
- 文書: `docs/operations/growth/40-notion-props.md` に「画像プラン先行提案（#62/P4b）」節を追記（本文画像 AI 再生成節 L51-62 と同じ流儀）。

### 4.2 API `/api/growth/image-plan`（新設 POST・依頼を書くだけ）

- **body**: `{ pageId }`。
- **認可・ガード**: `verifyToken`（`Authorization: Bearer`・`authHeaders`）＋ `articleEditGuard`。
- **busy 409**: `画像プランステータス ∈ {依頼中, 処理中, 提示中}` なら 409。
- **処理**: `画像プランステータス=依頼中`・`画像プラン依頼時刻=now` を 1 PATCH で書くだけ（生成は PC ループ）。
- レスポンス `{ success: true }`。

### 4.3 PC ループ（`run.mjs` 新 mode `image-plan`）

`scripts/growth/run.mjs` の `MODES`（同 L41）へ `image-plan` を追加する。lock は既存の `REVISE_LOCK`（同 L113・`revise` 系と共有）を使い、多重起動を防ぐ。

- **プロンプト**: `scripts/growth/prompts/image-plan.md`（新設）。Claude は構成案・記事タイプ・style-guide §9 を読み、**2〜3 案**を JSON で提示する。各案は「記事全体でどのセクションにどのスタイルの画像を何枚（合計 3 枚以内）置くか」の配置プラン。
- **CLI**: `scripts/growth/image-plan-cli.ts`（新設）。#182 `comment-revise-cli.ts`（reap/next/present/fail・同 L189-201）と**同型**:
  - `reap`: `処理中`/`依頼中`のまま stale（>15 分）を `失敗`へ回収＋LINE 通知。
  - `next`: `依頼中`を 1 件ロック（`処理中`）し、構成案・記事タイプ等を JSON で標準出力。
  - `present <pageId> <jsonファイル>`: Claude が書いた案 JSON を zod 検証し、`画像プラン提案` へ書いて `画像プランステータス=提示中`＋LINE 通知。**反映は人**（承認画面で選んで適用）。
  - `fail <pageId> <reason>`: `失敗`＋理由＋LINE 通知。
- **JSON スキーマ（zod 検証）**:
  ```
  ImagePlan = { label: string, slots: Slot[] }
  Slot = { sectionIndex: number, style: RequestedBodyImageStyle, description: string, textSpec?: string }
  提示 = ImagePlan[]（2〜3 案）
  ```
  - `slots` の合計は `BODY_IMAGE_MAX=3` 以内（超過は zod で reject → `fail`）。
  - `sectionIndex` は `parseOutlineSections` の 0 始まりインデックス。
  - `style` は 6 語彙＋`auto`。`textSpec` は 1000 字上限。
- **`textSpec` の出どころ確定ルール**: プロンプト（`image-plan.md`）に前段 spec §5.1 と同じ 3 種のみ許可（`facility-context.json` 確定値・構成案/本文既載値・ピックルボール公式規格）と**ネットリサーチ禁止・未確定情報の断定禁止**を明記する。

### 4.4 UI（承認画面・アートボード）

- `画像プランステータス=提示中`になると、アートボード上部に**プランチップ A/B/C**（`画像プラン提案` JSON の各 `label`）を表示する。ポーリングは既存 `useDraftPreview` の 5 秒ポーリングを流用（提示中を検出）。
- プランチップ選択で、その案の `slots` を**ゴーストプレビュー**として誌面に重ねる（該当セクションのスロットに半透明バッジで「A 案: `court` …」を表示）。
- 「このプランを適用」ボタン: 選んだ案の `slots` を `OutlineImage[]`（`sectionIndex` で各セクションへ振り分け・`style`/`description`/`textSpec`）へ変換し、`serializeOutlineSections` で構成案テキストへシリアライズ→ `/api/growth/revise/edit` に `{ pageId, outline }` で保存する。
- 適用後、`画像プランステータス=なし`へクリアする（クリア用に `/api/growth/image-plan` に `?action=clear` 相当か、`revise/edit` 保存成功時にクライアントから別 PATCH。**本 spec は「適用は `revise/edit` 1 本で構成案を保存し、ステータスクリアは同 API に `clearImagePlan` フラグを足すのではなく、専用の軽量 API を作らず `image-plan-cli` の done 相当で PC が消す」ではなく、UI から即時性が要るため `/api/growth/image-plan` に `POST { pageId, action: "clear" }` を足してステータスだけ `なし`に戻す**方式を採る）。

### 4.5 P4b 受け入れ基準

1. 承認画面「AI に画像プランを提案させる」で `/api/growth/image-plan` に依頼が書かれ、busy 中は 409。
2. PC ループ（mode `image-plan`）が構成案・記事タイプ・§9 を読み、2〜3 案を zod 検証済み JSON で `提示中`にする。合計 3 枚超・不正 style は `失敗`＋通知。
3. アートボードにプランチップ A/B/C が出て、選択でゴーストプレビュー、「適用」で `[画像:…]` 記法へシリアライズして保存され、ステータスが `なし`に戻る。
4. `textSpec` はプロンプトの出どころルールに縛られ、未確定情報を断定しない。

---

## 5. P4c: 実ラフ事前生成

各スロットに中品質ラフを 2 枚事前生成し、実画像で選ばせる。確定ラフは本生成時に参照画像として構図を保持する。pull 型。

### 5.1 データモデル（Notion・新プロパティ）

| プロパティ | 型 | 用途 |
|---|---|---|
| `ラフ生成ステータス` | select（`なし`/`依頼中`/`処理中`/`失敗`） | ラフループの状態。busy 集合＝`{依頼中, 処理中}`。 |
| `ラフ生成依頼時刻` | date | stale 回収判定。 |
| `ラフ生成依頼` | rich_text（JSON） | `[{ slotKey, style, description, textSpec? }]`（§5.4）。 |
| `ラフ生成結果` | rich_text（JSON） | `[{ slotKey, urls: [microCMS URL, …] }]`。 |

- `slotKey`: スロットを一意に指す文字列。`sectionIndex:imageOrdinal`（例 `2:0`）＝「2 番目のセクションの 0 番目の画像」。構成案の並びが変わると索けなくなるため、依頼〜結果は同一保存内で完結させる（並び変化時は結果を破棄して再依頼する運用）。
- 欠落耐性・文書追記は P4b と同様（40-notion-props.md に「実ラフ事前生成（#62/P4c）」節）。

### 5.2 API `/api/growth/rough`（新設 POST・依頼を書くだけ）

- **body**: `{ pageId, slots: [{ slotKey, style, description, textSpec? }] }`。
- **認可・ガード**: `verifyToken` ＋ `articleEditGuard`。
- **busy 409**: `ラフ生成ステータス ∈ {依頼中, 処理中}` なら 409。
- **検証**: `slots` を zod 検証（`style` 6 語彙＋`auto`・`textSpec` 1000 字上限・`slots` 件数上限＝3）。
- **処理**: `ラフ生成依頼=<JSON>`・`ラフ生成ステータス=依頼中`・`ラフ生成依頼時刻=now` を 1 PATCH。
- レスポンス `{ success: true }`。

### 5.3 PC ループ（`run.mjs` 新 mode `rough`）

- lock は既存 `REVISE_LOCK` を共有。
- **CLI**: `scripts/growth/rough-cli.ts`（新設・reap/next/done/fail 型）。
  - `next`: `依頼中`→`処理中`ロックし、`ラフ生成依頼` JSON を標準出力。
  - `done <pageId> <resultJson>`: `ラフ生成結果`書き込み＋`ラフ生成ステータス=なし`＋LINE 通知。
  - `reap`/`fail`: stale 回収・失敗通知（既存流儀）。
- **生成**: `gen-body-image`（`scripts/growth/gen-body-image.ts`）を **`quality=medium`** で、各 slot × **2 枚**生成する。参照画像分岐は `style === "mascot"` を維持（同 L58）。
- **アップロード**: 生成画像を microCMS メディアへアップロードする。**ファイル名 prefix `growth-rough-`** を付け、本番メディア（`growth-` 等）と区別する。
- **結果**: `[{ slotKey, urls: [...] }]` を Notion `ラフ生成結果`へ→ LINE 通知。
- **1 日上限カウンタ**: 既存 `revise-count.json`（`run.mjs` L114 `REVISE_COUNT`）と同方式でラフ生成回数を日次上限で頭打ちにする（暴走・コスト暴発防止）。
- **プロンプト**: `scripts/growth/prompts/rough.md`（新設。文字入りラフの検証はラフ段階では**掛けない**〔中品質・仮確認用〕。文字崩れの最終チェックは本生成〔§5.5〕で扱う）。

### 5.4 UI（アートボード・ラフギャラリー）

- スロットに**ラフギャラリー**（`ラフ生成結果` の該当 slot の 2 枚＋「追加生成」ボタン）を表示。追加生成は `/api/growth/rough` へ再依頼（同一 slot を 2 枚追加）。
- ユーザーが 1 枚を**「確定」**する。確定でスロット状態が `rough-ready`（§3.2.2）になり、確定ラフ URL をスロットに保持する。
- **確定ラフの保持先＝構成案記法セグメント**（別プロパティ JSON ではなく記法に持つ）:
  - `[画像:<表示名>: <説明> | 文字: <textSpec> | ラフ: <microCMS URL>]`
  - `outline.ts` の `OutlineImage` に `roughUrl?: string` を追加。`parseImageDirectives`/`serializeImageDirective`/`IMAGE_DIRECTIVE_RE` を `| ラフ:` セグメント対応に拡張（`| 文字:` と同じ流儀。URL は `isMicrocmsAssetUrl` で形式検証し、不正は破棄）。
  - 確定は「該当スロットの `OutlineImage.roughUrl` を確定 URL にして `serializeOutlineSections`→ `/revise/edit` 保存」で行う（P4b の適用と同じ経路）。

### 5.5 本生成の構図保持（重要）

gpt-image は非決定的なため、同一プロンプトの本生成では構図が変わり「ガチャ感」が戻る。これを防ぐ:

- **確定ラフがある画像は、下書き投入（`publish-draft-cli`）が確定ラフを参照画像として `/v1/images/edits` で高品質化する**。
  - `generateImage`（`scripts/growth/eyecatch.ts` L114）は `refPath` を渡すと `/v1/images/edits`（`EYECATCH_EDITS_URL`・同 L15）で参照画像を使う。この `refPath` 機構を流用する（`mascot` の参照画像方式と同じ）。
  - `publish-draft-cli` の `resolveBodyImageUrl`（同 L155）の `refPath` 分岐（現状 `imgSpec.style === "mascot" ? DEFAULT_REF : undefined`・同 L164）を拡張し、**確定ラフ URL があればそれを `refPath` に使う**（ローカル一時ダウンロード→パス渡し、または `generateImage` を URL 参照対応に薄く拡張。実装 plan で `generateImage` の `readFile` 依存〔同 L119〕をどう満たすか確定）。`quality=high` で高品質化する。
- **フォールバック（沈黙させない）**: `edits` が失敗したときは、**確定ラフ URL をそのまま本文に採用**する（本生成をあきらめ、選んでもらった中品質ラフを載せる）。この降格は LINE 通知に注記する（「本生成 edits 失敗・確定ラフをそのまま採用」）。沈黙させない（正典の絶対禁止）。

### 5.6 コスト概算（spec 記載必須）

- ラフ中品質（`quality=medium`）: 約 **6〜10 円/枚**。
- 1 記事: スロット最大 3 × 2 枚＝6 枚（＋追加生成）で **約 50〜150 円/記事**。
- 想定本数で **月 1,000 円規模**。1 日上限カウンタ（§5.3）で頭打ちにする。

### 5.7 P4c 受け入れ基準

1. アートボードのスロットから `/api/growth/rough` で中品質ラフ 2 枚が事前生成され（PC ループ mode `rough`）、microCMS に `growth-rough-` prefix でアップロードされ、ギャラリーに実画像で並ぶ。
2. 1 枚を「確定」すると `[画像:… | ラフ: <url>]` 記法で構成案に保存され、スロットが `rough-ready`になる。
3. 下書き投入で、確定ラフを参照画像（`/v1/images/edits`）として本生成し、構図を保持した高品質画像が本文に入る。`edits` 失敗時は確定ラフをそのまま採用し LINE 注記する。
4. 1 日上限カウンタが効き、コストが月 1,000 円規模に収まる。

---

## 6. 横断（全フェーズ共通）

### 6.1 設計原則（CLAUDE.md 正典）

- **pull 型**: 承認画面（Vercel）は Notion に依頼を書くだけ。重い生成（プラン提示・ラフ生成・本生成）は常時稼働 PC の `run.mjs` ループが拾う。反映は人（プラン適用・ラフ確定はユーザー操作）。
- **純ロジック分離**: 新規ロジックは `scripts/growth/*.ts` に置き `src/lib/growth/*` から再エクスポート（例: `suggest-image-idea.ts`／記法拡張は `outline.ts`〔承認画面ローカル純ロジック・Notion 非依存〕）。CLI・`run.mjs`・`gen-*` はカバレッジ除外（既存方針）。
- **欠落耐性**: 新 Notion プロパティ未追加でも沈黙落ちさせず `growthApiError`（#177）で可視化。読み取りは既定値へフォールバック。
- **沈黙させない**: 失敗は全経路で LINE 通知＋工程名。stale 15 分回収。文字崩れ・edits 降格も通知。
- **段階ガード（#H9）**: 全書き込み経路に `articleEditGuard` を適用。
- **TDD・カバレッジ 100%**（CLI・`run.mjs`・`gen-*` 除外・薄い presentation は `vitest.config.ts` の `coverage.exclude` に追記）。

### 6.2 セキュリティ

- 新 API（`/api/growth/image-plan`・`/api/growth/rough`）はすべて `verifyToken`（`Authorization: Bearer`・`src/lib/growth/apiAuth.ts` 経由）＋ `articleEditGuard`。`APPROVE_AUTH_ENABLED` を**本番公開前に必ず ON**。
- JSON プロパティ（`画像プラン提案`・`ラフ生成依頼`・`ラフ生成結果`）はすべて **zod 検証＋上限長**（`textSpec` 1000 字・`slots` 件数 ≤ 3・全体 JSON 長の頭打ち）。
- ラフ・確定ラフ URL は `isMicrocmsAssetUrl`（`@/lib/growth/media`・`https`・`images.microcms-assets.io`）で allowlist 検証。任意 URL を参照画像にできないようにする。
- `MICROCMS_MANAGEMENT_API_KEY` は server-only 維持（`NEXT_PUBLIC_` 禁止）。メディアアップロードは API ルート／PC ループ経由のみ。

### 6.3 文書更新（全フェーズ）

| 文書 | 追記内容 |
|---|---|
| `docs/operations/growth/40-notion-props.md` | 新プロパティ群（画像プラン 3 種・ラフ生成 4 種）。 |
| `docs/operations/growth/30-loops.md` | 新ループ 2 種（`image-plan`・`rough`）。 |
| `docs/operations/growth/20-draft.md` | アートボード（誌面編集）・記法拡張（`| 文字:`・`[画像:なし]`・`| ラフ:`）・旧 3 語彙 L14/L18 の 6 語彙刷新。 |
| `docs/operations/growth-article-style.md` | 記法拡張の追記（表示名 §9 は変更不要）。 |
| `docs/operations/growth-weekly-runbook.md` | 旧 3 スタイル記述の刷新・アートボード運用・「文字崩れは AI 再生成で直す」運用の明記。 |

---

## 7. フェーズ分け・受け入れ基準（まとめ）

| フェーズ | 内容 | 受け入れ基準（要約） |
|---|---|---|
| **P4a** | 誌面アートボード＋旧 2 系統全撤去＋記法拡張（`textSpec`/`[画像:なし]`）＋`outline.ts` 6 語彙統一＋`publish-draft-cli` の `textSpec` 反映 | §3.5。誌面で全体俯瞰・スロット編集→新記法で永続化・下書き生成が読む・入口 1 つ・旧 UI と `isEyecatch` 撤去。 |
| **P4b** | AI 画像プラン先行提案（Notion 3 プロパティ・`/api/growth/image-plan`・mode `image-plan`・`image-plan-cli`・zod 検証・プランチップ A/B/C 適用） | §4.5。依頼→2〜3 案提示→選択→ゴーストプレビュー→適用で `[画像:…]` 保存。 |
| **P4c** | 実ラフ事前生成（Notion 4 プロパティ・`/api/growth/rough`・mode `rough`・`rough-cli`・中品質 2 枚・`growth-rough-` prefix・確定ラフ `| ラフ:` 記法・本生成 `edits` 構図保持＋フォールバック・1 日上限・月 1,000 円規模） | §5.7。ラフ 2 枚→確定→本生成で構図保持・失敗時フォールバック通知。 |

各フェーズの実装 plan は当該フェーズ開始時に別途起こす。P4a は本 spec の粒度で実装 plan を書ける。P4b/P4c は設計確定・コード転記は実装 plan で行う。

---

## 8. 制約（プロジェクト規約・再掲）

- TDD 必須・カバレッジ 100% ゲート（純ロジックはテスト・薄い presentation は `coverage.exclude` 追記）。純ロジック（`outline.ts` 記法拡張・`suggestImageIdea`・`slotStateOf`・プラン/ラフ JSON の zod スキーマ・記法の後方互換マップ）を優先的にテストする。
- TS strict / `any` 禁止 / `React.FC` 禁止 / `import type` / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- App Router（Server Component 既定・`"use client"` 最小・`next/image`・framer-motion 使用ファイルは `"use client"`）。
- グロースループ禁止事項（`run.mjs` から公開/commit/push しない・未確定情報を断定しない・**画像内の文字でも**断定しない・失敗を沈黙させない）維持。
- 出力（仕様/計画/コミット/説明）は日本語。push 禁止（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。push 時のみ `ttmakhr1028ai-art`。
