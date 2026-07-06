"use client";

/**
 * InlineCommentReview の本文コメント入力結線フック (#182 Phase 2 リファクタ)。
 *
 * state: comments/openFor/draft/busy/error
 * 関数: lineKey・openComposer・addComment・removeComment・buildPayload・post・
 *        requestAi・dismiss・applyNow・closeComposer
 *
 * InlineCommentReview.tsx から逐語移設。挙動不変。
 */

import { useState } from "react";

import {
  applyBodyCommentProposal,
  extractReviewLines,
  type BodyComment,
  type BodyCommentView,
} from "@/lib/growth/bodyComment";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "../authHeaders";

interface UseBodyCommentConsultParams {
  pageId: string;
  token: string;
  bodyHtml: string;
  bodyComment?: BodyCommentView;
  onChanged: () => void;
}

interface UseBodyCommentConsultReturn {
  comments: Record<string, string[]>;
  openFor: string | null;
  draft: string;
  setDraft: (v: string) => void;
  overallDraft: string;
  setOverallDraft: (v: string) => void;
  busy: boolean;
  error: string;
  openComposer: (key: string) => void;
  addComment: (key: string) => void;
  removeComment: (key: string, idx: number) => void;
  closeComposer: () => void;
  buildPayload: () => BodyComment[];
  requestAi: () => Promise<void>;
  requestOverall: () => Promise<void>;
  dismiss: () => Promise<void>;
  applyNow: () => Promise<void>;
}

export function useBodyCommentConsult({
  pageId,
  token,
  bodyHtml,
  bodyComment,
  onChanged,
}: UseBodyCommentConsultParams): UseBodyCommentConsultReturn {
  const lines = extractReviewLines(bodyHtml);
  const [comments, setComments] = useState<Record<string, string[]>>({});
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [overallDraft, setOverallDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 記事切替(pageId 変化)で前記事の行コメント下書き・入力欄状態を持ち越さない(別記事への
  // 誤送信を防ぐ)。React 公式「prop 変化時の state 調整」パターン(effect ではなく描画中に是正)。
  // prevPageId 初期値=現在の pageId のため初回マウントでは入らない。
  const [prevPageId, setPrevPageId] = useState(pageId);
  if (pageId !== prevPageId) {
    setPrevPageId(pageId);
    setComments({});
    setOpenFor(null);
    setDraft("");
    setOverallDraft("");
  }

  const proposal = bodyComment?.proposal ?? [];

  function lineKey(blockIndex: number, excerpt: string): string {
    return `${blockIndex}::${excerpt}`;
  }

  function openComposer(key: string): void {
    setOpenFor(key);
    setDraft("");
  }

  function addComment(key: string): void {
    const text = draft.trim();
    if (!text) return;
    setComments((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), text] }));
    setDraft("");
    setOpenFor(null);
  }

  function removeComment(key: string, idx: number): void {
    setComments((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== idx) }));
  }

  function closeComposer(): void {
    setOpenFor(null);
  }

  function buildPayload(): BodyComment[] {
    const out: BodyComment[] = [];
    for (const line of lines) {
      if (!line.commentable || line.excerpt === null) continue;
      for (const c of comments[lineKey(line.blockIndex, line.excerpt)] ?? []) {
        out.push({ blockIndex: line.blockIndex, excerpt: line.excerpt, comment: c });
      }
    }
    return out;
  }

  async function post(path: string, payload: unknown, fallback: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error((json.error as string) ?? fallback);
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function requestAi(): Promise<void> {
    const payload = buildPayload();
    if (payload.length === 0) return;
    if (await post("/api/growth/body-comment", { pageId, comments: payload }, "依頼に失敗しました。")) {
      setComments({});
    }
  }

  async function requestOverall(): Promise<void> {
    const overall = overallDraft.trim();
    if (!overall) return;
    if (await post("/api/growth/body-comment", { pageId, overall }, "依頼に失敗しました。")) {
      setOverallDraft("");
    }
  }

  async function dismiss(): Promise<void> {
    await post("/api/growth/body-comment/dismiss", { pageId }, "取り消しに失敗しました。");
  }

  // 提示中の before/after 案を決定的に本文へ反映し、保存→片付け→再取得する。
  async function applyNow(): Promise<void> {
    const { html, applied, skipped } = applyBodyCommentProposal(bodyHtml, proposal);
    if (applied.length === 0) {
      setError("反映できる案がありませんでした（本文が変わった可能性・要確認）。");
      return;
    }
    setBusy(true);
    setError("");
    const adoptedAspects = applied.map(() => "インラインコメント");
    try {
      const saveRes = await fetch("/api/growth/draft/edit", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, bodyHtml: html, source: "comment-revise", adoptedAspects }),
      });
      const saveJson = await readJsonObject(saveRes);
      if (!saveRes.ok || !saveJson.success) throw new Error((saveJson.error as string) ?? "保存に失敗しました。");
      // 反映後は依頼状態をクリア(なしに戻す)。
      await fetch("/api/growth/body-comment/dismiss", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId }),
      });
      if (skipped.length > 0) {
        setError(`${applied.length}件を反映しました（${skipped.length}件は本文不一致でスキップ）。`);
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "反映に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return {
    comments,
    openFor,
    draft,
    setDraft,
    overallDraft,
    setOverallDraft,
    busy,
    error,
    openComposer,
    addComment,
    removeComment,
    closeComposer,
    buildPayload,
    requestAi,
    requestOverall,
    dismiss,
    applyNow,
  };
}
