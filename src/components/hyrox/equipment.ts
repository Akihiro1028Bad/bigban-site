export interface HyroxEquipment {
  key: string;
  // 数量表記。number は台数（×N）、"set" は重量違いを複数常備（一式）、null は表記なし。
  quantity: number | "set" | null;
  // HYROX 公式の正規ブランド（エルゴは Concept2、ファンクショナル器具は Centr）。
  brand: "Concept2" | "Centr";
}

// 設置器具のスペック一覧データ。名称・仕様(メーカー/重量)は i18n 側に持つ。
// ウォールボールはボール本体のみ公式（ターゲットは非公式）のため「一式」表記は付けない。
export const HYROX_EQUIPMENT: readonly HyroxEquipment[] = [
  { key: "skierg", quantity: 2, brand: "Concept2" },
  { key: "rowing", quantity: 2, brand: "Concept2" },
  { key: "sled", quantity: 2, brand: "Centr" },
  { key: "kettlebell", quantity: "set", brand: "Centr" },
  { key: "wallball", quantity: null, brand: "Centr" },
  { key: "sandbag", quantity: "set", brand: "Centr" },
];

// 施設写真カルーセルの画像（空間・器具レーン等の雰囲気カット＋各器具のクローズアップ）。
export const FACILITY_PHOTOS: readonly string[] = [
  "/images/hyrox/facility-1.jpg",
  "/images/hyrox/facility-2.jpg",
  "/images/hyrox/facility-3.jpg",
  "/images/hyrox/facility-4.jpg",
  "/images/hyrox/facility-5.jpg",
  "/images/hyrox/facility-6.jpg",
  "/images/hyrox/facility-7.jpg",
  "/images/hyrox/facility-8.jpg",
  "/images/hyrox/facility-9.jpg",
];
