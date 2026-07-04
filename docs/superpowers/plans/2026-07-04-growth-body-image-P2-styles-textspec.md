# グロース本文画像 P2（多スタイル＋文字検証）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本文画像の再生成を **6 スタイル（おまかせ／mascot／illust／court／flow／infographic）** で選べるようにし、`court`/`flow`/`infographic` に**文字・数値（textSpec）**を安全に焼き込めるようにする（spec §13 P2）。承認画面の画像タブ「AIで再生成」を生成モーダル経由にし、スタイル 6 択＋自由指示＋文字指定を送る。文字入りは PC ループの Claude が**目視照合→最大3回再生成→3回失敗は文字なし版納品＋LINE 通知**する検証ループを回す。

**Architecture:** スタイルの純ロジック（型・正規化・プロンプトビルダー・alt）は `scripts/growth/body-image.ts`、依頼キューの純ロジック（Props ビルダー・Row/View）は `scripts/growth/body-image-regen.ts` に置き、Web 層は `src/lib/growth/bodyImage.ts`（新設 `export *`）／`src/lib/growth/bodyImageRegen.ts`（既存 `export *`）経由で消費する。style/textSpec は Notion プロパティ・API（`/api/growth/body-image/regen`）・CLI（`next` 出力）・プロンプト（`regen-body-image.md`）へ一気通貫で通す。生成モーダルは承認画面の共通コンポーネント（P3 でエディタからも使う前提の設計だが、P2 では画像タブ「AIで再生成」からのみ起動）。placeholder/挿入・エディタ・競合ガードは **P3 スコープなので触らない**。

**Tech Stack:** Next.js 16 App Router（Route Handler・`runtime = "nodejs"`）/ TypeScript strict / React 19 + React Testing Library / Vitest / microCMS content API + Notion / OpenAI gpt-image-2（`gen-body-image`）。

**タスク分割の判断（隣を承認しつつこれだけ差し戻せる単位・1-2 行）:** 純ロジック（スタイル体系 T1 → Props/Row/View T2）を先に確定し、それを消費する API（T3）・PC ループ（T4）・UI（T5）を積む。`RequestedBodyImageStyle`/`normalizeBodyImageStyle` は全タスクの共有語彙のため T1 で先に固め、以降のタスクはこの型を import して繋ぐだけにする。文書（T6）は実装後に単独で差し戻せるよう最後に置く。仕上げ検証（T7）で 100% カバレッジと型/lint を確定する。

## 運用上の前提（Notion 手動プロパティ追加）

この計画は Notion「記事ネタ案」DB（data source `5adab8b1-f182-4123-b963-9463a2580d4a`）に **次の 2 プロパティの手動追加**を前提とする（各ループは pull 型で Notion を読み書きするため）:

| プロパティ名 | 型 | select 選択肢 | 用途 |
|---|---|---|---|
| `本文画像スタイル` | select | `おまかせ` / `mascot` / `illust` / `court` / `flow` / `infographic` | 再生成する本文画像のスタイル指定。`おまかせ`＝`auto`（Claude が文脈で選ぶ）。 |
| `本文画像文字指定` | rich_text | — | 図に焼き込む文字・数値のリスト（textSpec・自由入力・サーバ側 1000 字上限）。 |

- **欠落耐性**: プロパティ未追加でも沈黙落ちさせない。書き込み経路は `growthApiError`（既存 #177）でプロパティ名つきの 500（`Notion に必要なプロパティ「本文画像スタイル」がありません。…`）に可視化される。読み取り経路は「未設定＝`おまかせ`／空」として従来どおり動く（完全後方互換）。
- **既存 4 プロパティ**（`本文画像再生成指示`／`本文画像再生成ステータス`／`本文画像再生成依頼時刻`／`本文画像再生成対象`）は P1・#156 のまま維持する。

## Global Constraints

- TDD 必須（Red → Green → Refactor）。実装コードより先に必ず失敗するテストを書く。
- カバレッジ 100% ゲート（CLI・`run.mjs`・`gen-*` は既存どおり除外。薄い presentation は `vitest.config.ts` の `coverage.exclude` に追記。除外済み: `DetailPanel.tsx`／`DetailViews.tsx`／`MediaLibraryModal.tsx`。`ApproveClient.tsx` は除外**されておらず** `ApproveClient.test.tsx` で結線挙動を検証する）。
- TS strict / `any` 禁止（外部入力は `unknown` + narrowing）/ `React.FC` 禁止（関数宣言＋`ComponentNameProps`）/ 型専用 import は `import type`。
- boolean prop は `is`/`has`/`should`/`can` 接頭、handler prop は `on` 接頭・関数は `handle` 接頭。
- 全書き込み API は `verifyToken`（`Authorization: Bearer`・`authHeaders`）＋ `articleEditGuard`（#H9）を維持する。
- 純ロジックは `scripts/growth/*.ts` に置き `src/lib/growth/*` から `export *` で再エクスポートする（CLI・`run.mjs`・`gen-*` はカバレッジ除外）。Web 層（API ルート・ApproveClient）は `@/lib/growth/*` エイリアス経由でのみ scripts を消費する（`@/` は scripts を直接指さない）。
- 未確定情報（料金・営業時間・面数・所要分）は **画像内の文字でも**断定しない（spec §5.1）。失敗を沈黙させない（LINE 通知・冪等再開）。
- ブランド配色（deep blue `#11317B`・bright blue `#306EC3`・yellow-green `#F6FF54`）・フラット・**実写禁止**をプロンプトで固定する（正典 `growth-article-style.md` §9）。
- コミットは日本語 Conventional Commits（`feat:`/`test:`/`refactor:`/`docs:` 等）。**push はしない**（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。
- **P2 スコープ限定**: placeholder / 新規挿入 / discriminated target（`parseBodyRegenTarget`）/ エディタツールバー / `PreservedBlockView` ボタン / 競合ガード（UI 保存ブロック・`/draft/edit` 409）/ `data-pending` sanitize / `replaceBodyImagePlaceholder` / `insert-body-image.md` は **P3 で扱うため本計画では実装しない**。`本文画像再生成対象` は `targetSrc`（microCMS URL）のまま。

---

## T1: スタイル体系（新 5 キー＋`auto`・`normalizeBodyImageStyle`・4 スタイルのプロンプトビルダー・alt）

`BodyImageStyle` を新 5 キー（`mascot`/`illust`/`court`/`flow`/`infographic`）へ拡張し、依頼キューが運ぶ `RequestedBodyImageStyle = BodyImageStyle | "auto"` を追加する。旧値（`minimal`→`illust`／`diagram`→`court`）を入口で吸収する `normalizeBodyImageStyle` を新設し、`PROMPT_BUILDERS` を新 5 キーへ差し替える（`minimal`/`diagram` は内部から除去）。`buildBodyImageAlt` を新スタイルに対応させる。`PICKLEBALL_ANCHOR`/`NO_TABLE_TENNIS` は `mascot`/`illust` に付与、`court`/`flow`/`infographic` には付与しない（spec §4.4）。

**Files:**
- Modify: `scripts/growth/body-image.ts`（L12 の型・L36-53 の `PICKLEBALL_GUARD`/`PROMPT_BUILDERS`・L64-67 の `buildBodyImageAlt`。`normalizeBodyImageStyle` と `RequestedBodyImageStyle` を追記）
- Create: `src/lib/growth/bodyImage.ts`（`export * from "../../../scripts/growth/body-image"`。Web 層＝API・ApproveClient が `@/lib/growth/bodyImage` で消費する）
- Test: `scripts/growth/body-image.test.ts`（既存に describe 追記・既存 `minimal`/`diagram` プロンプトテスト L30-44 を新スタイルへ差し替え）

**Interfaces:**
- Consumes: 既存 `ALIEN_CHARACTER`・`BRAND_PALETTE`・`PICKLEBALL_ANCHOR`・`NO_TABLE_TENNIS`（同ファイル L18-34）。
- Produces:
  - `type BodyImageStyle = "mascot" | "illust" | "court" | "flow" | "infographic"`（生成に渡す 5 キー。`auto` を含まない）。
  - `type RequestedBodyImageStyle = BodyImageStyle | "auto"`（依頼キューが運ぶ値。`auto`＝Claude が文脈で解決）。
  - `function normalizeBodyImageStyle(raw: string): BodyImageStyle` — 新 5 キーはそのまま、旧 `minimal`→`illust`・旧 `diagram`→`court`、それ以外（空・未知・`auto`）は既定 `mascot`。`flow`/`infographic` は旧 `diagram` から自動振り分けせず明示指定のみ。
  - `function buildBodyImagePrompt(style: BodyImageStyle, description: string): string`（シグネチャ不変・内部 `PROMPT_BUILDERS` を新 5 キーへ）。
  - `function buildBodyImageAlt(style: BodyImageStyle, description: string): string`（`court`/`flow`/`infographic` は「イメージ図: <説明>」、`mascot`/`illust` は説明そのまま）。

**Steps:**

- [ ] 失敗するテストを書く（`scripts/growth/body-image.test.ts`）。既存 `minimal`/`diagram` の 2 テスト（L30-44）を削除し、新スタイルのテストへ置換。加えて `normalizeBodyImageStyle`・alt・PICKLEBALL 付与対象の describe を追記する:

```typescript
describe("buildBodyImagePrompt (P2 styles)", () => {
  it("illust は雰囲気イラスト・文字なし・競技固定句を含む", () => {
    const p = buildBodyImagePrompt("illust", "夏の練習風景");
    expect(p).toContain("夏の練習風景");
    expect(p).toMatch(/illustration/i);
    expect(p).toMatch(/No text/i);
    expect(p).toContain("#F6FF54");
    expect(p).toMatch(/pickleball/i); // PICKLEBALL_ANCHOR 付与
    expect(p).toMatch(/table tennis/i); // NO_TABLE_TENNIS 付与
  });

  it("court はコート図・textSpec 明示分のみ描く・競技固定句は付けない", () => {
    const p = buildBodyImagePrompt("court", "非揮発ゾーン(キッチン)の位置");
    expect(p).toContain("非揮発ゾーン(キッチン)の位置");
    expect(p).toMatch(/court/i);
    // 文字・数値は明示指定分のみ(捏造防止)。
    expect(p).toMatch(/only the exact text and numbers/i);
    // 概念図には卓球バイアス句を付けない。
    expect(p).not.toMatch(/table tennis/i);
  });

  it("flow は手順・フロー図・明示指定分のみの文字", () => {
    const p = buildBodyImagePrompt("flow", "予約から入場までの流れ");
    expect(p).toContain("予約から入場までの流れ");
    expect(p).toMatch(/flow|step/i);
    expect(p).toMatch(/only the exact text and numbers/i);
    expect(p).not.toMatch(/table tennis/i);
  });

  it("infographic は比較・インフォグラフィック・明示指定分のみの文字", () => {
    const p = buildBodyImagePrompt("infographic", "テニスとの違い");
    expect(p).toContain("テニスとの違い");
    expect(p).toMatch(/infographic/i);
    expect(p).toMatch(/only the exact text and numbers/i);
    expect(p).not.toMatch(/table tennis/i);
  });

  it("mascot は従来どおり参照キャラ・宇宙シーン・競技固定句", () => {
    const p = buildBodyImagePrompt("mascot", "宇宙人がサーブする");
    expect(p).toContain("宇宙人がサーブする");
    expect(p).toMatch(/alien/i);
    expect(p).toMatch(/table tennis/i);
  });
});

describe("normalizeBodyImageStyle", () => {
  it("新5キーはそのまま返す", () => {
    for (const s of ["mascot", "illust", "court", "flow", "infographic"] as const) {
      expect(normalizeBodyImageStyle(s)).toBe(s);
    }
  });
  it("旧 minimal は illust・旧 diagram は court へマップする", () => {
    expect(normalizeBodyImageStyle("minimal")).toBe("illust");
    expect(normalizeBodyImageStyle("diagram")).toBe("court");
  });
  it("空・未知・auto は既定 mascot", () => {
    expect(normalizeBodyImageStyle("")).toBe("mascot");
    expect(normalizeBodyImageStyle("unknown")).toBe("mascot");
    expect(normalizeBodyImageStyle("auto")).toBe("mascot");
  });
});

describe("buildBodyImageAlt (P2 styles)", () => {
  it("court/flow/infographic は『イメージ図』を明示する", () => {
    expect(buildBodyImageAlt("court", " コート図 ")).toBe("イメージ図: コート図");
    expect(buildBodyImageAlt("flow", "手順")).toBe("イメージ図: 手順");
    expect(buildBodyImageAlt("infographic", "比較")).toBe("イメージ図: 比較");
  });
  it("mascot/illust は説明をそのまま返す", () => {
    expect(buildBodyImageAlt("mascot", " 宇宙人 ")).toBe("宇宙人");
    expect(buildBodyImageAlt("illust", "練習風景")).toBe("練習風景");
  });
});
```

  - 既存 `import { ... } from "./body-image";`（L4-18）に `normalizeBodyImageStyle` を足す。
- [ ] 実行して失敗確認: `npx vitest run scripts/growth/body-image.test.ts` → `normalizeBodyImageStyle` 未定義・新スタイルのプロンプト不一致で RED。
- [ ] 最小実装（`scripts/growth/body-image.ts`）:
  - L12 の型を差し替え、`RequestedBodyImageStyle` を追記:

```typescript
/** 本文画像の生成に渡すスタイル(auto は含まない。生成時は必ず具体スタイルへ解決済み)。 */
export type BodyImageStyle = "mascot" | "illust" | "court" | "flow" | "infographic";

/** 依頼キューが運ぶスタイル値。auto は「Claude が文脈で選ぶ」の意(生成前に具体スタイルへ解決)。 */
export type RequestedBodyImageStyle = BodyImageStyle | "auto";
```

  - L36-38 の `PICKLEBALL_GUARD` コメント/定義を「`mascot`/`illust`(スポーツシーンを描き得る)に付与。`court`/`flow`/`infographic`(概念図)には付与しない」へ更新（定義自体は流用）。
  - L40-53 の `PROMPT_BUILDERS` を新 5 キーへ差し替え。`minimal`/`diagram` は削除:

```typescript
// court/flow/infographic は図中に文字・数値を焼き込むが、捏造(#58)防止のため
// **description に明示された文字・数値だけ**を描く(それ以外の数値は描かせない)。
const TEXT_ONLY_AS_SPECIFIED =
  "Render only the exact text and numbers explicitly given in the description; " +
  "do not invent any other numbers, prices, times, hours, or labels. " +
  "Keep any text short, legible, and correctly spelled.";

const PROMPT_BUILDERS: Record<BodyImageStyle, (description: string) => string> = {
  mascot: (d) =>
    `Using ${ALIEN_CHARACTER}, create a flat illustration of this same alien: ${d}. ` +
    `Cosmic deep-space scene, ${BRAND_PALETTE}. ${PICKLEBALL_GUARD} ` +
    `Keep the alien's face identical to the reference. Clean premium flat illustration. No text, no logos.`,
  illust: (d) =>
    `Atmospheric flat vector illustration of: ${d}. ` +
    `Premium editorial mood with generous negative space, ${BRAND_PALETTE} on a clean background. ${PICKLEBALL_GUARD} ` +
    `No text, no labels, no logos.`,
  court: (d) =>
    `Clean top-down pickleball court diagram illustrating: ${d}. ` +
    `Flat schematic style, ${BRAND_PALETTE}. ${TEXT_ONLY_AS_SPECIFIED} ` +
    `Illustrative and conceptual, not a precise engineering drawing.`,
  flow: (d) =>
    `Clean step-by-step flow diagram illustrating: ${d}. ` +
    `Left-to-right or top-to-bottom flat schematic with simple arrows, ${BRAND_PALETTE}. ${TEXT_ONLY_AS_SPECIFIED} ` +
    `Illustrative and conceptual, not a precise engineering drawing.`,
  infographic: (d) =>
    `Clean comparison infographic illustrating: ${d}. ` +
    `Flat schematic panels or side-by-side layout, ${BRAND_PALETTE}. ${TEXT_ONLY_AS_SPECIFIED} ` +
    `Illustrative and conceptual, not a precise engineering drawing.`,
};
```

  - `buildBodyImageAlt`（L64-67）を新スタイルへ:

```typescript
/**
 * alt テキスト。図解系(court/flow/infographic)は AI 生成のため「イメージ図」と明示し、
 * 正確な事実として読まれないようにする(#58/捏造リスク対策)。mascot/illust は説明をそのまま。
 */
export function buildBodyImageAlt(style: BodyImageStyle, description: string): string {
  const d = description.trim();
  const isDiagram = style === "court" || style === "flow" || style === "infographic";
  return isDiagram ? `イメージ図: ${d}` : d;
}
```

  - ファイル末尾（`bodyImageFileStem` の後）に `normalizeBodyImageStyle` を追記:

```typescript
/**
 * 受理したスタイル文字列を新 5 キーへ正規化する(入口正規化・後方互換)。
 * 旧値 minimal→illust・diagram→court にマップし、空・未知・auto は既定 mascot に落とす。
 * flow/infographic は旧 diagram から自動振り分けせず、明示指定のときだけ選ばれる(誤変換防止)。
 */
export function normalizeBodyImageStyle(raw: string): BodyImageStyle {
  switch (raw) {
    case "mascot":
    case "illust":
    case "court":
    case "flow":
    case "infographic":
      return raw;
    case "minimal":
      return "illust";
    case "diagram":
      return "court";
    default:
      return "mascot";
  }
}
```

- [ ] `src/lib/growth/bodyImage.ts` を新設（Web 層の消費口）:

```typescript
/**
 * 本文画像(#62/#156)のスタイル純ロジックを Web 層へ再エクスポートする。
 * 実体は scripts/growth/body-image.ts(PC・Web 双方が同じロジックを使う)。
 */
export * from "../../../scripts/growth/body-image";
```

- [ ] 実行して成功確認: `npx vitest run scripts/growth/body-image.test.ts` → 全 GREEN。
- [ ] コミット: `git add scripts/growth/body-image.ts src/lib/growth/bodyImage.ts scripts/growth/body-image.test.ts` →
  `feat(growth): 本文画像スタイルを6択(mascot/illust/court/flow/infographic)へ拡張し normalizeBodyImageStyle を追加`

---

## T2: 依頼キューの style/textSpec 対応（Props ビルダー・Row・View）

`buildBodyRegenRequestProps` に `style`・`textSpec` を、`buildBodyRegenDoneProps` に**クリア書き込み**（スタイル→`おまかせ`・文字指定→`[]`）を追加する。`buildBodyRegenFailProps` は変更しない（style/textSpec を残して再依頼できる）。`BodyRegenRow`/`bodyRegenRowFromPage`・`BodyRegenView`/`bodyRegenViewOf` に `requestedStyle`/`textSpec` を追加する。表示値（`おまかせ`/5 スタイル）⇄ 内部キーの写像を純関数化する。

**Files:**
- Modify: `scripts/growth/body-image-regen.ts`（L19-29 `BODY_REGEN_PROPS` に 2 プロパティ追加 / L52-64 `buildBodyRegenRequestProps` / L73-80 `buildBodyRegenDoneProps` / L116-147 `BodyRegenRow`+`bodyRegenRowFromPage` / L150-165 `BodyRegenView`+`bodyRegenViewOf`）
- Test: `scripts/growth/body-image-regen.test.ts`（既存に describe 追記／各ビルダーの既存テストを拡張）
- （再エクスポートは `src/lib/growth/bodyImageRegen.ts` が `export *` 済みのため変更不要）

**Interfaces:**
- Consumes: `normalizeBodyImageStyle`・`type RequestedBodyImageStyle`（`./body-image`・T1）・既存 `chunkRichText`（`./notion`）。
- Produces:
  - `BODY_REGEN_PROPS.style = "本文画像スタイル"`・`BODY_REGEN_PROPS.textSpec = "本文画像文字指定"`。
  - `const STYLE_DISPLAY_LABELS: Record<RequestedBodyImageStyle, string>`（`auto`→`おまかせ`・他は同名）と `function styleDisplayLabel(style: RequestedBodyImageStyle): string` / `function requestedStyleFromLabel(label: string): RequestedBodyImageStyle`（`おまかせ`→`auto`・新 5 キーはそのまま・旧値/未知/空→`auto`）。
  - `buildBodyRegenRequestProps(instruction: string, targetSrc: string, style: RequestedBodyImageStyle, textSpec: string, nowIso: string): Record<string, unknown>`。
  - `buildBodyRegenDoneProps()` — 既存 3 クリアに加え `本文画像スタイル`＝`{ select: { name: "おまかせ" } }`・`本文画像文字指定`＝`{ rich_text: [] }`。
  - `BodyRegenRow` に `requestedStyle: RequestedBodyImageStyle`・`textSpec: string` 追加。
  - `BodyRegenView` に `requestedStyle: RequestedBodyImageStyle`・`textSpec: string` 追加。

**Steps:**

- [ ] 失敗するテストを書く（`scripts/growth/body-image-regen.test.ts` に describe 追記）:

```typescript
describe("style/textSpec を依頼キューへ通す(P2)", () => {
  const SRC = "https://images.microcms-assets.io/assets/a/1.png";

  it("buildBodyRegenRequestProps はスタイル(表示値)と文字指定を書き込む", () => {
    const props = buildBodyRegenRequestProps("図解で", SRC, "court", "13.41m x 6.10m", "2026-07-04T00:00:00.000Z");
    expect(props["本文画像再生成ステータス"]).toEqual({ select: { name: "依頼中" } });
    expect(props["本文画像再生成対象"]).toEqual({ rich_text: [{ text: { content: SRC } }] });
    expect(props["本文画像スタイル"]).toEqual({ select: { name: "court" } });
    expect(props["本文画像文字指定"]).toEqual({ rich_text: [{ text: { content: "13.41m x 6.10m" } }] });
  });

  it("style=auto は表示値『おまかせ』・textSpec 空は rich_text=[]", () => {
    const props = buildBodyRegenRequestProps("", SRC, "auto", "", "2026-07-04T00:00:00.000Z");
    expect(props["本文画像スタイル"]).toEqual({ select: { name: "おまかせ" } });
    expect(props["本文画像文字指定"]).toEqual({ rich_text: [] });
    expect(props["本文画像再生成指示"]).toEqual({ rich_text: [] });
  });

  it("buildBodyRegenDoneProps はスタイルをおまかせ・文字指定を空へクリアする", () => {
    const props = buildBodyRegenDoneProps();
    expect(props["本文画像再生成ステータス"]).toEqual({ select: { name: "なし" } });
    expect(props["本文画像再生成指示"]).toEqual({ rich_text: [] });
    expect(props["本文画像再生成対象"]).toEqual({ rich_text: [] });
    expect(props["本文画像スタイル"]).toEqual({ select: { name: "おまかせ" } });
    expect(props["本文画像文字指定"]).toEqual({ rich_text: [] });
  });

  it("buildBodyRegenFailProps はスタイル・文字指定を残す(status のみ変更)", () => {
    const props = buildBodyRegenFailProps();
    expect(props).toEqual({ "本文画像再生成ステータス": { select: { name: "失敗" } } });
  });

  it("requestedStyleFromLabel: おまかせ→auto・新5キーはそのまま・未知→auto", () => {
    expect(requestedStyleFromLabel("おまかせ")).toBe("auto");
    expect(requestedStyleFromLabel("court")).toBe("court");
    expect(requestedStyleFromLabel("mascot")).toBe("mascot");
    expect(requestedStyleFromLabel("")).toBe("auto");
    expect(requestedStyleFromLabel("diagram")).toBe("auto");
  });

  it("bodyRegenRowFromPage / bodyRegenViewOf は requestedStyle と textSpec を読む", () => {
    const page = {
      id: "p1",
      url: "",
      properties: {
        "本文画像スタイル": { select: { name: "flow" } },
        "本文画像文字指定": { rich_text: [{ plain_text: "STEP1 予約" }] },
        "本文画像再生成対象": { rich_text: [{ plain_text: SRC }] },
        "本文画像再生成ステータス": { select: { name: "依頼中" } },
      },
    };
    const row = bodyRegenRowFromPage(page);
    expect(row.requestedStyle).toBe("flow");
    expect(row.textSpec).toBe("STEP1 予約");
    const view = bodyRegenViewOf(page);
    expect(view.requestedStyle).toBe("flow");
    expect(view.textSpec).toBe("STEP1 予約");
  });

  it("スタイル未設定(欠落)の行は requestedStyle=auto として読む", () => {
    const page = { id: "p2", url: "", properties: {} };
    expect(bodyRegenRowFromPage(page).requestedStyle).toBe("auto");
    expect(bodyRegenRowFromPage(page).textSpec).toBe("");
  });
});
```

  - 既存 import に `requestedStyleFromLabel`（新規）を足す。既存の `buildBodyRegenRequestProps` を使うテスト（P1 時点で `instruction, targetSrc, nowIso` の 3 引数）があれば **5 引数へ更新**する（`buildBodyRegenRequestProps("...", SRC, "auto", "", ISO)`）。
- [ ] 実行して失敗確認: `npx vitest run scripts/growth/body-image-regen.test.ts` → シグネチャ不一致・`requestedStyleFromLabel` 未定義で RED。
- [ ] 最小実装（`scripts/growth/body-image-regen.ts`）:
  - L14-16 の import に T1 の型を足す（`normalizeBodyImageStyle` は本ファイルでは使わないため import **しない** — 未使用 import で lint が落ちる。T3/T4 が各自の消費先で import する）:

```typescript
import type { RequestedBodyImageStyle } from "./body-image";
```

  - `BODY_REGEN_PROPS`（L20-29）へ 2 プロパティ追記:

```typescript
  /** 本文画像スタイル(select: おまかせ/mascot/illust/court/flow/infographic)。おまかせ=auto。 */
  style: "本文画像スタイル",
  /** 図に焼き込む文字・数値のリスト(textSpec・自由入力)。 */
  textSpec: "本文画像文字指定",
```

  - 表示値⇄内部キーの写像を `BODY_REGEN_PROPS` の直後に追加:

```typescript
/** select の表示ラベル(auto→おまかせ・他は同名)。 */
export const STYLE_DISPLAY_LABELS: Record<RequestedBodyImageStyle, string> = {
  auto: "おまかせ",
  mascot: "mascot",
  illust: "illust",
  court: "court",
  flow: "flow",
  infographic: "infographic",
};

/** 依頼スタイル → Notion select 表示ラベル。 */
export function styleDisplayLabel(style: RequestedBodyImageStyle): string {
  return STYLE_DISPLAY_LABELS[style];
}

/** Notion select 表示ラベル → 依頼スタイル。おまかせ/空/未知は auto、新5キーはそのまま。 */
export function requestedStyleFromLabel(label: string): RequestedBodyImageStyle {
  if (label === "おまかせ" || label === "" || label === "auto") return "auto";
  const keys: RequestedBodyImageStyle[] = ["mascot", "illust", "court", "flow", "infographic"];
  return keys.includes(label as RequestedBodyImageStyle) ? (label as RequestedBodyImageStyle) : "auto";
}
```

  - `buildBodyRegenRequestProps`（L52-64）を 5 引数へ:

```typescript
export function buildBodyRegenRequestProps(
  instruction: string,
  targetSrc: string,
  style: RequestedBodyImageStyle,
  textSpec: string,
  nowIso: string
): Record<string, unknown> {
  const requested: BodyRegenStatus = "依頼中";
  return {
    [BODY_REGEN_PROPS.instruction]: { rich_text: instruction ? chunkRichText(instruction) : [] },
    [BODY_REGEN_PROPS.targetSrc]: { rich_text: chunkRichText(targetSrc) },
    [BODY_REGEN_PROPS.style]: { select: { name: styleDisplayLabel(style) } },
    [BODY_REGEN_PROPS.textSpec]: { rich_text: textSpec ? chunkRichText(textSpec) : [] },
    [BODY_REGEN_PROPS.status]: { select: { name: requested } },
    [BODY_REGEN_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}
```

  - `buildBodyRegenDoneProps`（L73-80）へクリア 2 行追加:

```typescript
export function buildBodyRegenDoneProps(): Record<string, unknown> {
  const cleared: BodyRegenStatus = "なし";
  return {
    [BODY_REGEN_PROPS.status]: { select: { name: cleared } },
    [BODY_REGEN_PROPS.instruction]: { rich_text: [] },
    [BODY_REGEN_PROPS.targetSrc]: { rich_text: [] },
    [BODY_REGEN_PROPS.style]: { select: { name: STYLE_DISPLAY_LABELS.auto } },
    [BODY_REGEN_PROPS.textSpec]: { rich_text: [] },
  };
}
```

  - `BodyRegenRow`（L116-129）へ 2 フィールド追加:

```typescript
  /** 依頼スタイル(auto=おまかせ)。PC ループが具体スタイルへ解決する。 */
  requestedStyle: RequestedBodyImageStyle;
  /** 図に焼き込む文字・数値のリスト(textSpec)。空なら文字なし。 */
  textSpec: string;
```

  - `bodyRegenRowFromPage`（L132-147）の return へ 2 行追加:

```typescript
    requestedStyle: requestedStyleFromLabel(readSelectName(page, BODY_REGEN_PROPS.style)),
    textSpec: readRichTextPlain(page, BODY_REGEN_PROPS.textSpec),
```

  - `BodyRegenView`（L150-156）へ 2 フィールド追加し、`bodyRegenViewOf`（L162-165）で写す:

```typescript
export interface BodyRegenView {
  status: BodyRegenStatus;
  targetSrc: string;
  requestedStyle: RequestedBodyImageStyle;
  textSpec: string;
  requestedAtMs?: number | null;
}

export function bodyRegenViewOf(page: NotionPage): BodyRegenView {
  const row = bodyRegenRowFromPage(page);
  return {
    status: row.status,
    targetSrc: row.targetSrc,
    requestedStyle: row.requestedStyle,
    textSpec: row.textSpec,
    requestedAtMs: row.requestedAtMs,
  };
}
```

  - `normalizeBodyImageStyle` は本ファイルでは使わない（T3 が `@/lib/growth/bodyImage` から、T4 が `./body-image` から各自 import する）。
- [ ] 実行して成功確認: `npx vitest run scripts/growth/body-image-regen.test.ts` → 全 GREEN。
- [ ] コミット: `git add scripts/growth/body-image-regen.ts scripts/growth/body-image-regen.test.ts` →
  `feat(growth): 本文画像再生成キューに style/textSpec を通す(Props・Row・View 拡張)`

---

## T3: `/api/growth/body-image/regen` に style/textSpec を追加

既存 POST の body に `style?`（表示値/内部キーを enum 検証・省略時 `auto`）と `textSpec?`（1000 字上限・超過 400）を追加する。既存の検証・409・`articleEditGuard`・`instruction` 500 字上限・`targetSrc` の microCMS 検証は維持する。`placeholderId` は入れない（P3）。

**Files:**
- Modify: `src/app/api/growth/body-image/regen/route.ts`（L30-31 定数 / L54-63 の検証 / L84-88 の `buildBodyRegenRequestProps` 呼び出し）
- Test: `src/app/api/growth/body-image/regen/route.test.ts`（既存に style/textSpec のケース追記・既存の書き込み検証を 5 引数版へ更新）

**Interfaces:**
- Consumes: `buildBodyRegenRequestProps`（拡張版・`@/lib/growth/bodyImageRegen`）・`requestedStyleFromLabel`／`STYLE_DISPLAY_LABELS`（`@/lib/growth/bodyImageRegen`・T2）・`normalizeBodyImageStyle`（`@/lib/growth/bodyImage`・T1。ここでは enum 妥当性判定に使う）。既存 `isMicrocmsAssetUrl`（`@/lib/growth/media`）。
- Produces: `POST` の body 契約 `{ pageId, targetSrc, style?, textSpec?, instruction? }`。`style` は表示値（`おまかせ`）または内部キー（5 種）を受理し内部で `RequestedBodyImageStyle` へ正規化。不正 style は 400。

**Steps:**

- [ ] 失敗するテストを書く（`src/app/api/growth/body-image/regen/route.test.ts` に追記。既存の書き込み検証テスト L61-72 を「スタイル/文字指定も書き込む」ケースへ拡張）:

```typescript
  it("style(表示値おまかせ)・textSpec を書き込む", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "g-abc" }));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(
      postReq(null, { pageId: PAGE_ID, targetSrc: SRC, style: "court", textSpec: "13.41m x 6.10m", instruction: "図解で" })
    );
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, { select?: { name: string }; rich_text?: unknown }>;
    expect(p["本文画像スタイル"]).toEqual({ select: { name: "court" } });
    expect(p["本文画像文字指定"].rich_text).toEqual([{ text: { content: "13.41m x 6.10m" } }]);
  });

  it("style 省略時は auto(おまかせ)・textSpec 省略は空", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "g-abc" }));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: SRC }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, { select?: { name: string }; rich_text?: unknown }>;
    expect(p["本文画像スタイル"]).toEqual({ select: { name: "おまかせ" } });
    expect(p["本文画像文字指定"].rich_text).toEqual([]);
  });

  it("不正な style は 400(書き込まない)", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: SRC, style: "diagram" }));
    expect(res.status).toBe(400);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("textSpec が1000字超は 400", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: SRC, textSpec: "あ".repeat(1001) }));
    expect(res.status).toBe(400);
    expect(getPage).not.toHaveBeenCalled();
  });
```

  - 既存 L61-72 の書き込みテスト内の `updatePageProps` 検証は維持（`style` 省略なので `おまかせ` になることは上の新ケースで担保。既存テストは instruction/targetSrc/status のみ検証しているため変更不要）。
- [ ] 実行して失敗確認: `npx vitest run src/app/api/growth/body-image/regen/route.test.ts` → style/textSpec 未対応で新ケースが RED。
- [ ] 最小実装（`src/app/api/growth/body-image/regen/route.ts`）:
  - import を追加:

```typescript
import { normalizeBodyImageStyle, type RequestedBodyImageStyle } from "@/lib/growth/bodyImage";
```

  - `BODY_REGEN_BUSY_STATUSES, buildBodyRegenRequestProps, bodyRegenRowFromPage` の import（L19-23）へ `requestedStyleFromLabel` を追加。
  - L31 の直後に定数追加:

```typescript
/** 図に焼き込む文字・数値(textSpec)の上限長。巨大ペイロード防止。 */
const MAX_TEXTSPEC_LEN = 1000;
/** style として受理する表示値・内部キー(discriminated ではなく enum)。 */
const ALLOWED_STYLE_INPUTS = ["おまかせ", "auto", "mascot", "illust", "court", "flow", "infographic"] as const;
```

  - instruction 検証（L59-63）の後ろに style/textSpec 検証を追加:

```typescript
  const rawStyle = (body as { style?: unknown })?.style;
  let requestedStyle: RequestedBodyImageStyle = "auto";
  if (rawStyle !== undefined) {
    if (typeof rawStyle !== "string" || !(ALLOWED_STYLE_INPUTS as readonly string[]).includes(rawStyle)) {
      return badRequest("不正なスタイル指定です。");
    }
    // 表示値『おまかせ』/auto は auto、内部キーはそのまま。旧値は enum に無いため 400 で弾く。
    requestedStyle = rawStyle === "おまかせ" || rawStyle === "auto" ? "auto" : normalizeBodyImageStyle(rawStyle);
  }
  const rawTextSpec = (body as { textSpec?: unknown })?.textSpec;
  const textSpec = typeof rawTextSpec === "string" ? rawTextSpec.trim() : "";
  if (textSpec.length > MAX_TEXTSPEC_LEN) {
    return badRequest(`文字指定は${MAX_TEXTSPEC_LEN}文字以内にしてください。`);
  }
```

  - `buildBodyRegenRequestProps` 呼び出し（L85-88）を 5 引数へ:

```typescript
    await updatePageProps(
      pageId,
      buildBodyRegenRequestProps(instruction, rawTargetSrc, requestedStyle, textSpec, new Date().toISOString()),
      options
    );
```

  - 冒頭 doc コメント（L1-12）に「`style?`（表示値/内部キー・省略時 auto）・`textSpec?`（1000 字上限）を受理し依頼キューへ通す（P2）」を 1 行追記。
  - 注: `requestedStyleFromLabel` の import は enum 検証で `normalizeBodyImageStyle`＋直接判定を使うため**不要**なら import しない（未使用 import を作らない。上の実装は `normalizeBodyImageStyle` のみ使用）。
- [ ] 実行して成功確認: `npx vitest run src/app/api/growth/body-image/regen/route.test.ts` → 全 GREEN。
- [ ] コミット: `git add src/app/api/growth/body-image/regen/route.ts src/app/api/growth/body-image/regen/route.test.ts` →
  `feat(growth): body-image/regen API に style/textSpec 検証を追加(1000字上限)`

---

## T4: PC ループ（`next` 出力に style/textSpec・プロンプト手順・文字検証ループ・gen STYLES）

`body-image-regen-cli.ts` の `next` JSON に `style`（解決前の要求値・おまかせ含む）・`textSpec` を追加する。`regen-body-image.md` の手順 3 を「style 指定があれば従う・おまかせ/空なら文脈選択・既定 mascot」へ変更し、§5.3 の文字検証ループ（目視照合→最大 3 回→3 回失敗は文字なし版納品＋LINE 通知）を追記する。`gen-body-image.ts` の `STYLES` を新 5 キー＋旧値受理（`normalizeBodyImageStyle`）へ拡張する。CLI・`gen-*` はカバレッジ除外だが、正規化などの純ロジックは T1/T2 で `body-image.ts`/`body-image-regen.ts` 側にテスト済み。

**Files:**
- Modify: `scripts/growth/body-image-regen-cli.ts`（L166-174 の `next` 出力 JSON）
- Modify: `scripts/growth/prompts/regen-body-image.md`（手順 3・4 と §5.3 検証ループ追記）
- Modify: `scripts/growth/gen-body-image.ts`（L24 `STYLES` / L35-38 検証 / L46 プロンプト組み立て）

**Interfaces:**
- Consumes: `bodyRegenRowFromPage`（拡張版 `row.requestedStyle`/`row.textSpec`）・`normalizeBodyImageStyle`（`./body-image`）。
- Produces: `next` 出力 JSON `{ pageId, title, instruction, contentId, targetSrc, style, textSpec }`（`style` は `RequestedBodyImageStyle` の文字列・`おまかせ` は `auto`）。`gen-body-image` の `--style` は新 5 キー＋旧値を受理し `normalizeBodyImageStyle` で正規化。

**Steps:**

- [ ] `body-image-regen-cli.ts` の `next`（L166-174）出力へ style/textSpec を足す:

```typescript
  await write(row.id, buildBodyRegenProcessingProps(), options);
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      instruction: row.instruction,
      contentId: row.contentId,
      targetSrc: row.targetSrc,
      style: row.requestedStyle,
      textSpec: row.textSpec,
    })}\n`
  );
```

- [ ] `gen-body-image.ts` を新スタイル＋旧値受理へ:
  - L18 の import に `normalizeBodyImageStyle` を追加:

```typescript
import { buildBodyImagePrompt, normalizeBodyImageStyle, type BodyImageStyle } from "./body-image";
```

  - L24 の `STYLES` を新 5 キーへ、旧値も `--style` で受理して正規化:

```typescript
// 生成に使う新5スタイル。旧値(minimal/diagram)も受理し normalizeBodyImageStyle でマップする。
const STYLES: readonly BodyImageStyle[] = ["mascot", "illust", "court", "flow", "infographic"];
const ACCEPTED_STYLE_INPUTS: readonly string[] = [...STYLES, "minimal", "diagram"];
```

  - L35-46 の検証・プロンプト組み立てを正規化経由へ:

```typescript
  const rawStyle = arg("--style");
  if (!rawStyle || !ACCEPTED_STYLE_INPUTS.includes(rawStyle)) {
    throw new Error(`--style は ${STYLES.join("|")}(旧値 minimal/diagram も可)のいずれかを指定してください。`);
  }
  const style = normalizeBodyImageStyle(rawStyle);
  ...
  const prompt = buildBodyImagePrompt(style, description);
```

  - L2-4 の usage コメントと L53 の参照画像コメント（`minimal/diagram は参照なし` → `illust/court/flow/infographic は参照なし`）を新スタイルへ更新。`refPath: style === "mascot" ? DEFAULT_REF : undefined`（L54）は不変。
- [ ] `regen-body-image.md` の手順 3・4 を新スタイルへ差し替え、`next` が返す `style`/`textSpec` を使うように更新:

```markdown
2. **次の依頼を取得**: `npm run growth:body-image-regen -- next` を実行する。標準出力の JSON を読む。
   - `{}` だけが返ったら、**依頼はありません。ここで終了**する（何もしない）。
   - `{"pageId","title","instruction","contentId","targetSrc","style","textSpec"}` が返ったら、その行は既に「処理中」にロック済み。
     - `instruction` = ユーザーの再生成指示（**空ならおまかせ**）。`title` = 記事タイトル。
     - `targetSrc` = 差し替える**対象の本文画像URL**（このURLの画像を作り直す。これ自体は変更しない）。
     - `style` = 依頼スタイル（`auto`/`mascot`/`illust`/`court`/`flow`/`infographic`）。`auto`＝おまかせ。
     - `textSpec` = 図に焼き込む**文字・数値のリスト**（空なら文字なし）。

3. **スタイル(style)と説明(description)を決める**:
   - `style` が具体スタイル（`mascot`/`illust`/`court`/`flow`/`infographic`）ならそれに従う。
   - `style` が `auto`（おまかせ）または空なら、`instruction`・記事タイトル・内容から自然なスタイルを1つ選ぶ（**指示が無ければ `mascot` を既定とする**）。
     - `mascot`=宇宙人が登場 / `illust`=雰囲気イラスト / `court`=コート図・ルール図解 /
       `flow`=手順・フロー図 / `infographic`=比較・インフォグラフィック。
   - `description` は**1行の日本語**で、何を描くかを簡潔に書く。
   - **文体・配色の正典 `docs/operations/growth-article-style.md` §9** に従う。実写禁止。図解系（court/flow/infographic）は「イメージ図」前提。

4. **生成する（文字入りは検証ループ）**:
   `npm run growth:gen-body-image -- --style <mascot|illust|court|flow|infographic> --description "<説明>" --out .growth-tmp/regen-bodyimg.png`
   を実行する（mascot のときだけ参照画像でキャラを保持）。

   **`textSpec` が空でない場合（court/flow/infographic 等で文字・数値を焼き込む場合）は、次の検証ループを回す:**
   1. `textSpec` の各文字列を `--description` に自然に織り込み、その文字・数値が図に入るように生成する。
      **描いてよい文字・数値は「`textSpec` に明示された値」「記事本文に既にある値」「ピックルボール公式規格（コート寸法等の公知の事実）」のみ**。営業時間・料金・面数・所要分などの未確定情報は**画像内でも断定しない**（絶対禁止の画像への拡張）。
   2. 生成画像を**自分の目で確認し**、`textSpec` の各文字列が**崩れ・誤字なく**描かれているか照合する。
   3. NG（文字化け・誤記・欠落）なら**再生成する（最大3回まで）**。
   4. **3回失敗したら、`--description` から文字指定を外して「文字なし版」を生成して納品**し、`fail` ではなく `done` で差し替えたうえで、`npm run growth:notify-line -- "<記事タイトル>: 文字焼き込みに3回失敗したため文字なしで納品しました。文字は本文テキストで補ってください。"` で**LINE 報告する（沈黙させない）**。
```

  - `## 禁止` 節の下に 1 行追記: 「- 画像内の文字・数値で**未確定情報を断定しない**（`textSpec`・本文・公式規格の値のみ描く）。」
- [ ] 実行確認（純ロジックは T1/T2 で緑・CLI/gen はカバレッジ除外のため単体テストなし）: `npx vitest run scripts/growth/body-image.test.ts scripts/growth/body-image-regen.test.ts` → 引き続き全 GREEN（CLI/gen の import シグネチャ整合は次タスク T7 の `tsc --noEmit` で最終確認）。
- [ ] コミット: `git add scripts/growth/body-image-regen-cli.ts scripts/growth/gen-body-image.ts scripts/growth/prompts/regen-body-image.md` →
  `feat(growth): PCループに style/textSpec を通し、文字検証ループ(最大3回→文字なし納品+通知)を追記`

---

## T5: 生成モーダル UI（スタイル 6 択＋自由指示＋文字指定）と ApproveClient 結線

生成モーダル `BodyImageRegenModal`（共通コンポーネント。P3 でエディタからも使う前提の設計だが、P2 では画像タブ「AIで再生成」からのみ起動）を新設する。スタイル 6 択チップ＋自由指示（500 字）＋文字・数値入力欄（textSpec・1000 字）＋期待値表示。`requestBodyImageRegen` を `{ style, textSpec, instruction }` を送る形へ拡張し、ApproveClient の `onRegenBodyImage` をモーダル経由に変更する（P1 では即時依頼だった）。アイキャッチ側の再生成 UX は変更しない。純ロジック（スタイルチップ定義・送信 payload 組み立て）は純関数へ切り出してテストする。

**Files:**
- Create: `src/app/growth/approve/bodyRegenRequest.ts`（純ロジック: スタイルチップ一覧・送信 payload 正規化）
- Test: `src/app/growth/approve/bodyRegenRequest.test.ts`
- Create: `src/app/growth/approve/BodyImageRegenModal.tsx`（生成モーダル・presentation。`coverage.exclude` へ追記）
- Modify: `src/app/growth/approve/ApproveClient.tsx`（`requestBodyImageRegen` 拡張＝L828-843 / `onRegenBodyImage` をモーダル起点へ＝L920-922 / モーダル状態＋描画追加＝L193 近傍・L1254 の後ろ / import 追加）
- Modify: `src/app/growth/approve/ApproveClient.test.tsx`（P1 の「AIで再生成」直 POST テスト L4563-4588 をモーダル経由へ更新）
- Modify: `vitest.config.ts`（`coverage.exclude` に `BodyImageRegenModal.tsx` を追記）

**Interfaces:**
- Consumes: `styleDisplayLabel`/`type RequestedBodyImageStyle`（`@/lib/growth/bodyImageRegen`／`@/lib/growth/bodyImage`・T1/T2）。
- Produces:
  - `interface BodyImageRegenInput { style: RequestedBodyImageStyle; instruction: string; textSpec: string }`。
  - `const BODY_IMAGE_STYLE_CHIPS: readonly { key: RequestedBodyImageStyle; label: string }[]`（6 択: おまかせ/宇宙人マスコット/雰囲気イラスト/コート図/フロー図/インフォグラフィック）。
  - `function buildBodyRegenBody(pageId: string, targetSrc: string, input: BodyImageRegenInput): Record<string, unknown>` — API へ送る body（`{ pageId, targetSrc, style, textSpec, instruction }`。style は内部キー/`auto` の文字列で送る＝API が受理する enum）。
  - `interface BodyImageRegenModalProps { heading: string; onClose: () => void; onSubmit: (input: BodyImageRegenInput) => void }`。
  - `ApproveClient` 内 `requestBodyImageRegen(pageId: string, targetSrc: string, input: BodyImageRegenInput): Promise<void>`（拡張版）。

**Steps:**

- [ ] 失敗するテストを書く（`src/app/growth/approve/bodyRegenRequest.test.ts`）:

```typescript
import { describe, expect, it } from "vitest";

import { BODY_IMAGE_STYLE_CHIPS, buildBodyRegenBody } from "./bodyRegenRequest";

const SRC = "https://images.microcms-assets.io/assets/a/1.png";

describe("BODY_IMAGE_STYLE_CHIPS", () => {
  it("先頭はおまかせ(auto)で6択ある", () => {
    expect(BODY_IMAGE_STYLE_CHIPS).toHaveLength(6);
    expect(BODY_IMAGE_STYLE_CHIPS[0].key).toBe("auto");
    expect(BODY_IMAGE_STYLE_CHIPS.map((c) => c.key)).toEqual([
      "auto",
      "mascot",
      "illust",
      "court",
      "flow",
      "infographic",
    ]);
  });
});

describe("buildBodyRegenBody", () => {
  it("style/textSpec/instruction を含む送信 body を組む", () => {
    const body = buildBodyRegenBody("i1", SRC, {
      style: "court",
      instruction: "コート図で",
      textSpec: "13.41m x 6.10m",
    });
    expect(body).toEqual({
      pageId: "i1",
      targetSrc: SRC,
      style: "court",
      textSpec: "13.41m x 6.10m",
      instruction: "コート図で",
    });
  });

  it("auto/空文字もそのまま送る(API 側で解釈)", () => {
    const body = buildBodyRegenBody("i1", SRC, { style: "auto", instruction: "", textSpec: "" });
    expect(body).toEqual({ pageId: "i1", targetSrc: SRC, style: "auto", textSpec: "", instruction: "" });
  });
});
```

- [ ] 実行して失敗確認: `npx vitest run src/app/growth/approve/bodyRegenRequest.test.ts` → モジュール未作成で RED。
- [ ] 最小実装（`src/app/growth/approve/bodyRegenRequest.ts`）:

```typescript
/**
 * 本文画像 AI 再生成の依頼入力(スタイル・自由指示・文字指定)の純ロジック(#156/P2)。
 * 生成モーダル(BodyImageRegenModal)と ApproveClient が共有する。チップ定義と送信 body 組み立てのみを
 * 純関数化し、UI(モーダル)側は薄い presentation にする(テストは純ロジックに寄せる)。
 */
import type { RequestedBodyImageStyle } from "@/lib/growth/bodyImage";

/** 生成モーダルの依頼入力。style=auto は「おまかせ(Claude が文脈で選ぶ)」。 */
export interface BodyImageRegenInput {
  style: RequestedBodyImageStyle;
  /** 自由指示(最大500字・UI 側で制限)。 */
  instruction: string;
  /** 図に焼き込む文字・数値(最大1000字・UI 側で制限)。 */
  textSpec: string;
}

/** スタイル6択チップ(先頭=おまかせ)。日本語ラベルは承認画面表示用。 */
export const BODY_IMAGE_STYLE_CHIPS: readonly { key: RequestedBodyImageStyle; label: string }[] = [
  { key: "auto", label: "おまかせ" },
  { key: "mascot", label: "宇宙人マスコット" },
  { key: "illust", label: "雰囲気イラスト" },
  { key: "court", label: "コート図" },
  { key: "flow", label: "フロー図" },
  { key: "infographic", label: "インフォグラフィック" },
];

/** API(/api/growth/body-image/regen)へ送る body を組む。style は内部キー/auto の文字列で送る。 */
export function buildBodyRegenBody(
  pageId: string,
  targetSrc: string,
  input: BodyImageRegenInput
): Record<string, unknown> {
  return {
    pageId,
    targetSrc,
    style: input.style,
    textSpec: input.textSpec,
    instruction: input.instruction,
  };
}
```

- [ ] 実行して成功確認: `npx vitest run src/app/growth/approve/bodyRegenRequest.test.ts` → GREEN。
- [ ] 生成モーダル `BodyImageRegenModal.tsx` を作成（`MediaLibraryModal.tsx` の overlay・dialog 様式に合わせる。`coverage.exclude` へ追記する薄い presentation）:

```typescript
/**
 * 本文画像 AI 再生成の生成モーダル(#156/P2)。スタイル6択チップ＋自由指示(500字)＋
 * 文字・数値入力欄(textSpec・1000字)を集め、確定で親へ入力を渡す(依頼は親=ApproveClient が実行)。
 * P2 では画像タブ「AIで再生成」からのみ起動する(P3 でエディタからも同モーダルを使う前提の共通設計)。
 * 薄い presentation(dialog/フォーカストラップ/入力→onSubmit の結線)のためカバレッジ除外。
 * 純ロジック(チップ定義・送信 body)は bodyRegenRequest.ts でテスト済み。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { BODY_IMAGE_STYLE_CHIPS, type BodyImageRegenInput } from "./bodyRegenRequest";
import { handleOverlayKeyDown } from "./hooks/overlayKeyDown";
import { useDialog } from "./hooks/useDialog";
import { IconSparkles } from "./ui/icons";
import { Kbd } from "./ui/primitives";
import type { RequestedBodyImageStyle } from "@/lib/growth/bodyImage";

const MAX_INSTRUCTION = 500;
const MAX_TEXTSPEC = 1000;

interface BodyImageRegenModalProps {
  /** 見出し(記事タイトルなど)。 */
  heading: string;
  onClose: () => void;
  /** 確定で入力を親へ渡す(親が API 依頼を実行する)。 */
  onSubmit: (input: BodyImageRegenInput) => void;
}

export function BodyImageRegenModal({ heading, onClose, onSubmit }: BodyImageRegenModalProps) {
  const [style, setStyle] = useState<RequestedBodyImageStyle>("auto");
  const [instruction, setInstruction] = useState("");
  const [textSpec, setTextSpec] = useState("");
  const dialogRef = useDialog();

  function handleSubmit(): void {
    onSubmit({ style, instruction: instruction.trim(), textSpec: textSpec.trim() });
  }

  return (
    <div
      className="approve-shell fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`本文画像をAIで再生成: ${heading}`}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOverlayKeyDown(e, onClose)}
        className="w-full max-w-[560px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <span className="min-w-0 truncate text-[14px] font-semibold">{heading}</span>
          <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto">
            <Kbd>esc</Kbd>
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              スタイル
            </legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="本文画像スタイル">
              {BODY_IMAGE_STYLE_CHIPS.map((chip) => {
                const selected = chip.key === style;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setStyle(chip.key)}
                    className="rounded-full px-3 py-[6px] text-[12.5px]"
                    style={{
                      background: selected ? "var(--p-accent)" : "var(--p-bg-raised)",
                      color: selected ? "#0a0c10" : "var(--p-text-2)",
                      border: "1px solid var(--p-border)",
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="body-regen-instruction" className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              指示（任意）
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--p-text-3)" }}>
                {instruction.length}/{MAX_INSTRUCTION}
              </span>
            </label>
            <textarea
              id="body-regen-instruction"
              value={instruction}
              maxLength={MAX_INSTRUCTION}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder="どんな画像にしたいか（空ならおまかせ）"
              className="w-full resize-none rounded-[8px] p-2.5 text-[12.5px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>

          <div>
            <label htmlFor="body-regen-textspec" className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              図に入れる文字・数値（任意）
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--p-text-3)" }}>
                {textSpec.length}/{MAX_TEXTSPEC}
              </span>
            </label>
            <textarea
              id="body-regen-textspec"
              value={textSpec}
              maxLength={MAX_TEXTSPEC}
              onChange={(e) => setTextSpec(e.target.value)}
              rows={2}
              placeholder="コート寸法・手順名など、図に焼き込む文字を1行ずつ"
              className="w-full resize-none rounded-[8px] p-2.5 text-[12.5px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>

          <p className="text-[12px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
            AI生成は数分かかります。完了すると自動反映され、LINEに通知されます。
          </p>

          <button
            type="button"
            onClick={handleSubmit}
            aria-label="本文画像の再生成を依頼"
            className="approve-btn-primary ml-auto flex items-center gap-1.5 rounded-[8px] px-3.5 py-[8px] text-[12.5px] font-semibold"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconSparkles size={13} /> AIで再生成を依頼
          </button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] `ApproveClient.tsx` を結線:
  - import 追加（`@/` グループと相対 sibling へ）:

```typescript
import type { BodyImageRegenInput } from "./bodyRegenRequest";
import { buildBodyRegenBody } from "./bodyRegenRequest";
import { BodyImageRegenModal } from "./BodyImageRegenModal";
```

  - `bodyMediaFor` の近傍（L193）にモーダル状態を追加:

```typescript
  // 本文画像 AI 再生成モーダル(#156/P2)。対象記事＋対象 src を持ち、確定でスタイル/指示/文字指定を送る。
  const [bodyRegenFor, setBodyRegenFor] = useState<{ item: PendingItem; targetSrc: string } | null>(null);
```

  - `requestBodyImageRegen`（L828-843）を拡張（`input` を受け取り `buildBodyRegenBody` で body を組む）:

```typescript
  // 本文画像の AI 再生成を実経路(/api/growth/body-image/regen)へ結線する(#156/P2)。
  // スタイル・自由指示・文字指定は生成モーダル(BodyImageRegenModal)で集めて渡す。
  async function requestBodyImageRegen(
    pageId: string,
    targetSrc: string,
    input: BodyImageRegenInput
  ): Promise<void> {
    try {
      const res = await fetch("/api/growth/body-image/regen", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(buildBodyRegenBody(pageId, targetSrc, input)),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "再生成の依頼に失敗しました。");
      }
      pushToast("本文画像の再生成を依頼しました。PCが処理して数分で反映されます。");
    } catch (error) {
      pushToast(toMessage(error, "本文画像の再生成に失敗しました。"), "error");
    }
  }
```

  - `onRegenBodyImage`（L920-922）をモーダル起点へ（P1 の即時依頼を撤去）:

```typescript
        onRegenBodyImage={(index) =>
          bodyImageTargetAt(index, (targetSrc) => setBodyRegenFor({ item, targetSrc }))
        }
```

  - `bodyMediaFor` のモーダル描画（L1239-1254）の直後にモーダル描画を追加:

```typescript
      {bodyRegenFor ? (
        <BodyImageRegenModal
          heading={bodyRegenFor.item.title}
          onClose={() => setBodyRegenFor(null)}
          onSubmit={(input) => {
            void requestBodyImageRegen(bodyRegenFor.item.id, bodyRegenFor.targetSrc, input);
            setBodyRegenFor(null);
          }}
        />
      ) : null}
```

- [ ] `vitest.config.ts` の `coverage.exclude` に追記（`MediaLibraryModal.tsx` の行の後ろ）:

```typescript
        // 本文画像 AI 再生成の生成モーダル(#156/P2)。承認画面が render する薄い presentation
        // (dialog/スタイルチップ/入力→onSubmit の結線)。純ロジック(チップ定義・送信 body)は
        // bodyRegenRequest.ts でテスト済み。結線挙動は ApproveClient.test.tsx で検証する。
        "src/app/growth/approve/BodyImageRegenModal.tsx",
```

- [ ] `ApproveClient.test.tsx` の P1「AIで再生成」テスト（L4563-4588）をモーダル経由へ更新:

```typescript
  it("画像タブ: 本文画像『AIで再生成』→モーダルで確定すると /body-image/regen に style/textSpec を POST", async () => {
    const { fn, dialog } = await openBodyImages({ json: { success: true } });
    const regenButtons = within(dialog).getAllByRole("button", { name: "AIで再生成" });
    expect(regenButtons).toHaveLength(2);
    await userEvent.click(regenButtons[1]); // 本文画像側
    // 生成モーダルが開く。スタイル「コート図」を選び、文字指定を入れて確定する。
    const modal = await screen.findByRole("dialog", { name: "本文画像をAIで再生成: 猛暑記事" });
    await userEvent.click(within(modal).getByRole("radio", { name: "コート図" }));
    await userEvent.type(within(modal).getByLabelText(/図に入れる文字・数値/), "13.41m x 6.10m");
    await userEvent.click(within(modal).getByRole("button", { name: "本文画像の再生成を依頼" }));
    await waitFor(() => {
      const call = fn.mock.calls.find((c) => String(c[0]) === "/api/growth/body-image/regen");
      expect(call).toBeDefined();
      const body = JSON.parse(String((call?.[1] as RequestInit)?.body));
      expect(body).toEqual({
        pageId: "i1",
        targetSrc: BODY_IMG,
        style: "court",
        textSpec: "13.41m x 6.10m",
        instruction: "",
      });
    });
    expect(await screen.findByText(/本文画像の再生成を依頼しました/)).toBeInTheDocument();
  });

  it("画像タブ: 本文画像 再生成の失敗はエラートースト(error付き)", async () => {
    const { dialog } = await openBodyImages({ ok: false, status: 502, json: { success: false, error: "本文再生成NG" } });
    await userEvent.click(within(dialog).getAllByRole("button", { name: "AIで再生成" })[1]);
    const modal = await screen.findByRole("dialog", { name: "本文画像をAIで再生成: 猛暑記事" });
    await userEvent.click(within(modal).getByRole("button", { name: "本文画像の再生成を依頼" }));
    expect(await screen.findByText("本文再生成NG")).toBeInTheDocument();
  });

  it("画像タブ: 本文画像 再生成の失敗(error無し)は既定文言", async () => {
    const { dialog } = await openBodyImages({ ok: false, status: 502, json: { success: false } });
    await userEvent.click(within(dialog).getAllByRole("button", { name: "AIで再生成" })[1]);
    const modal = await screen.findByRole("dialog", { name: "本文画像をAIで再生成: 猛暑記事" });
    await userEvent.click(within(modal).getByRole("button", { name: "本文画像の再生成を依頼" }));
    expect(await screen.findByText("再生成の依頼に失敗しました。")).toBeInTheDocument();
  });
```

  - 注: おまかせ既定（style 未変更）で確定するケースが必要なら `{ pageId, targetSrc, style: "auto", textSpec: "", instruction: "" }` を送る 1 ケースを足す（モーダルを開いて即確定）。
- [ ] 実行して成功確認: `npx vitest run src/app/growth/approve/bodyRegenRequest.test.ts src/app/growth/approve/ApproveClient.test.ts` → 全 GREEN（アイキャッチ側の「AIで再生成」テスト L4476-4499 は無変更で緑のまま＝アイキャッチ UX 不変を確認）。
- [ ] コミット: `git add src/app/growth/approve/bodyRegenRequest.ts src/app/growth/approve/bodyRegenRequest.test.ts src/app/growth/approve/BodyImageRegenModal.tsx src/app/growth/approve/ApproveClient.tsx src/app/growth/approve/ApproveClient.test.tsx vitest.config.ts` →
  `feat(growth): 本文画像 再生成に生成モーダル(スタイル6択+文字指定)を追加し ApproveClient を結線`

---

## T6: 文書更新（style-guide §9 の 6 スタイル表・40-notion-props に 2 プロパティ）

`growth-article-style.md` §9 の本文画像小節を 3 種表 → **6 スタイル表**へ更新し、旧値マップ（`minimal→illust`・`diagram→court`）と、文字/数値を焼き込んでよいスタイル（`court`/`flow`/`infographic`）を明記する。`PICKLEBALL_ANCHOR`/`NO_TABLE_TENNIS` の付与対象を新スタイルへ整理する。`40-notion-props.md` の本文画像再生成節へ `本文画像スタイル`・`本文画像文字指定` を追記する。

**Files:**
- Modify: `docs/operations/growth-article-style.md`（§9 の注記 L123 と「### 本文画像」小節 L125-135）
- Modify: `docs/operations/growth/40-notion-props.md`（L51-54 の「本文画像 AI 再生成(#156)」節）

**Steps:**

- [ ] `growth-article-style.md` L123 の注記を新スタイルへ整理:

```markdown
> #89: 画像生成モデルの卓球(table tennis)バイアス対策として、競技をピックルボールに固定し卓球を明示除外する一文を `STYLE_SUFFIX` に自動付与している(本文画像は `mascot`/`illust` に同句を共用。概念図の `court`/`flow`/`infographic` には付与しない)。正典は `PICKLEBALL_ANCHOR`/`NO_TABLE_TENNIS`（`scripts/growth/body-image.ts`）。
```

- [ ] `growth-article-style.md` の「### 本文画像」小節の表と箇条書き（L127-135）を 6 スタイルへ:

```markdown
- **スタイルは6種(すべてAI生成)**。承認画面の「本文画像スタイル」で選ぶ(`おまかせ`＝AIが文脈で選択・既定 `mascot`)。旧値は自動でマップされる(`minimal`→`illust`・`diagram`→`court`):
  | 表示名 | キー | 中身 | 生成方式 | 文字・数値 |
  |---|---|---|---|---|
  | おまかせ | `auto` | AIが文脈で1つ選ぶ(既定 `mascot`) | — | — |
  | 宇宙人マスコット | `mascot` | 宇宙人マスコットが行為をする(§9 の世界観) | 参照画像方式(`/v1/images/edits`) | なし |
  | 雰囲気イラスト | `illust` | フラット・文字なしの抽象イラスト・ブランド配色 | text-to-image | なし |
  | コート図・ルール図解 | `court` | 俯瞰コート図・ルール図(情報性重視) | text-to-image | **明示指定分のみ** |
  | 手順・フロー図 | `flow` | 手順・工程のフロー図 | text-to-image | **明示指定分のみ** |
  | 比較・インフォグラフィック | `infographic` | 比較・対比のインフォグラフィック | text-to-image | **明示指定分のみ** |
- **実写は禁止**(§9 と同様)。施設の実写風画像は未確定事実の捏造になるため作らない。
- **`court`/`flow`/`infographic` は文字・数値を焼き込める**が、描いてよいのは「承認画面の『本文画像文字指定』(textSpec)に明示した値」「記事本文に既にある値」「ピックルボール公式規格(コート寸法等の公知の事実)」のみ。**営業時間・料金・面数・所要分などの未確定情報は画像内でも断定しない**(絶対禁止の画像への拡張)。文字入りは PC ループの Claude が目視照合し、崩れれば最大3回再生成、3回失敗で文字なし版を納品して LINE 報告する(沈黙させない=#24)。
- **図解系(`court`/`flow`/`infographic`)は AI 生成のため不正確になりうる**。alt に自動で「イメージ図」を明示し、**参考図**として扱う(正確な事実は本文テキストが担う)。下書き止まりで公開前に人が確認する前提。
- **1記事あたり上限3枚**。超過分はスキップし LINE 通知する(沈黙させない=#24)。
- alt は説明文から自動補完される(本文に手書きしない)。生成画像のプロンプト組み立て・置換は `scripts/growth/body-image.ts`、生成は `scripts/growth/eyecatch.ts` の `generateImage`。
- 生成画像は安定ファイル名でキャッシュされ、再実行で OpenAI を**再課金しない**(#21)。1枚失敗しても他画像・本文は生かす。
```

  - 小節見出し L125「### 本文画像(任意・構成案からの指示で生成 / Epic #59)」はそのまま。冒頭段落の「スタイルと説明を指定する」文はそのまま維持。
- [ ] `40-notion-props.md` の「## 本文画像 AI 再生成(#156)」節（L51-54）を更新:

```markdown
## 本文画像 AI 再生成(#156 / P2)

`本文画像再生成指示` / `本文画像再生成ステータス` / `本文画像再生成依頼時刻` / `本文画像再生成対象`(対象src)
＋ P2: `本文画像スタイル` / `本文画像文字指定`
＋ ミラー: `下書き本文HTML`(#95)

| プロパティ | 型 | 用途 |
|---|---|---|
| `本文画像スタイル` | select(`おまかせ`/`mascot`/`illust`/`court`/`flow`/`infographic`) | 再生成のスタイル。`おまかせ`=`auto`(AIが文脈で選ぶ)。旧値(minimal/diagram)は API 側で吸収。 |
| `本文画像文字指定` | rich_text | 図に焼き込む文字・数値(textSpec・自由入力・サーバ側1000字上限)。`court`/`flow`/`infographic` 用。 |

- **P2 追加の2プロパティは手動追加が前提**。**未追加でも沈黙落ちしない**: 書き込みは `growthApiError`(#177)でプロパティ名つきの 500 に可視化、読み取りは「未設定=`おまかせ`/空」で従来動作(欠落耐性)。
- 完了(`done`)でスタイルは`おまかせ`・文字指定は空へクリアする。失敗(`失敗`)は残し、承認画面から再依頼できる。
```

- [ ] 文書のみのため自動テストなし。差分を目視確認する（表の列・キー名・旧値マップ・文字許可スタイルが T1/T2 と一致すること）。
- [ ] コミット: `git add docs/operations/growth-article-style.md docs/operations/growth/40-notion-props.md` →
  `docs(growth): 本文画像を6スタイル表へ更新し Notion プロパティ2種(スタイル/文字指定)を追記`

---

## T7: 仕上げ（型チェック・lint・全テスト・カバレッジ）

新規/変更の純ロジック（`normalizeBodyImageStyle`・`RequestedBodyImageStyle`・`STYLE_DISPLAY_LABELS`/`styleDisplayLabel`/`requestedStyleFromLabel`・拡張 Props/Row/View・`BODY_IMAGE_STYLE_CHIPS`/`buildBodyRegenBody`）と拡張 API（`/body-image/regen`）は 100% カバレッジ対象。UI 薄結線（`BodyImageRegenModal.tsx` は本タスクで `coverage.exclude` へ追記済み）はテスト不要。CLI・`gen-body-image.ts` は既存どおり除外。

**Files:**
- Modify（必要時のみ）: `vitest.config.ts`（T5 で `BodyImageRegenModal.tsx` を追記済み。追加の穴が出た場合のみ、純ロジックはテスト追加で埋め、薄結線に限り `coverage.exclude` へ追記）

**Steps:**

- [ ] 型チェック: `npx tsc --noEmit` → エラー 0。特に **`buildBodyRegenRequestProps` の全呼び出し（API・CLI 内接触なし・テスト）が 5 引数へ揃っている**こと、`BodyImageStyle`/`RequestedBodyImageStyle` を使う `publish-draft-cli.ts`（`imgSpec.style === "mascot"` は不変）・`gen-body-image.ts`・`eyecatch.ts`（`PICKLEBALL_ANCHOR`/`NO_TABLE_TENNIS` import は不変）が壊れていないことを確認する。`any`/`@ts-ignore` 混入がないこと。
- [ ] lint: `npm run lint`（存在すれば）→ エラー 0。import 順（React → 3rd party → `@/` → 相対 parent → 相対 sibling → `import type`）を満たすこと。未使用 import（T3 で `requestedStyleFromLabel` を import しない等）がないこと。
- [ ] 全テスト＋カバレッジ: `npx vitest run --coverage` → 全 GREEN。以下が 100%（statements/branches/functions/lines）:
  - `scripts/growth/body-image.ts`（`normalizeBodyImageStyle`・新プロンプトビルダー・alt 含む）
  - `scripts/growth/body-image-regen.ts`（拡張 Props/Row/View・`requestedStyleFromLabel`/`styleDisplayLabel` 含む）
  - `src/app/api/growth/body-image/regen/route.ts`
  - `src/app/growth/approve/bodyRegenRequest.ts`
- [ ] カバレッジ穴があれば、純ロジックはテストケースを追加して埋める（薄結線 UI に限り `coverage.exclude` へ追記し、追記理由をコメントで残す）。再度 `npx vitest run --coverage` で確認。
- [ ] 受け入れ基準の手動確認メモを残す（コミットしない・報告のみ）: 画像タブ「AIで再生成」→ 生成モーダルでスタイル 6 択・自由指示・文字指定を入力 → 確定で `/body-image/regen` へ style/textSpec 付き POST ＋トースト＋生成中バッジ。Notion に `本文画像スタイル`/`本文画像文字指定` が書かれる。PC ループの `next` が style/textSpec を出し、`regen-body-image.md` の文字検証ループが 3 回失敗で文字なし納品＋LINE 報告する。
- [ ] コミット（変更があった場合のみ）: `git add vitest.config.ts` →
  `test(growth): 本文画像 P2 のカバレッジを 100% に揃える`

---

## 受け入れ基準（spec §13 P2・再掲）

- 6 スタイル指定つき再生成が動く（画像タブ「AIで再生成」→ 生成モーダル → スタイル 6 択＋文字指定 → `/body-image/regen` に style/textSpec を POST → Notion `本文画像スタイル`/`本文画像文字指定` へ書き込み）。
- `BodyImageStyle` が新 5 キー、`RequestedBodyImageStyle = BodyImageStyle | "auto"`、`normalizeBodyImageStyle` が旧値（minimal→illust・diagram→court）を吸収。`PROMPT_BUILDERS` は新 4 スタイル追加＋minimal/diagram 除去。`PICKLEBALL_ANCHOR`/`NO_TABLE_TENNIS` は mascot/illust のみ付与。
- API が style（表示値/内部キーを enum 検証・省略時 auto）と textSpec（1000 字上限・超過 400）を受理し、既存の検証・409・`articleEditGuard`・instruction 500 字上限を維持。
- PC ループの `next` が style/textSpec を出し、`regen-body-image.md` の文字検証ループ（生成→目視照合→最大 3 回→3 回失敗は文字なし版納品＋LINE 通知）が入る。`gen-body-image` の `STYLES` が新 5 キー＋旧値受理。
- 文書（style-guide §9 の 6 スタイル表・40-notion-props の 2 プロパティ）が更新される。Notion への手動プロパティ追加が計画冒頭に明記されている。
- placeholder/挿入・エディタ・競合ガードには**触れていない**（P3 スコープ）。`本文画像再生成対象` は `targetSrc` のまま。
