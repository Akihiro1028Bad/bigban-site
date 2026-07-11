import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatCtr,
  formatDelta,
  formatPosition,
  formatScheduledAt,
} from "./articleMetricsView";

describe("formatCtr", () => {
  it("0..1 を % (小数第1位)で整形", () => {
    expect(formatCtr(0.05)).toBe("5%");
    expect(formatCtr(0.053)).toBe("5.3%");
    expect(formatCtr(0)).toBe("0%");
  });
});

describe("formatPosition", () => {
  it("平均掲載順位を小数第1位＋位で整形", () => {
    expect(formatPosition(3.25)).toBe("3.3位");
    expect(formatPosition(10)).toBe("10位");
  });
  it("0以下(未取得)は —", () => {
    expect(formatPosition(0)).toBe("—");
  });
});

describe("formatCount", () => {
  it("1000未満はそのまま", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
  });
  it("1000以上は k 表記(小数第1位・.0は省く)", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1500)).toBe("1.5k");
    expect(formatCount(2400)).toBe("2.4k");
    expect(formatCount(12345)).toBe("12.3k");
  });
});

describe("formatDelta", () => {
  it("null は未計測表示", () => {
    expect(formatDelta(null)).toEqual({ text: "—", tone: "none" });
  });
  it("0 は横ばい", () => {
    expect(formatDelta(0)).toEqual({ text: "±0%", tone: "flat" });
  });
  it("正は上昇(+付き)", () => {
    expect(formatDelta(20)).toEqual({ text: "+20%", tone: "up" });
  });
  it("負は下降", () => {
    expect(formatDelta(-12.5)).toEqual({ text: "-12.5%", tone: "down" });
  });
});

describe("formatScheduledAt", () => {
  it("UTC・分まで(環境非依存)", () => {
    expect(formatScheduledAt(Date.parse("2099-01-01T09:30:00.000Z"))).toBe("2099-01-01 09:30 UTC");
  });
});
