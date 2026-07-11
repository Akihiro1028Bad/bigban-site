/**
 * メディアプレビュー用の SVG 生成(#proto P3b・本番移植・画像)。
 *
 * 実画像の代わりに data-URI の SVG イラストを生成し、スタイル別(マスコット/ミニマル/
 * 図解/イメージ)に描き分ける。`mediaSvgUrl` はメディアプレビュー用途の純関数として残す
 * (実データの一覧は MediaLibraryModal が API 経由で行う)。
 *
 * data-URI 生成は DOM 非依存の純ロジックのため、coverage.exclude しない(100% 対象)。
 */
export type MediaKind = "mascot" | "minimal" | "diagram" | "photo";

function svgBody(kind: MediaKind, hue: number): string {
  const h2 = (hue + 40) % 360;
  const acc = (hue + 180) % 360;
  const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 30%)"/><stop offset="1" stop-color="hsl(${h2} 58% 18%)"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/>`;
  if (kind === "mascot") {
    return `${bg}<circle cx="80" cy="40" r="6" fill="hsl(${acc} 80% 70%)"/><line x1="80" y1="46" x2="80" y2="58" stroke="hsl(${acc} 70% 60%)" stroke-width="2"/><ellipse cx="80" cy="76" rx="30" ry="26" fill="hsl(${h2} 45% 80%)"/><circle cx="70" cy="74" r="6" fill="hsl(${hue} 50% 20%)"/><circle cx="90" cy="74" r="6" fill="hsl(${hue} 50% 20%)"/><circle cx="72" cy="72" r="2" fill="#fff"/><circle cx="92" cy="72" r="2" fill="#fff"/><path d="M72 88 q8 6 16 0" stroke="hsl(${hue} 50% 25%)" stroke-width="2" fill="none"/>`;
  }
  if (kind === "minimal") {
    return `${bg}<circle cx="54" cy="60" r="26" fill="hsl(${acc} 70% 60%)" opacity="0.9"/><rect x="78" y="40" width="40" height="40" rx="8" fill="hsl(${h2} 55% 70%)" opacity="0.85"/><circle cx="110" cy="84" r="12" fill="hsl(${hue} 60% 85%)" opacity="0.7"/>`;
  }
  if (kind === "diagram") {
    return `${bg}<rect x="20" y="44" width="32" height="22" rx="4" fill="hsl(${h2} 40% 82%)"/><rect x="64" y="44" width="32" height="22" rx="4" fill="hsl(${h2} 40% 82%)"/><rect x="108" y="44" width="32" height="22" rx="4" fill="hsl(${h2} 40% 82%)"/><path d="M52 55 h12 M96 55 h12" stroke="hsl(${acc} 70% 70%)" stroke-width="2"/><text x="80" y="92" font-size="11" fill="hsl(${h2} 30% 88%)" text-anchor="middle" font-family="sans-serif">イメージ図</text>`;
  }
  return `${bg}<circle cx="120" cy="36" r="16" fill="hsl(${acc} 80% 72%)" opacity="0.85"/><path d="M0 96 q40 -24 80 -4 q40 20 80 -2 V120 H0 Z" fill="hsl(${h2} 50% 30%)" opacity="0.7"/><path d="M0 104 q40 -16 80 0 q40 16 80 2 V120 H0 Z" fill="hsl(${hue} 55% 22%)"/>`;
}

export function mediaSvgUrl(kind: MediaKind, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120">${svgBody(kind, hue)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
