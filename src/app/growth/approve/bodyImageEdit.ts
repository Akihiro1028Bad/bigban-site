/**
 * 本文画像の差し替え純ロジック(Epic #140 / #145)。
 *
 * 下書き本文HTML(`<figure><img src="https://images.microcms-assets.io/...">`)から
 * 本文画像(microCMS アセット)を列挙し、特定インデックスの `src` だけを差し替える。
 * DOM 非依存・I/O なしでテスト可能。保存はサニタイズ込みの /api/growth/draft/edit が担う。
 */

import { isMicrocmsAssetUrl } from "@/lib/growth/media";

const IMG_TAG_RE = /<img\b[^>]*>/gi;

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : "";
}

export interface BodyImageRef {
  src: string;
  alt: string;
}

/** 本文HTML中の microCMS アセット画像を出現順に列挙する(src/alt)。 */
export function listBodyImages(html: string): BodyImageRef[] {
  const tags = html.match(IMG_TAG_RE) ?? [];
  return tags
    .map((tag) => ({ src: attr(tag, "src"), alt: attr(tag, "alt") }))
    .filter((image) => isMicrocmsAssetUrl(image.src));
}

/**
 * 本文画像(microCMS アセット)のうち index 番目の `src` を newUrl に差し替えた HTML を返す。
 * alt や他属性・他画像・本文は保持する。範囲外 index は無変更。
 */
export function replaceBodyImageSrc(html: string, index: number, newUrl: string): string {
  let seen = -1;
  return html.replace(IMG_TAG_RE, (tag) => {
    if (!isMicrocmsAssetUrl(attr(tag, "src"))) return tag;
    seen += 1;
    if (seen !== index) return tag;
    return tag.replace(/(\bsrc\s*=\s*")[^"]*(")/i, `$1${newUrl}$2`);
  });
}
