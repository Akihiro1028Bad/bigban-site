import { describe, it, expect } from "vitest";
import {
  arcAngleDeg,
  arcPathD,
  arcPoint,
  arcTangent,
  SECTION_ARCS,
} from "./sectionArc";

import type { SectionArc } from "./sectionArc";

const ARC: SectionArc = {
  from: { x: 0, y: 100 },
  control: { x: 50, y: 0 },
  to: { x: 100, y: 100 },
};

describe("arcPoint", () => {
  it("t=0 は射出点を返す", () => {
    expect(arcPoint(ARC, 0)).toEqual({ x: 0, y: 100 });
  });

  it("t=1 は着地点を返す", () => {
    expect(arcPoint(ARC, 1)).toEqual({ x: 100, y: 100 });
  });

  it("t=0.5 は 2 次ベジェの頂点（制御点へ半分引き寄せた点）を返す", () => {
    // 0.25*from + 0.5*control + 0.25*to
    expect(arcPoint(ARC, 0.5)).toEqual({ x: 50, y: 50 });
  });
});

describe("arcPathD", () => {
  it("viewBox 0 0 100 100 前提の 2 次ベジェ path を組み立てる", () => {
    expect(arcPathD(ARC)).toBe("M 0 100 Q 50 0 100 100");
  });
});

describe("arcTangent", () => {
  it("t=0 は射出点から制御点への向き、t=1 は制御点から着地点への向きを返す", () => {
    expect(arcTangent(ARC, 0)).toEqual({ x: 100, y: -200 });
    expect(arcTangent(ARC, 1)).toEqual({ x: 100, y: 200 });
  });
});

describe("arcAngleDeg", () => {
  it("縦横が同倍率なら % 座標のままの角度になる", () => {
    // 頂点(t=0.5)の接線は水平。
    expect(arcAngleDeg(ARC, 0.5, 100, 100)).toBe(0);
    // t=0 の接線 (100, -200) は上向き 63.4 度。
    expect(arcAngleDeg(ARC, 0, 100, 100)).toBeCloseTo(-63.43, 2);
  });

  it("帯を横長に伸ばすほど角度は浅くなる（非等比の伸長を角度へ反映する）", () => {
    // 弧は幅 100%・高さ 80-144px の帯へ非等比に伸びるので、
    // % 座標のままの角度で回すと尾が弧から外れる。
    const wide = arcAngleDeg(ARC, 0, 800, 100);
    const square = arcAngleDeg(ARC, 0, 100, 100);
    expect(Math.abs(wide)).toBeLessThan(Math.abs(square));
    expect(wide).toBeCloseTo(-14.04, 2);
  });
});

describe("SECTION_ARCS", () => {
  it("apex は山なり、descent は左上から右下へ落ちる", () => {
    expect(arcPoint(SECTION_ARCS.apex, 0.5).y).toBeLessThan(
      SECTION_ARCS.apex.from.y,
    );
    expect(SECTION_ARCS.descent.to.y).toBeGreaterThan(
      SECTION_ARCS.descent.from.y,
    );
  });

  it("どの弧も左端から右端まで届き、viewBox の縦方向にも収まる", () => {
    // 区切り帯は overflow-hidden なので、はみ出すと弧が切れる。
    for (const arc of Object.values(SECTION_ARCS)) {
      expect(arc.from.x).toBe(0);
      expect(arc.to.x).toBe(100);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const { y } = arcPoint(arc, t);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });
});
