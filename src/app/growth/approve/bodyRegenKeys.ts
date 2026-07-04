/**
 * 本文画像 AI 再生成の「どの画像が生成中か」を索く純ロジック(#166 / P1)。
 *
 * 承認画面は Notion の bodyRegen.targetSrc(その時点の src)で対象画像を指定する。本文抽出順の
 * インデックスへ写して ImagesView の生成中バッジ(`${id}:body:<index>`)へ立てる。依頼後に本文編集で
 * 並びが変わり targetSrc が索けないときは、全本文画像を保守的に生成中扱いにする(取りこぼしより過剰表示)。
 */

/**
 * 本文画像 src 列(抽出順)の中で targetSrc の位置を索く。
 * 見つかれば [index]、見つからない/空 targetSrc のときは全インデックスを返す(保守的フォールバック)。
 * 画像 0 枚なら空配列。
 */
export function bodyRegenIndices(bodyImageSrcs: readonly string[], targetSrc: string): number[] {
  if (bodyImageSrcs.length === 0) return [];
  const index = targetSrc === "" ? -1 : bodyImageSrcs.indexOf(targetSrc);
  if (index >= 0) return [index];
  return bodyImageSrcs.map((_src, i) => i);
}
