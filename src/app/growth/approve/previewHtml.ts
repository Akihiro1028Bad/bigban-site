/**
 * 端末プレビュー用の HTML 合成(#210)。
 *
 * 端末プレビューは本番ページの body HTML のみを描画するため、公開ページや proto と
 * 異なりアイキャッチがヒーローとして出ない。ここで body の先頭にヒーロー img を差し込み、
 * 公開後の見え方を忠実に再現する。DOM 非依存の純関数(100% カバレッジ対象)。
 */

/** HTML 属性値としてエスケープする(URL をそのまま属性に埋める用途)。 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * body HTML の先頭にアイキャッチのヒーロー img を差し込んだ HTML を返す。
 * eyecatchUrl が falsy/空なら bodyHtml をそのまま返す。
 * URL は microCMS 変換を付けず、与えられた値を属性エスケープのみして描画する。
 */
export function buildPreviewHtml(bodyHtml: string, eyecatchUrl?: string): string {
  if (!eyecatchUrl) {
    return bodyHtml;
  }
  const src = escapeAttr(eyecatchUrl);
  const hero = `<div style="margin-bottom:24px"><img src="${src}" alt="" style="width:100%;height:auto;display:block" /></div>`;
  return hero + bodyHtml;
}
