/**
 * メタディスクリプション(excerpt)の純ロジック(#H20)。DOM/IO 非依存。
 *
 * 本文プレーンテキストから検索スニペット用の抜粋を自動生成し、長さを判定する。
 * 実際の保存(microCMS 下書きの excerpt patch)は API 側で行う。
 */

/** 推奨上限(検索スニペットの目安)。 */
export const EXCERPT_MAX = 120;
/** 保存時の絶対上限(過大入力を境界で弾く)。 */
export const EXCERPT_HARD_MAX = 200;

/** 本文プレーンテキストから excerpt の下書きを生成する(空白正規化＋上限で省略)。 */
export function autoExcerpt(plain: string, max: number = EXCERPT_MAX): string {
  const text = plain.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** 推奨上限を超えているか(警告用・true=長すぎ)。 */
export function isExcerptTooLong(excerpt: string, max: number = EXCERPT_MAX): boolean {
  return excerpt.length > max;
}
