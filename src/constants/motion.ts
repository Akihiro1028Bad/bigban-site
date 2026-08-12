// Framer Motion 共通イージング（cubic-bezier）。各セクションのリビール演出で共有する。
export const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * リビール演出の initial 値。
 *
 * prefers-reduced-motion のときは false を返す。Framer Motion は initial={false} で
 * 初期状態を飛ばして完成形から描くため、要素を消さずに「動かないだけ」にできる。
 */
export function revealInitial<T extends object>(
  // useReducedMotion() は判定前に null を返しうるので、そのまま受けられるようにする。
  prefersReducedMotion: boolean | null,
  hidden: T,
): T | false {
  return prefersReducedMotion ? false : hidden;
}
