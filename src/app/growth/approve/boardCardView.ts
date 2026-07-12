/**
 * ボードカードの表示派生値の純ロジック(#proto P2)。DOM/IO 非依存。
 * proto Article の hue/excerpt/hasEyecatch は本番 PendingItem に無いため、視覚目的で決定的に導出する。
 * hasEyecatch は contentId 有無で近似(microCMS 化済み=アイキャッチ設定済みの近似)。
 * surface できない proto 属性(更新時刻ラベル等)は導出せず、BoardCard 側でも表示しない(縮約)。
 */

import type { PendingItem } from "./types";

/**
 * 抜粋(subtitle 優先・無ければ details・max 超で … 付与)。
 * PendingItem.details は PendingDetail[](本番型)なので、各 detail の value を空白連結して
 * 表示用テキストへ決定的に畳み込む。subtitle も details も無ければ空文字(欠落耐性)。
 */
export function cardExcerpt(item: PendingItem, max = 60): string {
  const subtitle = (item.subtitle ?? "").trim();
  const detail = detailsToText(item.details);
  const src = subtitle || detail;
  if (src.length <= max) return src;
  return `${src.slice(0, max)}…`;
}

/** PendingDetail[] を表示用テキストへ畳み込む(value を空白連結・trim)。未設定は空文字。 */
function detailsToText(details: PendingItem["details"]): string {
  if (!details) return "";
  return details
    .map((d) => d.value)
    .join(" ")
    .trim();
}

/** seed から決定的に 0-359 の hue を得る(EyecatchThumb グラデーション用)。 */
export function cardHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** アイキャッチ有無の近似(microCMS content 化済み=contentId ありなら true)。 */
export function cardHasEyecatch(item: PendingItem): boolean {
  return typeof item.contentId === "string" && item.contentId.length > 0;
}
