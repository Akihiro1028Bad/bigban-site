/**
 * 画像指示の型(#proto P3b・本番)。proto types.ts の ImageMode/ImageInstruction を
 * 承認画面本番へ。persist は P3b でセッション state に縮約(AD5-2)、フル persist は P3.5(BE)。
 */

export type ImageMode = "off" | "auto" | "custom";

export interface ImageInstruction {
  mode: ImageMode;
  action?: string;
  isEyecatch?: boolean;
  advancedNote?: string;
}

/** imageIntent が参照する最小のセクション形(見出し＋要約＋現在の指示)。 */
export interface ImageOutlineSection {
  heading: string;
  summary?: string;
  imageInstruction?: ImageInstruction;
}
