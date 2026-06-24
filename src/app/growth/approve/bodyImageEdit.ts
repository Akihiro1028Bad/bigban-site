/**
 * 本文画像の差し替え純ロジック(Epic #140 / #145)。
 *
 * 下書き本文HTML(`<figure><img src="https://images.microcms-assets.io/...">`)から
 * 本文画像(microCMS アセット)を列挙し、特定インデックスの `src` だけを差し替える。
 * DOM 非依存・I/O なしでテスト可能。保存はサニタイズ込みの /api/growth/draft/edit が担う。
 */

import { isMicrocmsAssetUrl } from "@/lib/growth/media";

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*"([^"]*)"/i;
const ALT_ATTR_RE = /\balt\s*=\s*"([^"]*)"/i;
// 差し替え用: 先頭の `src="` と閉じ `"` を捕捉して値だけ入れ替える。
const SRC_REPLACE_RE = /(\bsrc\s*=\s*")[^"]*(")/i;

function matchAttr(tag: string, re: RegExp): string {
  const m = tag.match(re);
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
    .map((tag) => ({ src: matchAttr(tag, SRC_ATTR_RE), alt: matchAttr(tag, ALT_ATTR_RE) }))
    .filter((image) => isMicrocmsAssetUrl(image.src));
}

/**
 * 本文画像(microCMS アセット)のうち index 番目の `src` を newUrl に差し替えた HTML を返す。
 * alt や他属性・他画像・本文は保持する。範囲外 index は無変更。
 *
 * 置換は **関数形式**で行う(security H-1): `String.replace` の置換文字列だと newUrl 内の
 * `$1`/`$2` 等が特殊シーケンスとして展開され、属性が壊れる/抜け出すため。
 */
export function replaceBodyImageSrc(html: string, index: number, newUrl: string): string {
  let seen = -1;
  return html.replace(IMG_TAG_RE, (tag) => {
    if (!isMicrocmsAssetUrl(matchAttr(tag, SRC_ATTR_RE))) return tag;
    seen += 1;
    if (seen !== index) return tag;
    return tag.replace(SRC_REPLACE_RE, (_m, open: string, close: string) => `${open}${newUrl}${close}`);
  });
}
