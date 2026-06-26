/**
 * 構成案の修正(AI依頼/手動編集/画像指示/タイトル/提示反映)を担うカスタムフック(#H7 分解)。
 * コメント下書き・セクション手動編集・画像指示・タイトル編集の状態と、/revise・/revise/edit・
 * /revise/apply の各 mutation を集約する。挙動は ApproveClient 直書き時と同一(純リファクタ)。
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { fetchBoard, postRevise, postReviseApply, postReviseEdit } from "../api";
import { toMessage } from "../errorMessage";
import {
  outlineSections,
  serializeOutlineSections,
  type ImageStyleKey,
  type OutlineImage,
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
  // #61: 画像指示エディタ。フォームを開いているセクション index と入力値(スタイル/説明)、
  // 既存画像を編集中のときの index(null=新規追加)。
  const [imageFormFor, setImageFormFor] = useState<number | null>(null);
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);
  const [imageStyle, setImageStyle] = useState<ImageStyleKey>("mascot");
  const [imageDesc, setImageDesc] = useState("");
  const [reviseBusy, setReviseBusy] = useState(false);
  const [reviseError, setReviseError] = useState("");
  // #139 A: 記事タイトルの直接編集(構成案修正パネル内のインライン編集)。
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  // #139 B: タイトルへの AI 修正指示(構成案コメントとは別レーン)。
  const [titleRevisePrompt, setTitleRevisePrompt] = useState("");

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
    setImageFormFor(null);
    setEditingImageIdx(null);
    setImageDesc("");
    setReviseError("");
    setEditingTitle(false);
    setTitleInput("");
    setTitleRevisePrompt("");
  }, [openId]);

  // #53/#139 B: セクションに溜めたコメントを {見出し, comment} へ展開し、タイトル指示と一緒に送る。
  async function requestRevise(item: PendingItem): Promise<void> {
    const sections = outlineSections(item.outline);
    const comments = sections.flatMap((section, i) =>
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
    setImageFormFor(null); // 画像フォームが開いていれば閉じる
  }

  function startEditComment(section: number, idx: number, text: string): void {
    setOpenCommentFor(section);
    setEditingIdx(idx);
    setCommentText(text);
    setImageFormFor(null);
  }

  function cancelComment(): void {
    setOpenCommentFor(null);
    setEditingIdx(null);
    setCommentText("");
  }

  function saveComment(section: number): void {
    const text = commentText.trim();
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
    setImageFormFor(null);
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

  // #139 A: 記事タイトルを直接上書き保存する(AI不要)。空は弾く。
  function startEditTitle(title: string): void {
    setEditingTitle(true);
    setTitleInput(title);
  }
  function cancelEditTitle(): void {
    setEditingTitle(false);
    setTitleInput("");
  }
  async function saveTitle(item: PendingItem): Promise<void> {
    const title = titleInput.trim();
    if (!title) {
      setReviseError("タイトルは空にできません。");
      return;
    }
    if (await submitReviseEdit(item, { title })) cancelEditTitle();
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

  // #61: 画像指示の追加/編集/削除。構成案を直接上書き(AI不要・/revise/edit に相乗り)。
  // 画像フォームを開くときは、コメント・手動編集フォームを閉じる(同時に複数フォームを開かない)。
  function closeOtherForms(): void {
    setOpenCommentFor(null);
    setEditingSection(null);
    setEditHeading("");
    setEditDescription("");
  }

  function startAddImage(i: number): void {
    setImageFormFor(i);
    setEditingImageIdx(null);
    setImageStyle("mascot");
    setImageDesc("");
    closeOtherForms();
  }

  function startEditImage(i: number, idx: number, image: OutlineImage): void {
    setImageFormFor(i);
    setEditingImageIdx(idx);
    setImageStyle(image.style);
    setImageDesc(image.description);
    closeOtherForms();
  }

  function cancelImage(): void {
    setImageFormFor(null);
    setEditingImageIdx(null);
    setImageDesc("");
  }

  async function saveImage(
    item: PendingItem,
    sections: OutlineSection[],
    i: number
  ): Promise<void> {
    const description = imageDesc.trim();
    if (!description) {
      setReviseError("画像の説明を入力してください。");
      return;
    }
    const currentImages = sections[i].images;
    const nextImages =
      editingImageIdx !== null
        ? currentImages.map((img, k) =>
            k === editingImageIdx ? { style: imageStyle, description } : img
          )
        : [...currentImages, { style: imageStyle, description }];
    const next = sections.map((s, k) => (k === i ? { ...s, images: nextImages } : s));
    if (await persistOutline(item, next)) cancelImage();
  }

  async function deleteImage(
    item: PendingItem,
    sections: OutlineSection[],
    i: number,
    idx: number
  ): Promise<void> {
    const nextImages = sections[i].images.filter((_, k) => k !== idx);
    const next = sections.map((s, k) => (k === i ? { ...s, images: nextImages } : s));
    await persistOutline(item, next);
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
    imageFormFor,
    editingImageIdx,
    imageStyle,
    imageDesc,
    reviseBusy,
    reviseError,
    editingTitle,
    titleInput,
    titleRevisePrompt,
    setCommentText,
    setEditHeading,
    setEditDescription,
    setImageStyle,
    setImageDesc,
    setTitleInput,
    setTitleRevisePrompt,
    requestRevise,
    startAddComment,
    startEditComment,
    cancelComment,
    saveComment,
    deleteComment,
    startEditSection,
    cancelEditSection,
    submitReviseEdit,
    startEditTitle,
    cancelEditTitle,
    saveTitle,
    saveSection,
    startAddImage,
    startEditImage,
    cancelImage,
    saveImage,
    deleteImage,
    applyRevise,
  };
}
