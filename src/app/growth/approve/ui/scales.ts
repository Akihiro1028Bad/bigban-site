/**
 * 承認画面の表示スケール純ロジック(色しきい値・円弧/折れ線の幾何)。
 * proto ui.tsx(#proto) の ScoreBar/RingScore/Sparkline から分離。
 */

/** 優先度スコアバーの色トークン(0-100)。85+ green / 70+ accent / 未満 text-3。 */
export function scoreBarTone(score: number): string {
  return score >= 85 ? "var(--p-green)" : score >= 70 ? "var(--p-accent)" : "var(--p-text-3)";
}

/** 円形スコアの色トークン(0-100)。85+ green / 70+ accent / 未満 amber。 */
export function ringTone(value: number): string {
  return value >= 85 ? "var(--p-green)" : value >= 70 ? "var(--p-accent)" : "var(--p-amber)";
}

export interface RingGeometry {
  r: number;
  circumference: number;
  dashOffset: number;
}

/** 円形スコアの幾何。半径=(size-8)/2・周長=2πr・dashOffset=周長*(1-value/100)。 */
export function ringGeometry(value: number, size: number): RingGeometry {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  return { r, circumference, dashOffset: circumference * (1 - value / 100) };
}

/** スパークラインの色トークン。 */
export function sparkColor(up: boolean): string {
  return up ? "var(--p-green)" : "var(--p-red)";
}

export interface SparklineGeometry {
  line: string;
  area: string;
  last: { x: number; y: number };
}

/** スパークラインの SVG パス幾何。点が2未満なら null。span は最低1で 0 除算回避。 */
export function sparklineGeometry(
  data: readonly number[],
  width: number,
  height: number,
): SparklineGeometry | null {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pad = 3;
  const stepX = (width - pad * 2) / (data.length - 1);
  const pts = data.map((v, i): [number, number] => [
    pad + i * stepX,
    pad + (height - pad * 2) * (1 - (v - min) / span),
  ]);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const lastPt = pts[pts.length - 1];
  const area = `${line} L${lastPt[0].toFixed(1)} ${height - pad} L${pts[0][0].toFixed(1)} ${height - pad} Z`;
  return { line, area, last: { x: lastPt[0], y: lastPt[1] } };
}
