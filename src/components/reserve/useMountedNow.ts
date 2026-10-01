"use client";

import { useMemo, useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

// 購読する外部ストアは無い。サーバー描画/ハイドレーション時は null、
// その後クライアントで現在時刻に切り替えるためだけに useSyncExternalStore を使う。
const subscribe = () => () => {};

// 1分単位に丸めて、同じ分の間は同じスナップショット(無限再描画を避ける)。
const getClientMinute = (): number | null => Math.floor(Date.now() / MINUTE_MS);
const getServerMinute = (): number | null => null;

/**
 * マウント後に現在時刻を返す。サーバー描画とハイドレーション時は null。
 * 日付つき URL をキャッシュされたページに焼き込まないため、日付はクライアントで決める。
 */
export function useMountedNow(): Date | null {
  const minute = useSyncExternalStore(
    subscribe,
    getClientMinute,
    getServerMinute,
  );
  return useMemo(
    () => (minute === null ? null : new Date(minute * MINUTE_MS)),
    [minute],
  );
}
