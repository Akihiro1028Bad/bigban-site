/**
 * 承認/却下/承認待ちに戻す(即時保存モデル)を担うカスタムフック(#H7 分解)。
 * decided(保存済みの選択)・failures(失敗＋再試行)・savingId と、承認/却下/取り消しの
 * mutation を集約する。挙動は ApproveClient 内に直書きしていた頃と同一(純リファクタ)。
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { pendingStatus } from "@/lib/growth/approve";

import { postDecision } from "../api";
import { toMessage } from "../errorMessage";
import type { Choice, Failure, PendingItem } from "../types";

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
  // #213: 決定/取消の保存失敗をトーストで可視化する(カード失敗アラート撤去に先行・純追加)。
  onError: (message: string) => void;
}

export function useApproveDecisions({
  token,
  onFocus,
  onClosePanel,
  onError,
}: UseApproveDecisionsParams) {
  // 即時保存モデル: カードごとに保存済みの選択(承認/却下)と失敗状態を持つ。確定ボタンは無い。
  const [decided, setDecided] = useState<Record<string, Choice>>({});
  const [failures, setFailures] = useState<Record<string, Failure>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // #H7: 承認/却下/取り消しの更新を useMutation 化(fetch ロジックは api.ts)。
  const decisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      postDecision(token, id, decision),
  });

  async function decide(item: PendingItem, choice: Choice): Promise<void> {
    setSavingId(item.id);
    setFailures((prev) => removeKey(prev, item.id));
    try {
      await decisionMutation.mutateAsync({ id: item.id, decision: choice });
      setDecided((prev) => ({ ...prev, [item.id]: choice }));
      onFocus(`undo-${item.id}`);
    } catch (error) {
      const text = toMessage(error, "保存に失敗しました。");
      setFailures((prev) => ({
        ...prev,
        [item.id]: { message: text, retry: () => decide(item, choice) },
      }));
      onError(text);
    } finally {
      setSavingId(null);
    }
  }

  async function undo(item: PendingItem): Promise<void> {
    setSavingId(item.id);
    setFailures((prev) => removeKey(prev, item.id));
    try {
      await decisionMutation.mutateAsync({ id: item.id, decision: pendingStatus(item.kind) });
      setDecided((prev) => removeKey(prev, item.id));
      onFocus(`approve-${item.id}`);
    } catch (error) {
      const text = toMessage(error, "取り消しに失敗しました。");
      setFailures((prev) => ({
        ...prev,
        [item.id]: { message: text, retry: () => undo(item) },
      }));
      onError(text);
    } finally {
      setSavingId(null);
    }
  }

  // #275: 詳細パネルからの操作。実行して即座にパネルを閉じる(結果は一覧の行に反映)。
  function decideFromPanel(item: PendingItem, choice: Choice): void {
    void decide(item, choice);
    onClosePanel();
  }

  return {
    decided,
    failures,
    savingId,
    setDecided,
    decide,
    undo,
    decideFromPanel,
  };
}
