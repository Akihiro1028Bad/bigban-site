/**
 * 下書きの手動リッチ編集(#77/#98/#129)を担うカスタムフック(#H7 分解)。
 * editingDraft 等の編集状態・ライブプレビュー・保存を集約する。
 * #213: 盤カードの「編集」ボタン撤去に伴い、盤カードからの編集オープン(openCardEditor /
 * pendingEditId 自動オープン)を撤去。編集の起点は詳細パネルヘッダ「下書きを編集」(startEditDraft)に一本化した。
 */

"use client";

import { useEffect, useState } from "react";

import { readJsonObject } from "@/lib/growth/safeJson";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { authHeaders } from "../authHeaders";
import { buildDraftEditPayload } from "../draftEditorContent";
import { toMessage } from "../errorMessage";
import { type PreviewDevice } from "../previewDevice";

// #98: ライブプレビューのデバウンス間隔(編集中の高頻度更新を間引く)。
const LIVE_PREVIEW_DEBOUNCE_MS = 250;

interface UseDraftEditingParams {
  token: string;
  openId: string | null;
  loadDraft: (pageId: string) => Promise<void>;
}

export function useDraftEditing({ token, openId, loadDraft }: UseDraftEditingParams) {
  const [editingDraft, setEditingDraft] = useState(false);
  const [editedHtml, setEditedHtml] = useState("");
  const [draftOriginalHtml, setDraftOriginalHtml] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const livePreviewHtml = useDebouncedValue(editedHtml, LIVE_PREVIEW_DEBOUNCE_MS);
  // #129: 本番プレビューの表示デバイス(PC全幅 / モバイル幅)。
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("pc");

  // #42/#77: パネルを開閉/切替したら下書き編集の状態をクリアする(挙動保存)。
  useEffect(() => {
    setEditingDraft(false);
    setConfirmDiscard(false);
    setDraftSaveError("");
    setDraftSaving(false);
    setEditedHtml("");
    setDraftOriginalHtml("");
  }, [openId]);

  function startEditDraft(html: string): void {
    setEditingDraft(true);
    setDraftOriginalHtml(html);
    setEditedHtml(html);
    setDraftSaveError("");
    setConfirmDiscard(false);
  }

  function exitEditDraft(): void {
    setEditingDraft(false);
    setConfirmDiscard(false);
    setDraftSaveError("");
  }

  // 未保存の変更があれば破棄確認を挟む。
  function cancelEditDraft(): void {
    if (editedHtml !== draftOriginalHtml) {
      setConfirmDiscard(true);
      return;
    }
    exitEditDraft();
  }

  async function saveDraft(pageId: string): Promise<void> {
    setDraftSaving(true);
    setDraftSaveError("");
    try {
      const res = await fetch("/api/growth/draft/edit", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(buildDraftEditPayload(pageId, editedHtml)),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "保存に失敗しました。");
      }
      setEditingDraft(false);
      setConfirmDiscard(false);
      await loadDraft(pageId); // 保存後にプレビューを最新化
    } catch (error) {
      setDraftSaveError(toMessage(error, "保存に失敗しました。"));
    } finally {
      setDraftSaving(false);
    }
  }

  return {
    editingDraft,
    editedHtml,
    draftOriginalHtml,
    draftSaving,
    draftSaveError,
    confirmDiscard,
    livePreviewHtml,
    previewDevice,
    setEditedHtml,
    setPreviewDevice,
    setConfirmDiscard,
    startEditDraft,
    cancelEditDraft,
    exitEditDraft,
    saveDraft,
  };
}
