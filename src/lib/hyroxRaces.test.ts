import { afterEach, describe, it, expect, vi } from "vitest";

import { HYROX_RACES } from "@/constants/hyroxRaces";
import type { HyroxRace } from "@/constants/hyroxRaces";

import {
  currentJstDayStartMs,
  currentTimeMs,
  formatRaceDates,
  getNextHyroxRace,
  getRaceStatus,
} from "./hyroxRaces";

const OSAKA = HYROX_RACES[0];
const NAGOYA = HYROX_RACES[1];

// JST の日時から epoch ミリ秒を作る
const jst = (iso: string): number => new Date(`${iso}+09:00`).getTime();

describe("HYROX_RACES(データの整合)", () => {
  it("公式で確認した大阪・名古屋の日程を持つ", () => {
    expect(OSAKA).toMatchObject({
      id: "osaka2027",
      startDate: "2027-01-21",
      endDate: "2027-01-25",
      officialUrl: "https://hyrox.com/event/byd-hyrox-osaka/",
    });
    expect(NAGOYA).toMatchObject({
      id: "nagoya2027",
      startDate: "2027-04-16",
      endDate: "2027-04-18",
      officialUrl: "https://hyrox.com/event/hyrox-nagoya/",
    });
  });

  it("日付は YYYY-MM-DD・開始≦終了・開始日の昇順・id 重複なし", () => {
    const ids = new Set<string>();
    HYROX_RACES.forEach((race, index) => {
      expect(race.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(race.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(race.startDate <= race.endDate).toBe(true);
      if (index > 0) {
        expect(HYROX_RACES[index - 1].startDate < race.startDate).toBe(true);
      }
      ids.add(race.id);
    });
    expect(ids.size).toBe(HYROX_RACES.length);
  });
});

describe("getNextHyroxRace", () => {
  it("大阪より前は大阪を返す", () => {
    expect(getNextHyroxRace(jst("2026-10-01T12:00:00"))?.id).toBe("osaka2027");
  });

  it("大阪最終日 JST 23:59:59 はまだ大阪", () => {
    expect(getNextHyroxRace(jst("2027-01-25T23:59:59"))?.id).toBe("osaka2027");
  });

  it("大阪最終日の翌日 JST 0:00 ちょうどで名古屋に切り替わる", () => {
    expect(getNextHyroxRace(jst("2027-01-26T00:00:00"))?.id).toBe("nagoya2027");
  });

  it("名古屋最終日の翌日 JST 0:00 以降は null(全大会終了)", () => {
    expect(getNextHyroxRace(jst("2027-04-18T23:59:59"))?.id).toBe("nagoya2027");
    expect(getNextHyroxRace(jst("2027-04-19T00:00:00"))).toBeNull();
  });

  it("races を渡せばそれを使う(空なら null)", () => {
    const only: readonly HyroxRace[] = [NAGOYA];
    expect(getNextHyroxRace(jst("2026-10-01T00:00:00"), only)?.id).toBe(
      "nagoya2027",
    );
    expect(getNextHyroxRace(jst("2026-10-01T00:00:00"), [])).toBeNull();
  });
});

describe("getRaceStatus", () => {
  it("開始の前日は残り1日(JST 暦日差)", () => {
    expect(getRaceStatus(OSAKA, jst("2027-01-20T23:59:59"))).toEqual({
      kind: "upcoming",
      daysUntil: 1,
    });
  });

  it("2026-10-01 時点の大阪は残り112日", () => {
    expect(getRaceStatus(OSAKA, jst("2026-10-01T09:00:00"))).toEqual({
      kind: "upcoming",
      daysUntil: 112,
    });
  });

  it("開始日 JST 0:00 から開催中", () => {
    expect(getRaceStatus(OSAKA, jst("2027-01-21T00:00:00"))).toEqual({
      kind: "ongoing",
    });
  });

  it("最終日 JST 23:59:59 もまだ開催中", () => {
    expect(getRaceStatus(OSAKA, jst("2027-01-25T23:59:59"))).toEqual({
      kind: "ongoing",
    });
  });
});

describe("formatRaceDates", () => {
  it("ja: 年月日と曜日つきの範囲", () => {
    expect(formatRaceDates(OSAKA, "ja")).toBe("2027年1月21日(木)～25日(月)");
  });

  it("en: 曜日つきの範囲", () => {
    expect(formatRaceDates(OSAKA, "en")).toBe("Thu, Jan 21 – Mon, Jan 25, 2027");
  });

  it("開始日と終了日が同じなら1日だけ表示する", () => {
    const oneDay: HyroxRace = {
      ...OSAKA,
      startDate: "2027-01-21",
      endDate: "2027-01-21",
    };
    expect(formatRaceDates(oneDay, "ja")).toBe("2027年1月21日(木)");
    expect(formatRaceDates(oneDay, "en")).toBe("Thu, Jan 21, 2027");
  });

  it("月をまたぐ場合は終了側に月を出す", () => {
    const crossMonth: HyroxRace = {
      ...OSAKA,
      startDate: "2027-01-29",
      endDate: "2027-02-01",
    };
    expect(formatRaceDates(crossMonth, "ja")).toBe("2027年1月29日(金)～2月1日(月)");
    expect(formatRaceDates(crossMonth, "en")).toBe(
      "Fri, Jan 29 – Mon, Feb 1, 2027",
    );
  });

  it("年をまたぐ場合は両側に年を出す", () => {
    const crossYear: HyroxRace = {
      ...OSAKA,
      startDate: "2026-12-31",
      endDate: "2027-01-02",
    };
    expect(formatRaceDates(crossYear, "ja")).toBe(
      "2026年12月31日(木)～2027年1月2日(土)",
    );
    expect(formatRaceDates(crossYear, "en")).toBe(
      "Thu, Dec 31, 2026 – Sat, Jan 2, 2027",
    );
  });
});

describe("現在時刻の取得", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("currentTimeMs は現在の epoch ミリ秒を返す", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(jst("2026-10-01T09:00:00"));
    expect(currentTimeMs()).toBe(jst("2026-10-01T09:00:00"));
  });

  it("currentJstDayStartMs は JST 暦日の始まりを返し、同じ日のあいだ変わらない", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(jst("2026-10-01T00:00:00"));
    expect(currentJstDayStartMs()).toBe(jst("2026-10-01T00:00:00"));
    vi.setSystemTime(jst("2026-10-01T23:59:59"));
    expect(currentJstDayStartMs()).toBe(jst("2026-10-01T00:00:00"));
    vi.setSystemTime(jst("2026-10-02T00:00:00"));
    expect(currentJstDayStartMs()).toBe(jst("2026-10-02T00:00:00"));
  });

  it("JST 暦日の始まりでも次の大会・残り日数は同じ結果になる", () => {
    const now = jst("2026-10-01T17:30:00");
    const dayStart = jst("2026-10-01T00:00:00");
    expect(getNextHyroxRace(dayStart)).toEqual(getNextHyroxRace(now));
    expect(getRaceStatus(OSAKA, dayStart)).toEqual(getRaceStatus(OSAKA, now));
  });
});
