/**
 * 本番プレビューの表示デバイス切替(#129)の純ロジック。DOM 非依存。
 * PC=全幅 / モバイル=〜390px 中央寄せ。
 */

export type PreviewDevice = "pc" | "mobile";

export const PREVIEW_DEVICES: readonly PreviewDevice[] = ["pc", "mobile"];

/** デバイス → プレビュー枠のラッパ幅クラス。 */
export function previewWidthClass(device: PreviewDevice): string {
  return device === "mobile" ? "mx-auto max-w-[390px]" : "";
}

/** デバイス → 表示ラベル。 */
export function previewDeviceLabel(device: PreviewDevice): string {
  return device === "mobile" ? "モバイル" : "PC";
}
