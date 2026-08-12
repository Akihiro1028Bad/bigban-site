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

/**
 * 2 次ベジェの接線ベクトル B'(t)。t は 0-1。
 *
 * 前後 2 点の差分を取る代わりに導関数をそのまま使う（差分の極限そのものなので
 * 誤差もサンプル幅の調整も要らない）。
 */
export function arcTangent(arc: SectionArc, t: number): ArcPoint {
  const u = 1 - t;

  return {
    x: 2 * u * (arc.control.x - arc.from.x) + 2 * t * (arc.to.x - arc.control.x),
    y: 2 * u * (arc.control.y - arc.from.y) + 2 * t * (arc.to.y - arc.control.y),
  };
}

/**
 * 実表示上の接線角度（度）。
 *
 * 弧の座標は % だが、区切り帯は幅と高さが別倍率で伸びる
 * （幅は画面いっぱい・高さは 80-144px 固定）。% 座標のまま atan2 を取ると
 * 角度が縦に誇張され、ストリークの尾が弧から外れて見える。
 * 接線を実寸へ直してから角度を取ることでこれを防ぐ。
 */
export function arcAngleDeg(
  arc: SectionArc,
  t: number,
  width: number,
  height: number,
): number {
  const tangent = arcTangent(arc, t);

  return (Math.atan2(tangent.y * height, tangent.x * width) * 180) / Math.PI;
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
