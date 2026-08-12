/**
 * セクション区切りに引く弧（軌道の一部）の座標計算。
 *
 * 弧は 2 次ベジェ 1 本で表す。座標系はコンテナに対するパーセント（0-100）で、
 * SVG は viewBox="0 0 100 100" + preserveAspectRatio="none" で同じ空間を共有する。
 *
 * 弧の上を流れる光点だけは HTML 要素として left/top のパーセントで置く。
 * SVG を非等比に伸ばしても光点が楕円に潰れないようにするため。
 */

export interface ArcPoint {
  x: number;
  y: number;
}

export interface SectionArc {
  /** 射出点 */
  from: ArcPoint;
  /** 制御点（頂点の引き上げ役） */
  control: ArcPoint;
  /** 着地点 */
  to: ArcPoint;
}

/** 2 次ベジェ上の点。t は 0-1。 */
export function arcPoint(arc: SectionArc, t: number): ArcPoint {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;

  return {
    x: a * arc.from.x + b * arc.control.x + c * arc.to.x,
    y: a * arc.from.y + b * arc.control.y + c * arc.to.y,
  };
}

/** SVG の path d 属性。viewBox 0 0 100 100 前提。 */
export function arcPathD(arc: SectionArc): string {
  return `M ${arc.from.x} ${arc.from.y} Q ${arc.control.x} ${arc.control.y} ${arc.to.x} ${arc.to.y}`;
}

export type SectionArcVariant = "apex" | "descent";

/**
 * 区切りの弧プリセット。
 *
 * どちらも制御点は viewBox 内へ収め、頂点・着地点が帯の外へ出ないようにしている
 * （帯は overflow-hidden なので、はみ出すと弧が切れる）。
 */
export const SECTION_ARCS: Record<SectionArcVariant, SectionArc> = {
  /** 山なりの弧。水平線の代わりに軌道の一部を引く。 */
  apex: {
    from: { x: 0, y: 92 },
    control: { x: 50, y: 4 },
    to: { x: 100, y: 92 },
  },
  /** 落下側だけを見せる弧。次のセクションへ吸い込まれる区切り。 */
  descent: {
    from: { x: 0, y: 8 },
    control: { x: 58, y: 34 },
    to: { x: 100, y: 96 },
  },
};
