/**
 * 公開前チェックリスト(#128)の純ロジック。DOM/IO 非依存。
 *
 * 下書き本文(HTML/プレーン)とタイトルから、文字数・見出し数・画像数・内部リンク数・
 * タイトル長を算出し、各項目を ok/warn 判定する。しきい値は定数化。
 */

export interface QualityCheck {
  label: string;
  /** 表示用の値(例 "2,400字" / "0 / 3")。 */
  value: string;
  /** true=満たす(緑) / false=要確認(黄)。 */
  ok: boolean;
}

export interface DraftQualityInput {
  bodyHtml: string;
  body: string;
  title: string;
}

export const QUALITY_THRESHOLDS = {
  minChars: 800,
  minHeadings: 2,
  minImages: 1,
  minInternalLinks: 1,
  maxTitleLen: 32,
} as const;

const SITE_HOST = "thepicklebang.com";

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function plainText(input: DraftQualityInput): string {
  const body = input.body.trim();
  return body.length > 0 ? body : stripTags(input.bodyHtml);
}

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

function countInternalLinks(html: string): number {
  const hrefs = html.match(/href="([^"]*)"/gi) ?? [];
  return hrefs.filter((raw) => {
    const url = raw.slice(6, -1); // href=" ... "
    return url.includes(SITE_HOST) || url.startsWith("/");
  }).length;
}

export function draftQuality(input: DraftQualityInput): QualityCheck[] {
  const t = QUALITY_THRESHOLDS;
  const chars = plainText(input).length;
  const headings = countMatches(input.bodyHtml, /<h[23][\s>]/gi);
  const images = countMatches(input.bodyHtml, /<img[\s>]/gi);
  const internalLinks = countInternalLinks(input.bodyHtml);
  const titleLen = input.title.length;
  return [
    { label: "文字数", value: `${chars.toLocaleString()}字`, ok: chars >= t.minChars },
    { label: "見出し", value: `${headings}`, ok: headings >= t.minHeadings },
    { label: "画像", value: `${images} / 3`, ok: images >= t.minImages },
    { label: "内部リンク", value: `${internalLinks}`, ok: internalLinks >= t.minInternalLinks },
    { label: "タイトル長", value: `${titleLen}字`, ok: titleLen <= t.maxTitleLen },
  ];
}
