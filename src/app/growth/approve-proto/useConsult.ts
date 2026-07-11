/**
 * AI相談(#proto・往復統合)の薄いフック。
 * 純エンジン(consultEngine)＋タイマー＋モック結果生成を束ね、Article.consults を更新する。
 * HTML加工(reviseMock/bodyBlocks)はここに置き、エンジンは型専用に保つ。
 */
"use client";

import { useCallback, useEffect, useRef } from "react";

import { applyBlockImprovement, improvementSentence, splitBlocks, stripTags } from "./bodyBlocks";
import {
  adoptAdviceFix,
  applyReviseTarget,
  createConsult,
  findConsult,
  removeConsult,
  resolveConsult,
  settleReviseTarget,
  settleSentenceFix,
  upsertConsult,
} from "./consultEngine";
import { proposeBody, proposeOutline, proposeTitle } from "./reviseMock";
import type { Article, Consult, ConsultInput, ConsultKind, ConsultResult, ReviseTarget, Toast } from "./types";

interface UseConsultArgs {
  activeArticle: Article | null;
  setArticles: (updater: (prev: Article[]) => Article[]) => void;
  pushToast: (tone: Toast["tone"], text: string) => void;
}

const DEFAULT_ADVICE = {
  overall: 82,
  scores: [
    { label: "文体の自然さ", score: 86 },
    { label: "構成の流れ", score: 80 },
    { label: "具体性・根拠", score: 74 },
    { label: "内部リンク導線", score: 68 },
  ],
  strengths: ["一文が短く、翻訳調を避けた自然な日本語", "確定事実に沿っていて誇張がない"],
  fixes: [{ quote: "まず一度コートに立ってみてください。", reason: "締めは良いが、次アクションへの内部導線がない。", suggestion: "体験予約 or 施設紹介ページへの内部リンクを添える。" }],
};

/** input から提示結果を決定的に生成する(外部I/Oなし)。 */
function computeResult(a: Article, c: Consult): ConsultResult {
  if (c.kind === "overall") {
    return { overall: a.advice.overall > 0 ? a.advice : DEFAULT_ADVICE };
  }
  if (c.kind === "revise") {
    const ins = c.input.revise ?? {};
    const revise: ConsultResult["revise"] = {};
    if (ins.outline) revise.outline = { from: a.outline, to: proposeOutline(a.outline) };
    if (ins.title) revise.title = proposeTitle(a.title, ins.title);
    if (ins.body) revise.body = proposeBody(a.bodyHtml, ins.body);
    return { revise };
  }
  // sentence
  const blocks = splitBlocks(a.bodyHtml);
  const firstByBlock = new Map<number, string>();
  for (const cm of c.input.sentence ?? []) if (!firstByBlock.has(cm.block)) firstByBlock.set(cm.block, cm.text);
  const fixes = [...firstByBlock.entries()]
    .map(([block, firstText]) => {
      const b = blocks[block];
      const sentence = improvementSentence(firstText);
      const from = b ? stripTags(b.inner) : "";
      return { block, from, to: `${from} ${sentence}`, sentence };
    })
    .filter((f) => f.from)
    .sort((p, q) => p.block - q.block);
  return { sentence: fixes };
}

let consultSeq = 0;

export function useConsult({ activeArticle, setArticles, pushToast }: UseConsultArgs) {
  const timers = useRef<number[]>([]);
  const activeId = activeArticle?.id ?? null;

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const updateConsults = useCallback(
    (id: string, updater: (list: Consult[]) => Consult[]) => {
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, consults: updater(a.consults ?? []) } : a)));
    },
    [setArticles],
  );

  const startTimer = useCallback(
    (articleId: string, consultId: string) => {
      const t = window.setTimeout(() => {
        setArticles((prev) =>
          prev.map((a) => {
            if (a.id !== articleId) return a;
            const c = findConsult(a.consults ?? [], consultId);
            if (!c) return a;
            return { ...a, consults: upsertConsult(a.consults ?? [], resolveConsult(c, computeResult(a, c))) };
          }),
        );
        pushToast("success", "AIから案が届きました");
      }, 1800);
      timers.current.push(t);
    },
    [setArticles, pushToast],
  );

  const request = useCallback(
    (kind: ConsultKind, input: ConsultInput) => {
      if (!activeId) return;
      consultSeq += 1;
      const c = createConsult(`consult-${consultSeq}`, kind, input);
      updateConsults(activeId, (list) => upsertConsult(list, c));
      pushToast("info", "AIに相談しました — 案を作成します");
      startTimer(activeId, c.id);
    },
    [activeId, updateConsults, pushToast, startTimer],
  );

  const retry = useCallback(
    (id: string) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => {
        const c = findConsult(list, id);
        return c ? upsertConsult(list, { ...c, status: "requested", result: undefined }) : list;
      });
      startTimer(activeId, id);
    },
    [activeId, updateConsults, startTimer],
  );

  const dismiss = useCallback(
    (id: string) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => removeConsult(list, id));
    },
    [activeId, updateConsults],
  );

  const applyRevise = useCallback(
    (id: string, target: ReviseTarget) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const c = findConsult(a.consults ?? [], id);
          if (!c) return a;
          const applied = applyReviseTarget(a, c, target);
          const settled = settleReviseTarget(c, target);
          const consults = settled ? upsertConsult(a.consults ?? [], settled) : removeConsult(a.consults ?? [], id);
          return { ...applied, consults };
        }),
      );
      const label = target === "title" ? "タイトル" : target === "body" ? "本文" : "構成案";
      pushToast("success", `${label}を反映しました`);
    },
    [activeId, setArticles, pushToast],
  );

  const dismissRevise = useCallback(
    (id: string, target: ReviseTarget) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => {
        const c = findConsult(list, id);
        if (!c) return list;
        const settled = settleReviseTarget(c, target);
        return settled ? upsertConsult(list, settled) : removeConsult(list, id);
      });
      pushToast("info", "提案を却下しました");
    },
    [activeId, updateConsults, pushToast],
  );

  const adoptAdvice = useCallback(
    (id: string, index: number) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const c = findConsult(a.consults ?? [], id);
          return c ? adoptAdviceFix(a, c, index) : a;
        }),
      );
      pushToast("success", "アドバイスを本文に反映しました");
    },
    [activeId, setArticles, pushToast],
  );

  const applyFix = useCallback(
    (id: string, block: number) => {
      if (!activeId || !activeArticle) return;
      const c = findConsult(activeArticle.consults ?? [], id);
      const fix = c?.result?.sentence?.find((f) => f.block === block);
      if (!c || !fix) return;
      const blocks = splitBlocks(activeArticle.bodyHtml);
      const currentText = blocks[block] ? stripTags(blocks[block].inner) : "";
      if (currentText !== fix.from) {
        pushToast("danger", "対象の段落が変わっています（要確認）— 再依頼してください");
        return;
      }
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const cc = findConsult(a.consults ?? [], id);
          const ff = cc?.result?.sentence?.find((f) => f.block === block);
          if (!cc || !ff) return a;
          const settled = settleSentenceFix(cc, block);
          const consults = settled
            ? upsertConsult(a.consults ?? [], settled)
            : removeConsult(a.consults ?? [], id);
          return { ...a, bodyHtml: applyBlockImprovement(a.bodyHtml, block, ff.sentence), consults };
        }),
      );
      pushToast("success", "本文に反映しました");
    },
    [activeId, activeArticle, setArticles, pushToast],
  );

  const dismissFix = useCallback(
    (id: string, block: number) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => {
        const c = findConsult(list, id);
        if (!c) return list;
        const settled = settleSentenceFix(c, block);
        return settled ? upsertConsult(list, settled) : removeConsult(list, id);
      });
      pushToast("info", "提案を却下しました");
    },
    [activeId, updateConsults, pushToast],
  );

  const applyAll = useCallback(
    (id: string) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const c = findConsult(a.consults ?? [], id);
          if (!c?.result?.sentence) return a;
          let html = a.bodyHtml;
          for (const f of c.result.sentence) html = applyBlockImprovement(html, f.block, f.sentence);
          return { ...a, bodyHtml: html, consults: removeConsult(a.consults ?? [], id) };
        }),
      );
      pushToast("success", "本文にすべて反映しました");
    },
    [activeId, setArticles, pushToast],
  );

  return { request, retry, dismiss, applyRevise, dismissRevise, adoptAdvice, applyFix, dismissFix, applyAll };
}
