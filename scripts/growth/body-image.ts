/**
 * 本文画像(#62)の純ロジック: スタイル別プロンプト・alt/caption・プレースホルダ。
 *
 * 承認画面で構成案に書かれた画像指示(`[画像:<スタイル>: <説明>]`)を、下書き生成時に
 * 本文へ埋め込むための仕様(BodyImageSpec)へ変換する。実際の画像生成・アップロード・
 * 置換は投入パイプライン(#63)が担う。I/O を持たないためテスト可能。
 *
 * 文体・配色の正典は growth-article-style.md §9(宇宙人マスコット × コスミック)。
 */

/** 本文画像のスタイル(承認画面 src/app/growth/approve/outline.ts の ImageStyleKey とキー一致)。 */
export type BodyImageStyle = "mascot" | "minimal" | "diagram";

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

const PROMPT_BUILDERS: Record<BodyImageStyle, (description: string) => string> = {
  mascot: (d) =>
    `Using ${ALIEN_CHARACTER}, create a flat illustration of this same alien: ${d}. ` +
    `Cosmic deep-space scene, ${BRAND_PALETTE}. ` +
    `Keep the alien's face identical to the reference. Clean premium flat illustration. No text, no logos.`,
  minimal: (d) =>
    `Minimal flat vector-style illustration of: ${d}. ` +
    `Simple shapes with generous negative space, ${BRAND_PALETTE} on a clean background. ` +
    `No text, no labels, no logos.`,
  diagram: (d) =>
    `Clean conceptual diagram illustrating: ${d}. ` +
    `Flat schematic style, ${BRAND_PALETTE}. ` +
    `Minimal or no text labels (avoid garbled text). Illustrative and conceptual, not a precise technical drawing.`,
};

/** スタイル別のフル画像生成プロンプトを組む。 */
export function buildBodyImagePrompt(style: BodyImageStyle, description: string): string {
  return PROMPT_BUILDERS[style](description.trim());
}

/**
 * alt テキスト。図解(diagram)は AI 生成のため「イメージ図」と明示し、
 * 正確な事実として読まれないようにする(#58/捏造リスク対策)。
 */
export function buildBodyImageAlt(style: BodyImageStyle, description: string): string {
  const d = description.trim();
  return style === "diagram" ? `イメージ図: ${d}` : d;
}

/** figcaption。図解は「(イメージ図)」を付けて参考扱いであることを示す。 */
export function buildBodyImageCaption(style: BodyImageStyle, description: string): string {
  const d = description.trim();
  return style === "diagram" ? `${d}（イメージ図）` : d;
}

/** 本文に埋め込む画像1枚分の仕様。投入パイプライン(#63)が生成・置換に使う。 */
export interface BodyImageSpec {
  index: number;
  style: BodyImageStyle;
  description: string;
  prompt: string;
  alt: string;
  caption: string;
}

/**
 * 画像指示(スタイル＋説明)から BodyImageSpec を組み立てる。
 * index は 1 始まり(本文の {{IMG:n}} と対応)。説明は1行に正規化する
 * (改行・連続空白を1つの空白に畳み、画像生成プロンプトへの混入や崩れを防ぐ)。
 */
export function buildBodyImageSpec(
  index: number,
  style: BodyImageStyle,
  description: string
): BodyImageSpec {
  if (index < 1) {
    throw new Error(`本文画像の index は 1 以上にしてください: ${index}`);
  }
  const d = description.trim().replace(/\s+/g, " ");
  return {
    index,
    style,
    description: d,
    prompt: buildBodyImagePrompt(style, d),
    alt: buildBodyImageAlt(style, d),
    caption: buildBodyImageCaption(style, d),
  };
}

// 本文HTMLに置くプレースホルダ。投入時に <figure><img><figcaption> へ置換する(#63)。
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
  caption: string;
}

/** 生成/アップロードに失敗した本文画像(スキップ対象・通知用)。 */
export interface BodyImageFailure {
  index: number;
  description: string;
  error: string;
}

function figureHtml(image: ResolvedBodyImage): string {
  const img = `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}">`;
  return `<figure>${img}<figcaption>${escapeHtml(image.caption)}</figcaption></figure>`;
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
      resolved.push({ index: spec.index, url, alt: spec.alt, caption: spec.caption });
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
  const key = hashString(`${spec.style}|${spec.description}`);
  return `growth-bodyimg-${safeSlug}-${spec.index}-${key}`;
}
