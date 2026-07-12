/**
 * 承認/却下/承認待ちに戻す(即時保存モデル)を担うカスタムフック(#H7 分解 / #213)。
 * decided(保存済みの選択)と承認/却下/取り消しの mutation を集約する。
 * #213: 決定操作はカードから撤去し、失敗は onError(トースト)で可視化するため、
 * カード用の failures(失敗＋再試行)・savingId(進行中の disabled 制御)は不要になり削除した。
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { pendingStatus } from "@/lib/growth/approve";

import { postDecision } from "../api";
import { toMessage } from "../errorMessage";
import type { Choice, PendingItem } from "../types";

function removeKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}

interface UseApproveDecisionsParams {
  token: string;
  // 操作後に次の操作対象へフォーカスを移す(要素 id)。
  onFocus: (id: string) => void;
  // 詳細パネルからの操作後にパネルを閉じる。
  onClosePanel: () => void;
  // #213: 決定/取消の保存失敗をトーストで可視化する(カード失敗アラート撤去に伴う一本化)。
  onError: (message: string) => void;
}

export function useApproveDecisions({
  token,
  onFocus,
  onClosePanel,
  onError,
}: UseApproveDecisionsParams) {
  // 即時保存モデル: 記事ごとに保存済みの選択(承認/却下)を持つ。確定ボタンは無い。
  const [decided, setDecided] = useState<Record<string, Choice>>({});

  // #H7: 承認/却下/取り消しの更新を useMutation 化(fetch ロジックは api.ts)。
  const decisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      postDecision(token, id, decision),
  });

  async function decide(item: PendingItem, choice: Choice): Promise<void> {
    try {
      await decisionMutation.mutateAsync({ id: item.id, decision: choice });
      setDecided((prev) => ({ ...prev, [item.id]: choice }));
      // #213: 決定操作はカードから撤去。決定後は当該行(タイトル=開く起点)へフォーカスを戻す。
      onFocus(`open-${item.id}`);
    } catch (error) {
      onError(toMessage(error, "保存に失敗しました。"));
    }
  }

  async function undo(item: PendingItem): Promise<void> {
    try {
      await decisionMutation.mutateAsync({ id: item.id, decision: pendingStatus(item.kind) });
      setDecided((prev) => removeKey(prev, item.id));
      onFocus(`open-${item.id}`);
    } catch (error) {
      onError(toMessage(error, "取り消しに失敗しました。"));
    }
  }

  // #275: 詳細パネルからの操作。実行して即座にパネルを閉じる(結果は一覧の行に反映)。
  function decideFromPanel(item: PendingItem, choice: Choice): void {
    void decide(item, choice);
    onClosePanel();
  }

  return {
    decided,
    setDecided,
    decide,
    undo,
    decideFromPanel,
  };
}
