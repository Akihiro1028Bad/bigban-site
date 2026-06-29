/**
 * 相談カード(#proto・往復統合): 1相談の枠とステータス(待ち/失敗/提示)を共通化。
 * presenting 時のみモード別ボディ(revise/advice/sentence)を差し込む。
 */
"use client";

import { AdviceResultBody } from "./AdviceResultBody";
import { IconWand, IconX } from "./icons";
import { ReviseProposalBody } from "./ReviseProposalBody";
import { SentenceFixBody } from "./SentenceFixBody";
import type { Consult, ReviseTarget } from "./types";

const KIND_LABEL: Record<Consult["kind"], string> = {
  overall: "全体",
  revise: "修正",
  sentence: "この文",
};

interface ConsultCardProps {
  consult: Consult;
  articleId: string;
  adoptedFixes: Set<string>;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onApplyRevise: (id: string, target: ReviseTarget) => void;
  onDismissRevise: (id: string, target: ReviseTarget) => void;
  onAdoptAdvice: (id: string, index: number) => void;
  onApplyFix: (id: string, block: number) => void;
  onDismissFix: (id: string, block: number) => void;
  onApplyAll: (id: string) => void;
}

function recap(consult: Consult): string {
  const { kind, input } = consult;
  if (kind === "overall") return input.overall?.focus?.trim() || "全体を見てもらう";
  if (kind === "sentence") return `本文への指摘 ${input.sentence?.length ?? 0}件`;
  const parts: string[] = [];
  if (input.revise?.outline) parts.push("構成案");
  if (input.revise?.title) parts.push("タイトル");
  if (input.revise?.body) parts.push("本文");
  return parts.length ? `${parts.join(" / ")}を直す` : "修正を依頼";
}

export function ConsultCard(props: ConsultCardProps) {
  const { consult, articleId, adoptedFixes, onRetry, onDismiss } = props;
  return (
    <section className="rounded-[12px] p-3.5" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full px-2 py-[2px] text-[11px] font-medium" style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}>
          {KIND_LABEL[consult.kind]}
        </span>
        <span className="truncate text-[12px]" style={{ color: "var(--p-text-3)" }}>{recap(consult)}</span>
        {consult.status === "presenting" && (
          <button onClick={() => onDismiss(consult.id)} className="proto-btn-ghost ml-auto" style={{ padding: "3px 8px" }} aria-label="この相談を閉じる">
            <IconX size={13} />
          </button>
        )}
      </div>

      {consult.status === "requested" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }}>
            <IconWand size={15} className="proto-pulse" /> AIが考えています…
          </div>
          {[88, 72, 94, 60].map((w, i) => (
            <div key={i} className="proto-shimmer h-[13px] rounded-[5px]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {consult.status === "failed" && (
        <div className="flex flex-col items-start gap-3 rounded-[12px] p-4" style={{ background: "var(--p-red-weak)", border: "1px solid rgba(248,113,113,0.25)" }}>
          <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--p-red)" }}>
            <IconX size={15} /> 生成に失敗しました
          </div>
          <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>外部処理が応答しませんでした。同じ内容で再依頼できます。</div>
          <button onClick={() => onRetry(consult.id)} className="proto-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold" style={{ background: "var(--p-accent)", color: "#0a0c10" }}>
            <IconWand size={14} /> 再依頼する
          </button>
        </div>
      )}

      {consult.status === "presenting" && consult.result?.revise && (
        <ReviseProposalBody
          proposal={consult.result.revise}
          onApply={(t) => props.onApplyRevise(consult.id, t)}
          onDismiss={(t) => props.onDismissRevise(consult.id, t)}
        />
      )}
      {consult.status === "presenting" && consult.result?.overall && (
        <AdviceResultBody
          advice={consult.result.overall}
          articleId={articleId}
          adoptedFixes={adoptedFixes}
          onAdopt={(i) => props.onAdoptAdvice(consult.id, i)}
        />
      )}
      {consult.status === "presenting" && consult.result?.sentence && (
        <SentenceFixBody
          fixes={consult.result.sentence}
          onApplyFix={(b) => props.onApplyFix(consult.id, b)}
          onDismissFix={(b) => props.onDismissFix(consult.id, b)}
          onApplyAll={() => props.onApplyAll(consult.id)}
        />
      )}
    </section>
  );
}
