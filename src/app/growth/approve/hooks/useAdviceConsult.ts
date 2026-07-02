"use client";

import { useState } from "react";

import type { AdviceView } from "@/lib/growth/advise";
import { applyAdviceItems, type AdviceApplyView } from "@/lib/growth/adviseApply";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "../authHeaders";

interface UseAdviceConsultParams {
  pageId: string;
  token: string;
  advice?: AdviceView;
  adviceApply?: AdviceApplyView;
  bodyHtml?: string;
  onChanged: () => void;
}

interface UseAdviceConsultReturn {
  instruction: string;
  setInstruction: (v: string) => void;
  busy: boolean;
  error: string;
  adopted: ReadonlySet<number>;
  toggleAdopt: (index: number) => void;
  requestAdvice: () => void;
  dismiss: () => void;
  submitApply: () => void;
  dismissApply: () => void;
  applyNow: () => Promise<void>;
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useAdviceConsult({
  pageId,
  token,
  adviceApply,
  bodyHtml,
  onChanged,
}: UseAdviceConsultParams): UseAdviceConsultReturn {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // #165: 本文反映で採用する fix の index 集合。
  const [adopted, setAdopted] = useState<ReadonlySet<number>>(new Set());

  // 記事切替(pageId 変化)で前記事の指示文・採用チェックを持ち越さない(別記事への誤送信を防ぐ)。
  // React 公式「prop 変化時の state 調整」パターン(effect ではなく描画中に是正)。
  // prevPageId 初期値=現在の pageId のため初回マウントでは入らない。
  const [prevPageId, setPrevPageId] = useState(pageId);
  if (pageId !== prevPageId) {
    setPrevPageId(pageId);
    setInstruction("");
    setAdopted(new Set());
  }

  async function postJson(path: string, body: unknown, fallback: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error(json.error ?? fallback);
      onChanged();
    } catch (e) {
      setError(errMsg(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  function requestAdvice(): void {
    void postJson("/api/growth/advise", { pageId, instruction: instruction.trim() }, "アドバイス依頼に失敗しました。");
  }

  function dismiss(): void {
    void postJson("/api/growth/advise/dismiss", { pageId }, "アドバイスの片付けに失敗しました。");
  }

  // ── #165: 採用→本文反映 ──
  function toggleAdopt(index: number): void {
    setAdopted((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function submitApply(): void {
    void postJson(
      "/api/growth/advise/apply",
      { pageId, adoptedIndexes: [...adopted] },
      "反映依頼に失敗しました。"
    );
  }

  function dismissApply(): void {
    void postJson("/api/growth/advise/apply/dismiss", { pageId }, "反映の片付けに失敗しました。");
  }

  /** 提示された before/after 案を決定的に本文へ反映し、保存→片付け→再取得する。 */
  async function applyNow(): Promise<void> {
    if (!bodyHtml || !adviceApply) return;
    const { html, applied, skipped } = applyAdviceItems(bodyHtml, adviceApply.proposal);
    if (applied.length === 0) {
      setError("反映できる案がありませんでした（本文が変わった可能性・要確認）。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saveRes = await fetch("/api/growth/draft/edit", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, bodyHtml: html }),
      });
      const saveJson = await readJsonObject(saveRes);
      if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error ?? "保存に失敗しました。");
      const clearRes = await fetch("/api/growth/advise/apply/dismiss", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId }),
      });
      const clearJson = await readJsonObject(clearRes);
      if (!clearRes.ok || !clearJson.success) throw new Error(clearJson.error ?? "片付けに失敗しました。");
      if (skipped.length > 0) {
        setError(`${applied.length}件を反映しました（${skipped.length}件は本文不一致でスキップ）。`);
      }
      onChanged();
    } catch (e) {
      setError(errMsg(e, "反映に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  return {
    instruction,
    setInstruction,
    busy,
    error,
    adopted,
    toggleAdopt,
    requestAdvice,
    dismiss,
    submitApply,
    dismissApply,
    applyNow,
  };
}
