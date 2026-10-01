"use client";

import { useMemo, useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

// タブを開きっぱなしで日をまたいだ場合に備え、タブに戻ったとき(visibilitychange)に
// スナップショットを取り直させる。購読するのはこのイベントだけ。
function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

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
