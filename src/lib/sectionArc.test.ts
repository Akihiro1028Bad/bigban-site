import { describe, it, expect } from "vitest";
import { arcPathD, arcPoint, SECTION_ARCS } from "./sectionArc";

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
