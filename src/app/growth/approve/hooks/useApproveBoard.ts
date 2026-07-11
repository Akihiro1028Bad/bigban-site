/**
 * 承認待ち一覧(盤)を React Query で取得・ポーリングするフック(#H7 / D-2)。
 *
 * 既存の fetchPending + pollBoard + setInterval(hasInFlight) を置換する。
 * ポーリングは refetchInterval を「data を見て続行/停止を返す条件関数」で表現し、
 * 生成待ち/生成中がある間だけ回す現挙動を保つ。reconcileDecided(#H10)・完成トースト・
 * 失敗バナー等の副作用は呼び出し側(ApproveClient)が data/error を見て行う。
 */

"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { PendingItem } from "@/lib/growth/approve";

import { fetchBoard } from "../api";

export const APPROVE_BOARD_KEY = ["approve", "board"] as const;

interface UseApproveBoardParams {
  token: string;
  /** 認証前など取得を止めたいとき false。既定 true。 */
  enabled?: boolean;
  /** ポーリング間隔(ms)。 */
  pollIntervalMs: number;
  /** 現在の items を見て「ポーリングを続けるか」を返す(生成待ち/生成中がある間 true)。 */
  shouldPoll: (items: PendingItem[] | undefined) => boolean;
}

export function useApproveBoard({
  token,
  enabled = true,
  pollIntervalMs,
  shouldPoll,
}: UseApproveBoardParams): UseQueryResult<PendingItem[], Error> {
  return useQuery({
    queryKey: APPROVE_BOARD_KEY,
    queryFn: () => fetchBoard(token),
    enabled,
    // 盤は「初期ロードでseed→以降はpoll/手動refetchでのみ更新」。staleTime:Infinity で
    // enable 時の自動再取得(二重フェッチ)を防ぎ、更新契機を refetchInterval/refetch に限定する。
    staleTime: Infinity,
    refetchInterval: (query) => (shouldPoll(query.state.data) ? pollIntervalMs : false),
  });
}
