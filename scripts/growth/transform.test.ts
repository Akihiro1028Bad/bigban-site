// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  parseGa4Report,
  parseGscReport,
  computeDeltaPct,
  mergeRows,
  type Ga4Report,
  type GscReport,
} from "./transform";

describe("parseGa4Report", () => {
  it("ディメンションありのレポートを正規化行に変換する", () => {
    const report: Ga4Report = {
      dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }],
      metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }],
      rows: [
        {
          dimensionValues: [{ value: "Organic Search" }],
          metricValues: [{ value: "300" }, { value: "250" }],
        },
        {
          dimensionValues: [{ value: "Direct" }],
          metricValues: [{ value: "120" }, { value: "100" }],
        },
      ],
    };

    expect(parseGa4Report(report)).toEqual([
      { keys: ["Organic Search"], metrics: { sessions: 300, activeUsers: 250 } },
      { keys: ["Direct"], metrics: { sessions: 120, activeUsers: 100 } },
    ]);
  });

  it("ディメンションなし(サマリー)は keys 空配列の単一行になる", () => {
    const report: Ga4Report = {
      metricHeaders: [{ name: "sessions" }],
      rows: [{ metricValues: [{ value: "423" }] }],
    };

    expect(parseGa4Report(report)).toEqual([
      { keys: [], metrics: { sessions: 423 } },
    ]);
  });

  it("小数の指標(エンゲージメント率など)も数値化する", () => {
    const report: Ga4Report = {
      metricHeaders: [{ name: "engagementRate" }],
      rows: [{ metricValues: [{ value: "0.6234" }] }],
    };

    expect(parseGa4Report(report)[0].metrics.engagementRate).toBeCloseTo(0.6234);
  });

  it("rows が無い場合は空配列を返す", () => {
    const report: Ga4Report = { metricHeaders: [{ name: "sessions" }] };
    expect(parseGa4Report(report)).toEqual([]);
  });

  it("metricHeaders が無い場合は metrics 空オブジェクトの行になる", () => {
    const report: Ga4Report = {
      rows: [{ dimensionValues: [{ value: "Direct" }] }],
    };
    expect(parseGa4Report(report)).toEqual([{ keys: ["Direct"], metrics: {} }]);
  });

  it("metricValues が不足/欠損している指標は 0 として扱う", () => {
    const report: Ga4Report = {
      metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }],
      rows: [
        { metricValues: [{ value: "5" }] }, // activeUsers が不足
        {}, // metricValues 自体が欠損
      ],
    };
    expect(parseGa4Report(report)).toEqual([
      { keys: [], metrics: { sessions: 5, activeUsers: 0 } },
      { keys: [], metrics: { sessions: 0, activeUsers: 0 } },
    ]);
  });
});

describe("parseGscReport", () => {
  it("ディメンションありの行を clicks/impressions/ctr/position 付きで正規化する", () => {
    const report: GscReport = {
      rows: [
        {
          keys: ["pickleball 福岡"],
          clicks: 12,
          impressions: 340,
          ctr: 0.0353,
          position: 8.2,
        },
        {
          keys: ["ピックルボール 体験"],
          clicks: 5,
          impressions: 90,
          ctr: 0.0556,
          position: 4.1,
        },
      ],
    };

    expect(parseGscReport(report)).toEqual([
      {
        keys: ["pickleball 福岡"],
        metrics: { clicks: 12, impressions: 340, ctr: 0.0353, position: 8.2 },
      },
      {
        keys: ["ピックルボール 体験"],
        metrics: { clicks: 5, impressions: 90, ctr: 0.0556, position: 4.1 },
      },
    ]);
  });

  it("ディメンションなし(サマリー)は keys 空配列の単一行になる", () => {
    const report: GscReport = {
      rows: [{ clicks: 89, impressions: 5230, ctr: 0.017, position: 12.4 }],
    };

    expect(parseGscReport(report)).toEqual([
      {
        keys: [],
        metrics: { clicks: 89, impressions: 5230, ctr: 0.017, position: 12.4 },
      },
    ]);
  });

  it("rows が無い場合は空配列を返す", () => {
    expect(parseGscReport({})).toEqual([]);
  });

  it("欠損した指標は 0 として扱う", () => {
    const report: GscReport = { rows: [{ keys: ["x"], clicks: 3 }] };
    expect(parseGscReport(report)[0].metrics).toEqual({
      clicks: 3,
      impressions: 0,
      ctr: 0,
      position: 0,
    });
  });

  it("全指標が欠損した行はすべて 0 になる", () => {
    const report: GscReport = { rows: [{ keys: ["y"] }] };
    expect(parseGscReport(report)[0].metrics).toEqual({
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    });
  });
});

describe("computeDeltaPct", () => {
  it("増加率を小数第1位で返す", () => {
    expect(computeDeltaPct(110, 100)).toBe(10);
    expect(computeDeltaPct(423, 377)).toBe(12.2);
  });

  it("減少はマイナスで返す", () => {
    expect(computeDeltaPct(80, 100)).toBe(-20);
  });

  it("前週が 0 のときは算出不能として null を返す", () => {
    expect(computeDeltaPct(50, 0)).toBeNull();
    expect(computeDeltaPct(0, 0)).toBeNull();
  });
});

describe("mergeRows", () => {
  it("current と prior をキーで突き合わせ前週比を付ける", () => {
    const current = [
      { keys: ["Organic Search"], metrics: { sessions: 300 } },
      { keys: ["Direct"], metrics: { sessions: 120 } },
    ];
    const prior = [
      { keys: ["Organic Search"], metrics: { sessions: 250 } },
      { keys: ["Direct"], metrics: { sessions: 150 } },
    ];

    expect(mergeRows(current, prior)).toEqual([
      {
        keys: ["Organic Search"],
        metrics: { sessions: { current: 300, prior: 250, deltaPct: 20 } },
      },
      {
        keys: ["Direct"],
        metrics: { sessions: { current: 120, prior: 150, deltaPct: -20 } },
      },
    ]);
  });

  it("prior に存在しないキーは prior=0・deltaPct=null として扱う", () => {
    const current = [{ keys: ["New Channel"], metrics: { sessions: 40 } }];
    const prior: typeof current = [];

    expect(mergeRows(current, prior)).toEqual([
      {
        keys: ["New Channel"],
        metrics: { sessions: { current: 40, prior: 0, deltaPct: null } },
      },
    ]);
  });

  it("current の行順を保持する", () => {
    const current = [
      { keys: ["B"], metrics: { sessions: 10 } },
      { keys: ["A"], metrics: { sessions: 20 } },
    ];
    const prior = [
      { keys: ["A"], metrics: { sessions: 5 } },
      { keys: ["B"], metrics: { sessions: 5 } },
    ];

    expect(mergeRows(current, prior).map((r) => r.keys[0])).toEqual(["B", "A"]);
  });

  it("複数キー(query×page)でも突き合わせる", () => {
    const current = [
      { keys: ["pickleball", "/lp"], metrics: { clicks: 10 } },
    ];
    const prior = [{ keys: ["pickleball", "/lp"], metrics: { clicks: 8 } }];

    expect(mergeRows(current, prior)[0].metrics.clicks).toEqual({
      current: 10,
      prior: 8,
      deltaPct: 25,
    });
  });

  it("既定ではpriorにだけ存在する行を今週行へ混入させない", () => {
    const current = [
      { keys: ["/news/a", "line_click"], metrics: { keyEvents: 2 } },
    ];
    const prior = [
      { keys: ["/news/a", "line_click"], metrics: { keyEvents: 1 } },
      { keys: ["/news/a", "reservation_click"], metrics: { keyEvents: 5 } },
    ];

    expect(mergeRows(current, prior)).toEqual([
      {
        keys: ["/news/a", "line_click"],
        metrics: { keyEvents: { current: 2, prior: 1, deltaPct: 100 } },
      },
    ]);
  });

  it("CTA用optionではprior-onlyイベントをcurrent=0・-100%で残す", () => {
    const current = [
      { keys: ["/news/a", "line_click"], metrics: { keyEvents: 2 } },
    ];
    const prior = [
      { keys: ["/news/a", "line_click"], metrics: { keyEvents: 1 } },
      { keys: ["/news/a", "reservation_click"], metrics: { keyEvents: 5 } },
    ];

    expect(mergeRows(current, prior, { includePriorOnly: true })).toEqual([
      {
        keys: ["/news/a", "line_click"],
        metrics: { keyEvents: { current: 2, prior: 1, deltaPct: 100 } },
      },
      {
        keys: ["/news/a", "reservation_click"],
        metrics: { keyEvents: { current: 0, prior: 5, deltaPct: -100 } },
      },
    ]);
  });
});
