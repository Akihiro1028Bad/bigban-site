/**
 * /hyrox の NEXT RACE に出す HYROX 公式大会の一覧。
 * 日付は開催地(日本)の暦日(JST, YYYY-MM-DD)。大会を足す・直すのはここだけ。
 * 日程は HYROX 公式イベントページで確認すること(2026-10-01 確認)。
 * 開始日の昇順に並べる。`id` は messages の `HyroxPage.nextRace.races.<id>` のキー。
 */
export interface HyroxRace {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly officialUrl: string;
}

export const HYROX_RACES: readonly HyroxRace[] = [
  {
    id: "osaka2027",
    startDate: "2027-01-21",
    endDate: "2027-01-25",
    officialUrl: "https://hyrox.com/event/byd-hyrox-osaka/",
  },
  {
    id: "nagoya2027",
    startDate: "2027-04-16",
    endDate: "2027-04-18",
    officialUrl: "https://hyrox.com/event/hyrox-nagoya/",
  },
];
