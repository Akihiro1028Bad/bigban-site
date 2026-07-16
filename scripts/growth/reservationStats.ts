/** 小標本ガードレール用の統計ユーティリティ(依存なし・純ロジック)。 */

const Z = 1.96;

export function wilsonInterval(
  successes: number,
  n: number
): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = Z * Z;
  const denominator = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    low: Math.max(0, (center - margin) / denominator),
    high: Math.min(1, (center + margin) / denominator),
  };
}

export function poissonLowerTailP(observed: number, mean: number): number {
  if (mean <= 0) return 1;
  let term = Math.exp(-mean);
  let sum = term;
  for (let count = 1; count <= observed; count += 1) {
    term *= mean / count;
    sum += term;
  }
  return Math.min(1, sum);
}

export function poissonUpperTailP(observed: number, mean: number): number {
  if (mean <= 0) return observed <= 0 ? 1 : 0;
  if (observed <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - poissonLowerTailP(observed - 1, mean)));
}

export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
