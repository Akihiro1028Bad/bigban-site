import { describe, it, expect } from "vitest";
import { COURT_PRICES } from "@/constants/pricing";
import { PBT_CLUB_MONTHLY_FEE_YEN } from "@/constants/pbtClub";
import {
  buildMonthlyComparison,
  buildRateRows,
  formatYen,
  parseYen,
  summarizeRates,
} from "./breakeven";

describe("parseYen / formatYen", () => {
  it("¥4,980 を 4980 に変換する", () => {
    expect(parseYen("¥4,980")).toBe(4980);
  });

  it("数字が無ければ例外を投げる", () => {
    expect(() => parseYen("無料")).toThrow("金額を読み取れません");
  });

  it("¥ とカンマ区切りで整形する", () => {
    expect(formatYen(31920)).toBe("¥31,920");
  });
});

describe("buildRateRows(確定料金)", () => {
  const rows = buildRateRows(COURT_PRICES, PBT_CLUB_MONTHLY_FEE_YEN);

  it("同額の時間帯は平日・土日祝をまたいで1行にまとまり、出現順を保つ", () => {
    expect(rows.map((r) => [r.normalYen, r.memberYen])).toEqual([
      [4980, 3500],
      [5980, 4200],
      [7980, 5600],
      [3980, 2800],
    ]);
  });

  it("差額と損益分岐を計算する(整数は切り上げ・小数は1桁で補足できる)", () => {
    expect(rows.map((r) => r.savingPerHourYen)).toEqual([1480, 1780, 2380, 1180]);
    expect(rows.map((r) => r.breakEvenHours)).toEqual([7, 6, 5, 9]);
    expect(rows.map((r) => r.exactBreakEvenHours.toFixed(1))).toEqual([
      "6.8",
      "5.6",
      "4.2",
      "8.5",
    ]);
  });

  it("時間帯を平日・土日祝に振り分ける", () => {
    expect(rows[0].weekdaySlots).toEqual(["6:00-9:00"]);
    expect(rows[0].weekendSlots).toEqual([]);
    expect(rows[2].weekdaySlots).toEqual(["17:00-23:00"]);
    expect(rows[2].weekendSlots).toEqual([
      "6:00-9:00",
      "9:00-17:00",
      "17:00-23:00",
    ]);
    // 土日祝の深夜は平日 9-17 時と同額なので同じ行に入る
    expect(rows[1].weekdaySlots).toEqual(["9:00-17:00"]);
    expect(rows[1].weekendSlots).toEqual(["23:00-25:00"]);
    expect(rows[3].weekdaySlots).toEqual(["23:00-25:00"]);
    expect(rows[3].weekendSlots).toEqual([]);
  });

  it("損益分岐がちょうど整数ならその時間を返す(切り上げで増えない)", () => {
    const [row] = buildRateRows(
      [
        {
          timeSlot: "6:00-9:00",
          weekday: "¥7,000",
          weekdayMember: "¥5,000",
          weekend: "¥7,000",
          weekendMember: "¥5,000",
        },
      ],
      10000,
    );
    expect(row.breakEvenHours).toBe(5);
  });

  it("会員料金が通常料金以上なら例外を投げる(料金表の取り違えを検知)", () => {
    expect(() =>
      buildRateRows(
        [
          {
            timeSlot: "6:00-9:00",
            weekday: "¥5,000",
            weekdayMember: "¥5,000",
            weekend: "¥5,000",
            weekendMember: "¥5,000",
          },
        ],
        10000,
      ),
    ).toThrow("会員料金が通常料金以上");
  });
});

describe("buildMonthlyComparison(公開記事の比較例と一致)", () => {
  it.each([
    [4, 31920, 32400, -480, "normal"],
    [5, 39900, 38000, 1900, "member"],
    [8, 63840, 54800, 9040, "member"],
  ] as const)("%i時間", (hours, normal, member, diff, cheaper) => {
    expect(buildMonthlyComparison(hours, 7980, 5600, 10000)).toEqual({
      hours,
      normalTotalYen: normal,
      memberTotalYen: member,
      differenceYen: diff,
      cheaper,
    });
  });

  it("同額なら same", () => {
    expect(buildMonthlyComparison(5, 7000, 5000, 10000).cheaper).toBe("same");
  });
});

describe("summarizeRates", () => {
  it("会員料金と差額の最小・最大を返す", () => {
    expect(
      summarizeRates(buildRateRows(COURT_PRICES, PBT_CLUB_MONTHLY_FEE_YEN)),
    ).toEqual({
      memberMinYen: 2800,
      memberMaxYen: 5600,
      savingMinYen: 1180,
      savingMaxYen: 2380,
    });
  });
});
