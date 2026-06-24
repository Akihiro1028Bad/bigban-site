export interface HyroxEquipment {
  key: string;
  // 設置台数。null は台数表記なし（重量違いを複数常備＝「一式」）。
  quantity: number | null;
  // HYROX 公式の正規ブランド（エルゴは Concept2、ファンクショナル器具は Centr）。
  brand: "Concept2" | "Centr";
}

// 設置器具のスペック一覧データ。名称・仕様(メーカー/重量)は i18n 側に持つ。
export const HYROX_EQUIPMENT: readonly HyroxEquipment[] = [
  { key: "skierg", quantity: 2, brand: "Concept2" },
  { key: "rowing", quantity: 2, brand: "Concept2" },
  { key: "sled", quantity: 2, brand: "Centr" },
  { key: "kettlebell", quantity: null, brand: "Centr" },
  { key: "wallball", quantity: null, brand: "Centr" },
  { key: "sandbag", quantity: null, brand: "Centr" },
];

// 施設写真カルーセルの画像（空間・器具レーン等の雰囲気カット）。
export const FACILITY_PHOTOS: readonly string[] = [
  "/images/hyrox/facility-1.jpg",
  "/images/hyrox/facility-2.jpg",
  "/images/hyrox/facility-3.jpg",
  "/images/hyrox/facility-4.jpg",
];
