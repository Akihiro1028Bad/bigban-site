/**
 * メディアライブラリのモック(#proto・画像)。
 *
 * 実機は microCMS のメディア(MANAGEMENT API)から一覧するが、ここでは色相だけの
 * ダミー素材。アイキャッチ/本文画像の差し替え時に「選ぶ」体験を見せるためのもの。
 */
export interface MediaItem {
  id: string;
  label: string;
  hue: number;
  kind: "mascot" | "minimal" | "diagram" | "photo";
}

export const MOCK_MEDIA: MediaItem[] = [
  { id: "m1", label: "宇宙人マスコット・コート", hue: 218, kind: "mascot" },
  { id: "m2", label: "宇宙人マスコット・笑顔", hue: 268, kind: "mascot" },
  { id: "m3", label: "ミニマル幾何・ブルー", hue: 205, kind: "minimal" },
  { id: "m4", label: "ミニマル幾何・グリーン", hue: 150, kind: "minimal" },
  { id: "m5", label: "コートの広さ図解", hue: 40, kind: "diagram" },
  { id: "m6", label: "パドル比較図", hue: 320, kind: "diagram" },
  { id: "m7", label: "ナイター照明イメージ", hue: 230, kind: "photo" },
  { id: "m8", label: "カフェカウンター", hue: 28, kind: "photo" },
  { id: "m9", label: "宇宙人マスコット・サーブ", hue: 290, kind: "mascot" },
  { id: "m10", label: "ミニマル幾何・アンバー", hue: 48, kind: "minimal" },
];

export const MEDIA_KIND_LABEL: Record<MediaItem["kind"], string> = {
  mascot: "マスコット",
  minimal: "ミニマル",
  diagram: "図解",
  photo: "イメージ",
};
