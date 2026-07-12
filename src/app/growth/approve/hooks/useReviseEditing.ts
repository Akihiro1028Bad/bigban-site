/**
 * 構成案の修正(AI依頼/手動編集/画像指示/タイトル/提示反映)を担うカスタムフック(#H7 分解)。
 * コメント下書き・セクション手動編集・画像指示・タイトル編集の状態と、/revise・/revise/edit・
 * /revise/apply の各 mutation を集約する。挙動は ApproveClient 直書き時と同一(純リファクタ)。
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { OUTLINE_OVERALL_LINE } from "@/lib/growth/revise";

import { fetchBoard, postRevise, postReviseApply, postReviseEdit } from "../api";
import { toMessage } from "../errorMessage";
import {
  outlineSections,
  serializeOutlineSections,
  type OutlineSection,
} from "../outline";
import type { PendingItem } from "../types";

interface UseReviseEditingParams {
  token: string;
  openId: string | null;
  setBoardData: (next: PendingItem[] | ((prev: PendingItem[]) => PendingItem[])) => void;
}

export function useReviseEditing({ token, openId, setBoardData }: UseReviseEditingParams) {
  // #53: 構成案セクション(index)ごとに溜めたコメント(複数可)。送信時に {見出し, comment} へ展開。
  const [draftComments, setDraftComments] = useState<Record<number, string[]>>({});
  // 現在コメント入力欄を開いているセクション index(null=どれも開いていない)。
  const [openCommentFor, setOpenCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  // 既存コメントを編集中のときの index(null=新規追加)。
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // #54: 手動編集中のセクション index と編集中の見出し/説明。
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editHeading, setEditHeading] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [reviseBusy, setReviseBusy] = useState(false);
  const [reviseError, setReviseError] = useState("");
  // #139 B: タイトルへの AI 修正指示(構成案コメントとは別レーン)。
  const [titleRevisePrompt, setTitleRevisePrompt] = useState("");
  const [outlineOverallPrompt, setOutlineOverallPrompt] = useState("");

  const reviseMutation = useMutation({
    mutationFn: (body: Parameters<typeof postRevise>[1]) => postRevise(token, body),
  });
  const reviseEditMutation = useMutation({
    mutationFn: ({ pageId, payload }: { pageId: string; payload: { outline?: string; title?: string } }) =>
      postReviseEdit(token, pageId, payload),
  });
  const reviseApplyMutation = useMutation({
    mutationFn: ({ pageId, action }: { pageId: string; action: "apply" | "discard" }) =>
      postReviseApply(token, pageId, action),
  });

  // #43: 承認待ち一覧を取り直す(修正ステータス/修正案の最新化)。手動取得のため失敗は
  // 修正パネルのエラーに留め、盤の連続失敗バナーには載せない(挙動保存)。
  const refreshItems = useCallback(async (): Promise<void> => {
    try {
      setBoardData(await fetchBoard(token));
    } catch (error) {
      setReviseError(toMessage(error, "最新の取得に失敗しました。"));
    }
  }, [token, setBoardData]);

  // #42/#53/#54: パネルを開閉/切替したら、前の記事のコメント下書き・編集状態・エラーをクリアする。
  useEffect(() => {
    setDraftComments({});
    setOpenCommentFor(null);
    setCommentText("");
    setEditingIdx(null);
    setEditingSection(null);
    setEditHeading("");
    setEditDescription("");
    setReviseError("");
    setTitleRevisePrompt("");
    setOutlineOverallPrompt("");
  }, [openId]);

  // #53/#139 B: セクションに溜めたコメントを {見出し, comment} へ展開し、タイトル指示と一緒に送る。
  async function requestRevise(item: PendingItem): Promise<void> {
    const sections = outlineSections(item.outline);
    const overall = outlineOverallPrompt.trim();
    const comments = overall
      ? [{ line: OUTLINE_OVERALL_LINE, comment: overall }]
      : sections.flatMap((section, i) =>
          (draftComments[i] ?? []).map((comment) => ({ line: section.heading, comment }))
        );
    const titleInstruction = titleRevisePrompt.trim();
    // 構成案コメント0件かつタイトル指示なしのときは「修正を依頼」ボタンが無効なので到達しない。
    setReviseBusy(true);
    setReviseError("");
    try {
      await reviseMutation.mutateAsync({
        pageId: item.id,
        comments,
        ...(titleInstruction ? { titleInstruction } : {}),
      });
      // 楽観更新: 依頼中にして即ポーリング表示へ(以降は poll が提示を取りに行く)。
      setBoardData((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, reviseStatus: "依頼中" } : it))
      );
      setDraftComments({});
      setTitleRevisePrompt("");
      setOutlineOverallPrompt("");
    } catch (error) {
      setReviseError(toMessage(error, "修正依頼に失敗しました。"));
    } finally {
      setReviseBusy(false);
    }
  }

  // #53: セクションごとのコメント追加/編集/削除(送信前の下書き操作)。
  function startAddComment(section: number): void {
    setOpenCommentFor(section);
    setEditingIdx(null);
    setCommentText("");
  }

  function startEditComment(section: number, idx: number, text: string): void {
    setOpenCommentFor(section);
    setEditingIdx(idx);
    setCommentText(text);
  }

  function cancelComment(): void {
    setOpenCommentFor(null);
    setEditingIdx(null);
    setCommentText("");
  }

  // #proto P3b: `explicitText` を渡すと state(commentText)ではなくその値を確定する。
  // ApproveClient の onAddComment は setCommentText→saveComment を同一 tick で呼ぶため、
  // state 反映前の stale("")を掴んでコメントを取りこぼす。明示引数でこの取りこぼしを防ぐ
  // (UI 起点の ConsultComposer は従来どおり引数なしで state を確定する)。
  function saveComment(section: number, explicitText?: string): void {
    const text = (explicitText ?? commentText).trim();
    if (!text) {
      cancelComment();
      return;
    }
    setDraftComments((prev) => {
      const list = [...(prev[section] ?? [])];
      if (editingIdx !== null) list[editingIdx] = text;
      else list.push(text);
      return { ...prev, [section]: list };
    });
    cancelComment();
  }

  function deleteComment(section: number, idx: number): void {
    setDraftComments((prev) => {
      /* istanbul ignore next -- @preserve 削除は描画済みコメントからのみ呼ばれ section は必ず存在 */
      const list = prev[section] ?? [];
      return { ...prev, [section]: list.filter((_, k) => k !== idx) };
    });
  }

  // #54: セクションの手動編集(見出し＋説明)→ 構成案を直接保存(AI不要)。
  function startEditSection(i: number, section: OutlineSection): void {
    setEditingSection(i);
    setEditHeading(section.heading);
    setEditDescription(section.description);
    setOpenCommentFor(null); // コメント入力中なら閉じる
  }

  function cancelEditSection(): void {
    setEditingSection(null);
    setEditHeading("");
    setEditDescription("");
  }

  // #54/#61/#139: /revise/edit へ直接上書き(AI不要)を送る共通処理。成否を返す。
  // payload は構成案(outline)・タイトル(title)のいずれか/両方。
  async function submitReviseEdit(
    item: PendingItem,
    payload: { outline?: string; title?: string }
  ): Promise<boolean> {
    setReviseBusy(true);
    setReviseError("");
    try {
      await reviseEditMutation.mutateAsync({ pageId: item.id, payload });
      await refreshItems();
      return true;
    } catch (error) {
      setReviseError(toMessage(error, "保存に失敗しました。"));
      return false;
    } finally {
      setReviseBusy(false);
    }
  }

  // #54/#61: 構成案を直接上書き保存する(手動編集・画像指示で共用)。成否を返す。
  async function persistOutline(
    item: PendingItem,
    nextSections: OutlineSection[]
  ): Promise<boolean> {
    return submitReviseEdit(item, { outline: serializeOutlineSections(nextSections) });
  }

  async function saveSection(
    item: PendingItem,
    sections: OutlineSection[],
    i: number
  ): Promise<void> {
    const heading = editHeading.trim();
    if (!heading) {
      setReviseError("見出しは空にできません。");
      return;
    }
    // 既存の画像指示(images)は保持したまま見出し・説明だけ差し替える。
    const next = sections.map((s, k) =>
      k === i ? { ...s, heading, description: editDescription.trim() } : s
    );
    if (await persistOutline(item, next)) cancelEditSection();
  }

  // #43: 提示中の修正案を「反映」または「やり直し(破棄)」する。完了後に最新化する。
  async function applyRevise(item: PendingItem, action: "apply" | "discard"): Promise<void> {
    setReviseBusy(true);
    setReviseError("");
    try {
      await reviseApplyMutation.mutateAsync({ pageId: item.id, action });
      await refreshItems();
    } catch (error) {
      setReviseError(toMessage(error, "更新に失敗しました。"));
    } finally {
      setReviseBusy(false);
    }
  }

  return {
    refreshItems,
    draftComments,
    openCommentFor,
    commentText,
    editingIdx,
    editingSection,
    editHeading,
    editDescription,
    reviseBusy,
    reviseError,
    titleRevisePrompt,
    outlineOverallPrompt,
    setCommentText,
    setEditHeading,
    setEditDescription,
    setTitleRevisePrompt,
    setOutlineOverallPrompt,
    requestRevise,
    startAddComment,
    startEditComment,
    cancelComment,
    saveComment,
    deleteComment,
    startEditSection,
    cancelEditSection,
    saveSection,
    persistOutline,
    applyRevise,
  };
}
