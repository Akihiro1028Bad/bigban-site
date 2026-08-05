/**
 * 本文画像(#62)の純ロジック: スタイル別プロンプト・alt・プレースホルダ。
 *
 * 承認画面で構成案に書かれた画像指示(`[画像:<スタイル>: <説明>]`)を、下書き生成時に
 * 本文へ埋め込むための仕様(BodyImageSpec)へ変換する。実際の画像生成・アップロード・
 * 置換は投入パイプライン(#63)が担う。I/O を持たないためテスト可能。
 *
 * 配色・作画方針はこのファイルの PROMPT_BUILDERS が正典(宇宙人マスコット × コスミック)。
 */

/** 本文画像の生成に渡すスタイル(auto は含まない。生成時は必ず具体スタイルへ解決済み)。 */
export type BodyImageStyle = "mascot" | "illust" | "court" | "flow" | "infographic";

/** 依頼キューが運ぶスタイル値。auto は「Claude が文脈で選ぶ」の意(生成前に具体スタイルへ解決)。 */
export type RequestedBodyImageStyle = BodyImageStyle | "auto";

/** 1記事あたりの本文画像の上限(#61 と整合)。超過は投入側(#63)でスキップ＋通知。 */
export const BODY_IMAGE_MAX = 3;

// 参照画像(assets/mascot-alien.png)のキャラを保持させる固定の前置き(eyecatch と同様)。
const ALIEN_CHARACTER =
  "the exact gray alien character from the reference image " +
  "(smooth gray head, large black almond eyes with white highlights, small friendly smile)";

// ブランド配色・フラット・文字なしの共通スタイル。
const BRAND_PALETTE =
  "brand palette: deep blue (#11317B) and black base, bright blue (#306EC3) glow, " +
  "yellow-green (#F6FF54) accents";

// #89: 画像生成モデルの卓球(table tennis)バイアス対策。パドル＋ボールのシーンを
// ピックルボールに固定し、卓球を明示的に除外する。アイキャッチ(eyecatch.ts)とも共用。
export const PICKLEBALL_ANCHOR =
  "If a paddle, ball, or racket-sport scene appears, it must be pickleball: " +
  "a large solid pickleball paddle and a perforated plastic pickleball (a whiffle ball with holes), " +
  "on an indoor pickleball court with a low net, players standing on the court.";
export const NO_TABLE_TENNIS =
  "Not table tennis, not ping pong: no table, no tiny ping-pong paddle, no small bat.";

// mascot / illust(スポーツシーンを描き得る)に付与する競技固定句。
// court / flow / infographic(概念図)はスポーツシーンとは限らないため付与しない。
const PICKLEBALL_GUARD = `${PICKLEBALL_ANCHOR} ${NO_TABLE_TENNIS}`;

// court/flow/infographic は図中に文字・数値を焼き込むが、捏造(#58)防止のため
// **description に明示された文字・数値だけ**を描く(それ以外の数値は描かせない)。
const TEXT_ONLY_AS_SPECIFIED =
  "Render only the exact text and numbers explicitly given in the description; " +
  "do not invent any other numbers, prices, times, hours, or labels. " +
  "Keep any text short, legible, and correctly spelled.";

function textSpecInstruction(textSpec?: string): string {
  const t = textSpec?.trim().replace(/\s+/g, " ");
  return t ? `Render exactly this text/numbers: ${t}. ` : "";
}

const PROMPT_BUILDERS: Record<BodyImageStyle, (description: string, textSpec?: string) => string> = {
  mascot: (d) =>
    `Using ${ALIEN_CHARACTER}, create a flat illustration of this same alien: ${d}. ` +
    `Cosmic deep-space scene, ${BRAND_PALETTE}. ${PICKLEBALL_GUARD} ` +
    `Keep the alien's face identical to the reference. Clean premium flat illustration. No text, no logos.`,
  illust: (d) =>
    `Atmospheric flat vector illustration of: ${d}. ` +
    `Premium editorial mood with generous negative space, ${BRAND_PALETTE} on a clean background. ${PICKLEBALL_GUARD} ` +
    `No text, no labels, no logos.`,
  court: (d, textSpec) =>
    `Clean top-down pickleball court diagram illustrating: ${d}. ` +
    textSpecInstruction(textSpec) +
    `Flat schematic style, ${BRAND_PALETTE}. ${TEXT_ONLY_AS_SPECIFIED} ` +
    `Illustrative and conceptual, not a precise engineering drawing.`,
  flow: (d, textSpec) =>
    `Clean step-by-step flow diagram illustrating: ${d}. ` +
    textSpecInstruction(textSpec) +
    `Left-to-right or top-to-bottom flat schematic with simple arrows, ${BRAND_PALETTE}. ${TEXT_ONLY_AS_SPECIFIED} ` +
    `Illustrative and conceptual, not a precise engineering drawing.`,
  infographic: (d, textSpec) =>
    `Clean comparison infographic illustrating: ${d}. ` +
    textSpecInstruction(textSpec) +
    `Flat schematic panels or side-by-side layout, ${BRAND_PALETTE}. ${TEXT_ONLY_AS_SPECIFIED} ` +
    `Illustrative and conceptual, not a precise engineering drawing.`,
};

/** スタイル別のフル画像生成プロンプトを組む。 */
export function buildBodyImagePrompt(
  style: BodyImageStyle,
  description: string,
  textSpec?: string
): string {
  return PROMPT_BUILDERS[style](description.trim(), textSpec);
}

/**
 * alt テキスト。図解系(court/flow/infographic)は AI 生成のため「イメージ図」と明示し、
 * 正確な事実として読まれないようにする(#58/捏造リスク対策)。mascot/illust は説明をそのまま。
 */
export function buildBodyImageAlt(style: BodyImageStyle, description: string): string {
  const d = description.trim();
  const isDiagram = style === "court" || style === "flow" || style === "infographic";
  return isDiagram ? `イメージ図: ${d}` : d;
}

/** 本文に埋め込む画像1枚分の仕様。投入パイプライン(#63)が生成・置換に使う。 */
export interface BodyImageSpec {
  index: number;
  style: BodyImageStyle;
  description: string;
  textSpec?: string;
  prompt: string;
  alt: string;
}

/**
 * 画像指示(スタイル＋説明)から BodyImageSpec を組み立てる。
 * index は 1 始まり(本文の {{IMG:n}} と対応)。説明は1行に正規化する
 * (改行・連続空白を1つの空白に畳み、画像生成プロンプトへの混入や崩れを防ぐ)。
 */
export function buildBodyImageSpec(
  index: number,
  style: BodyImageStyle,
  description: string,
  textSpec?: string
): BodyImageSpec {
  if (index < 1) {
    throw new Error(`本文画像の index は 1 以上にしてください: ${index}`);
  }
  const d = description.trim().replace(/\s+/g, " ");
  const t = textSpec?.trim().replace(/\s+/g, " ");
  const shouldUseTextSpec =
    Boolean(t) && (style === "court" || style === "flow" || style === "infographic");
  return {
    index,
    style,
    description: d,
    ...(shouldUseTextSpec ? { textSpec: t } : {}),
    prompt: buildBodyImagePrompt(style, d, shouldUseTextSpec ? t : undefined),
    alt: buildBodyImageAlt(style, d),
  };
}

// 本文HTMLに置くプレースホルダ。投入時に <figure><img> へ置換する(#63/#88)。
// 注: matchAll(内部コピー)と replace(lastIndex リセット)からのみ使う(exec で共有しない)。
const PLACEHOLDER_RE = /\{\{IMG:(\d+)\}\}/g;

/** 指定 index のプレースホルダ文字列を返す。 */
export function bodyImagePlaceholder(index: number): string {
  return `{{IMG:${index}}}`;
}

/** 本文HTML中に含まれるプレースホルダの index 一覧を返す(出現順)。 */
export function placeholderIndices(html: string): number[] {
  return [...html.matchAll(PLACEHOLDER_RE)].map((match) => Number(match[1]));
}

// ── 投入パイプライン(#63)用 ──────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/** 属性値・テキストノードに入れる文字列を最小限エスケープする。 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch]);
}

/** アップロード済みの本文画像(microCMS のアセットURL確定)。 */
export interface ResolvedBodyImage {
  index: number;
  url: string;
  alt: string;
}

/** 生成/アップロードに失敗した本文画像(スキップ対象・通知用)。 */
export interface BodyImageFailure {
  index: number;
  description: string;
  error: string;
}

// #88: 視覚キャプション(figcaption)は廃止。図解の「イメージ図」明示は alt 側で担保する。
function figureHtml(image: ResolvedBodyImage): string {
  const img = `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}">`;
  return `<figure>${img}</figure>`;
}

/**
 * 本文HTMLの {{IMG:n}} を、アップロード済み画像の <figure> へ置換する。
 * resolved に無い index(生成/アップロード失敗・欠番)のプレースホルダは**除去**する
 * (壊れた <img> を残さない)。
 */
export function substituteBodyImages(
  bodyHtml: string,
  resolved: readonly ResolvedBodyImage[]
): string {
  const byIndex = new Map(resolved.map((r) => [r.index, r]));
  return bodyHtml.replace(PLACEHOLDER_RE, (_match, n: string) => {
    const image = byIndex.get(Number(n));
    return image ? figureHtml(image) : "";
  });
}

/**
 * 各 spec を resolveOne(生成→アップロード)で解決する。1枚が失敗しても他は続行し、
 * 成功分(resolved)と失敗分(failures)を分けて返す(#24: 沈黙させない・全体を止めない)。
 */
export async function resolveBodyImages(
  specs: readonly BodyImageSpec[],
  resolveOne: (spec: BodyImageSpec) => Promise<string>
): Promise<{ resolved: ResolvedBodyImage[]; failures: BodyImageFailure[] }> {
  const resolved: ResolvedBodyImage[] = [];
  const failures: BodyImageFailure[] = [];
  for (const spec of specs) {
    try {
      const url = await resolveOne(spec);
      resolved.push({ index: spec.index, url, alt: spec.alt });
    } catch (error: unknown) {
      failures.push({
        index: spec.index,
        description: spec.description,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { resolved, failures };
}

/** 上限(BODY_IMAGE_MAX)を超える spec を切り落とす。kept と dropped を返す。 */
export function capBodyImageSpecs(specs: readonly BodyImageSpec[]): {
  kept: BodyImageSpec[];
  dropped: BodyImageSpec[];
} {
  return {
    kept: specs.slice(0, BODY_IMAGE_MAX),
    dropped: specs.slice(BODY_IMAGE_MAX),
  };
}

/** 本文画像の一部スキップを LINE 通知する本文(沈黙させない=#24)。 */
export function buildBodyImageFailureMessage(
  title: string,
  failures: readonly BodyImageFailure[]
): string {
  const lines = failures.map((f) => `・${f.description}（理由: ${f.error}）`);
  return [
    "本文画像の一部を生成できず、その画像を除いて下書きを作成しました。",
    `タイトル: ${title}`,
    ...lines,
    "下書きは公開前に確認できます。再実行すれば未生成分の生成を再試行します。",
  ].join("\n");
}

// 生成画像の安定ファイル名 stem(冪等キャッシュ #21)。
// (slug + style + description) から決定的に作り、再実行で同じファイルを使い回す
// → OpenAI 生成の再課金を防ぐ。暗号強度は不要なので軽量な決定的ハッシュを使う。
function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * 生成画像の安定ファイル名 stem(拡張子なし)。同一 spec なら常に同じ。
 * slug は英数字・ハイフンに正規化する(ファイルパスに使うためパス・トラバーサルを防ぐ)。
 */
export function bodyImageFileStem(slug: string, spec: BodyImageSpec): string {
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const keySource = spec.textSpec
    ? `${spec.style}|${spec.description}|${spec.textSpec}`
    : `${spec.style}|${spec.description}`;
  const key = hashString(keySource);
  return `growth-bodyimg-${safeSlug}-${spec.index}-${key}`;
}

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
