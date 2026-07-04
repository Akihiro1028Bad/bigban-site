/**
 * 下書きプレビューの取得・ポーリング(#75/#166 / #H7 分解)を担うカスタムフック。
 * パネルを開いた記事(下書きあり)を取得し、AI再生成中は静かに再取得して生反映する。
 * 挙動は ApproveClient 直書き時と同一(純リファクタ)。
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { BODY_REGEN_BUSY_STATUSES } from "@/lib/growth/bodyImageRegen";
import { REGEN_BUSY_STATUSES } from "@/lib/growth/eyecatchRegen";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "../authHeaders";
import type { DraftPreview, DraftState } from "../draftTypes";
import { toMessage } from "../errorMessage";

// #166: AI再生成が依頼中/処理中の間、下書きを再取得して依頼中→完了を生更新する間隔(ミリ秒)。
const DRAFT_REGEN_POLL_MS = 5000;

interface UseDraftPreviewParams {
  token: string;
  openId: string | null;
  // 開いている記事が下書き作成済み(contentId あり)か。
  openHasDraft: boolean;
}

export function useDraftPreview({ token, openId, openHasDraft }: UseDraftPreviewParams) {
  const [draftState, setDraftState] = useState<DraftState>({ status: "idle" });

  const loadDraft = useCallback(
    async (pageId: string): Promise<void> => {
      setDraftState({ status: "loading" });
      try {
        const res = await fetch(
          `/api/growth/draft?pageId=${encodeURIComponent(pageId)}`,
          { headers: authHeaders(token) }
        );
        const json = await readJsonObject(res);
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "下書きの取得に失敗しました。");
        }
        if (!json.exists) {
          setDraftState({ status: "empty" });
          return;
        }
        setDraftState({ status: "ready", draft: json.draft as DraftPreview });
      } catch (error) {
        setDraftState({ status: "error", error: toMessage(error, "下書きの取得に失敗しました。") });
      }
    },
    [token]
  );

  // パネルを開いたら(下書きありの記事のみ)取得。閉じる/対象外は idle に戻す。
  useEffect(() => {
    if (openId && openHasDraft) {
      void loadDraft(openId);
    } else {
      setDraftState({ status: "idle" });
    }
  }, [openId, openHasDraft, loadDraft]);

  // #166: ローディング表示に切り替えずに下書きだけ静かに再取得する(ポーリング用)。
  // 失敗/消失時は現在の表示を維持して次の tick に委ねる(沈黙させるが画面は壊さない)。
  const refreshDraftSilently = useCallback(
    async (pageId: string): Promise<void> => {
      try {
        const res = await fetch(
          `/api/growth/draft?pageId=${encodeURIComponent(pageId)}`,
          { headers: authHeaders(token) }
        );
        const json = await readJsonObject(res);
        if (!res.ok || !json.success || !json.exists) return;
        setDraftState({ status: "ready", draft: json.draft as DraftPreview });
      } catch {
        // ネットワーク一時障害は無視(次の tick で回復)。
      }
    },
    [token]
  );

  // #166: AI再生成(本文画像/アイキャッチ)が依頼中/処理中の間だけ下書きを定期再取得し、
  // 「依頼中→完了」をバッジ消滅＋画像更新として生反映する。なし/失敗になったら止める。
  const draftRegenPending =
    draftState.status === "ready" &&
    (((draftState.draft.bodyRegen &&
      (BODY_REGEN_BUSY_STATUSES as readonly string[]).includes(draftState.draft.bodyRegen.status)) ??
      false) ||
      ((draftState.draft.eyecatchRegen &&
        (REGEN_BUSY_STATUSES as readonly string[]).includes(draftState.draft.eyecatchRegen.status)) ??
        false));

  useEffect(() => {
    if (!openId || !draftRegenPending) return;
    const timer = setInterval(() => {
      void refreshDraftSilently(openId);
    }, DRAFT_REGEN_POLL_MS);
    return () => clearInterval(timer);
  }, [openId, draftRegenPending, refreshDraftSilently]);

  return { draftState, loadDraft, draftRegenPending };
}
