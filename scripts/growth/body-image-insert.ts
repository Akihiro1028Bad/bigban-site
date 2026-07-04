/**
 * 本文画像の新規挿入(P3)で使う純ロジック。
 *
 * UI は本文へ pending figure を挿入し、既存の本文画像再生成キューが完了時に
 * pending figure を実画像 figure へ置換する。ここでは I/O を持たず、placeholder ID の
 * 検証・figure HTML の組み立て・h2 抽出・挿入位置の合成だけを担う。
 */

export const PLACEHOLDER_ID_RE = /^img-[A-Za-z0-9-]{6,64}$/;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const H2_RE = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
const TAG_RE = /<[^>]*>/g;

/** 値が本文画像挿入 placeholder ID の正規形か判定する。 */
export function isPlaceholderId(value: unknown): value is string {
  return typeof value === "string" && PLACEHOLDER_ID_RE.test(value);
}

/** pending 状態として本文に挿入する figure HTML を返す。不正 ID は空文字。 */
export function buildPendingFigureHtml(placeholderId: string): string {
  if (!isPlaceholderId(placeholderId)) return "";
  return (
    `<figure data-pending="${placeholderId}">` +
    `<figcaption>AI画像を生成中…（完了すると自動で差し替わります）</figcaption>` +
    `</figure>`
  );
}

/** 属性値・テキストノードに入れる文字列を最小限エスケープする。 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * placeholder 完了時に本文へ入れる画像 figure HTML。
 * scripts/growth/body-image.ts の substituteBodyImages が生成する markup と同一形にする。
 */
export function bodyImageFigureHtml(src: string, alt: string): string {
  const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  return `<figure>${img}</figure>`;
}

function stripTags(value: string): string {
  return value.replace(TAG_RE, "");
}

/** 本文HTML中の h2 見出しだけを出現順に抽出する。 */
export function extractBodyHeadings(html: string): { text: string; index: number }[] {
  return [...html.matchAll(H2_RE)].map((match, index) => ({
    text: stripTags(match[0]),
    index,
  }));
}

function h2Starts(html: string): number[] {
  return [...html.matchAll(H2_RE)].map((match) => match.index as number);
}

/**
 * headingIndex 番目の h2 セクション直後(次 h2 の直前、無ければ末尾)に fragment を挿入する。
 * headingIndex=null または範囲外の場合は本文末尾へ追加する。
 */
export function insertHtmlAfterHeading(
  html: string,
  headingIndex: number | null,
  fragment: string
): string {
  const starts = h2Starts(html);
  const insertionIndex =
    headingIndex === null || headingIndex < 0 || headingIndex >= starts.length
      ? html.length
      : starts[headingIndex + 1] ?? html.length;
  return `${html.slice(0, insertionIndex)}${fragment}${html.slice(insertionIndex)}`;
}
