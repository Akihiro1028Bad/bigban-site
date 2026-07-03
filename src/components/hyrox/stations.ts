export interface HyroxStation {
  number: string;
  key: string;
  image: string;
}

// 各種目に割り当てるアクション写真（key と 1:1 で対応）。
// 配列インデックスではなく key 起点で明示的に紐づけることで、
// 並び替え時の取り違えを防ぐ。
const STATION_IMAGE_BY_KEY: Record<string, string> = {
  station01: "/images/hyrox/action-skierg.jpg",
  station02: "/images/hyrox/action-sled-push.jpg",
  station03: "/images/hyrox/action-sled-pull.jpg",
  station04: "/images/hyrox/action-burpee.jpg",
  station05: "/images/hyrox/action-row.jpg",
  station06: "/images/hyrox/action-farmers-carry.jpg",
  station07: "/images/hyrox/action-lunge.jpg",
  station08: "/images/hyrox/action-wallball.jpg",
};

export const HYROX_STATIONS: readonly HyroxStation[] = Array.from(
  { length: 8 },
  (_, i) => {
    const number = String(i + 1).padStart(2, "0");
    const key = `station${number}`;
    return { number, key, image: STATION_IMAGE_BY_KEY[key] };
  },
);
