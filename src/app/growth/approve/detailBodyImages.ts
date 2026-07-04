/**
 * 詳細パネル画像タブ(ImagesView)の本文画像を実データ化する純ロジック(#59 / P1)。
 * draft の本文HTMLから本文画像 URL 列を抽出順で取り出す。枚数(bodyImages)は配列長で表す。
 */
import { extractBodyImages } from "@/lib/growth/bodyImageRegen";

/** 本文HTMLから本文画像 URL 列(抽出順)を返す。ImagesView の bodyImageUrls/bodyImages 供給元。 */
export function bodyImageUrlsOf(bodyHtml: string): string[] {
  return extractBodyImages(bodyHtml).map((ref) => ref.src);
}
