"use client";

import { useEffect, useState } from "react";

import { PULL_STALE_THRESHOLD_MS, pullStaleView } from "./pullStale";

interface StaleNoticeProps {
  /** 依頼時刻(ms)。null は依頼時刻なし=非表示。 */
  requestedAtMs: number | null;
  /** 依頼中/処理中など「別PCの応答待ち」のあいだ true。 */
  busy: boolean;
}

/**
 * pull型(依頼→別PCが処理→提示)の経過時間と滞留警告を表示する小コンポーネント(#C2 UI)。
 *
 * busy のあいだ自前で時刻を刻み(30秒)、依頼からの経過を出す。しきい値(15分=reaper と同じ)を
 * 超えたら「自宅PCの巡回が止まっている疑い」を控えめに警告し、PC 停止の沈黙をユーザー側でも可視化する。
 * 判定の純ロジックは pullStale.ts。本体は薄い DOM+タイマー結線のためカバレッジ除外。
 */
export function StaleNotice({ requestedAtMs, busy }: StaleNoticeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [busy]);

  const view = pullStaleView(requestedAtMs, now, PULL_STALE_THRESHOLD_MS, busy);
  if (!view) return null;

  if (!view.stuck) {
    return <p className="mt-1 text-xs text-gray-500">依頼から約{view.minutes}分経過</p>;
  }
  return (
    <p role="status" className="mt-1 text-xs font-medium text-amber-700">
      依頼から約{view.minutes}分。自宅PCの巡回が止まっていないか確認してください。
    </p>
  );
}
