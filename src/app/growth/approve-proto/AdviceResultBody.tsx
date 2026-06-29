/**
 * advice 提示ボディ(#proto・往復統合): 採点・強み・直すべき点。
 * ConsultCard から presenting 時に描画される。status/依頼フォームは持たない。
 */
"use client";

import { IconArrowDown, IconArrowUp, IconChart, IconCheck } from "./icons";
import type { Advice } from "./types";
import { RingScore } from "./ui";

interface AdviceResultBodyProps {
  advice: Advice;
  articleId: string;
  adoptedFixes: Set<string>;
  onAdopt: (index: number) => void;
}

export function AdviceResultBody({ advice, articleId, adoptedFixes, onAdopt }: AdviceResultBodyProps) {
  return (
    <div className="flex flex-col gap-5">
      <div
        className="flex items-center gap-4 rounded-[12px] p-4"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <RingScore value={advice.overall} size={64} />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            総評
          </div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--p-text-2)" }}>
            公開可能な水準。内部リンク導線をひと押しすると、さらに良くなります。
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {advice.scores.map((s) => (
          <div
            key={s.label}
            className="rounded-[10px] p-3"
            style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: "var(--p-text-2)" }}>{s.label}</span>
              <span className="text-[12px] font-semibold tabular-nums">{s.score}</span>
            </div>
            <div className="mt-2 h-[5px] overflow-hidden rounded-full" style={{ background: "var(--p-bg-active)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, s.score)}%`,
                  background: s.score >= 80 ? "var(--p-green)" : s.score >= 65 ? "var(--p-accent)" : "var(--p-amber)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--p-green)" }}>
          <IconArrowUp size={14} /> 強み
        </div>
        <ul className="flex flex-col gap-1.5">
          {advice.strengths.map((s, i) => (
            <li key={i} className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
              ・{s}
            </li>
          ))}
        </ul>
      </div>

      {advice.fixes.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--p-amber)" }}>
            <IconArrowDown size={14} /> 直すべき点
          </div>
          <div className="flex flex-col gap-2.5">
            {advice.fixes.map((f, i) => {
              const adopted = adoptedFixes.has(`${articleId}:${i}`);
              return (
                <div
                  key={i}
                  className="rounded-[10px] p-3"
                  style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
                >
                  <div
                    className="border-l-2 pl-2.5 text-[12.5px] italic"
                    style={{ borderColor: "var(--p-amber)", color: "var(--p-text-2)" }}
                  >
                    「{f.quote}」
                  </div>
                  <div className="mt-2 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
                    {f.reason}
                  </div>
                  <div className="mt-1.5 flex items-start gap-1.5 text-[12.5px]" style={{ color: "var(--p-accent-ink)" }}>
                    <IconChart size={13} {...{ style: { marginTop: 2, color: "var(--p-accent)" } }} />
                    {f.suggestion}
                  </div>
                  <div className="mt-2.5 flex justify-end">
                    {adopted ? (
                      <span
                        className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-[5px] text-[11.5px] font-medium"
                        style={{ background: "var(--p-green-weak)", color: "var(--p-green)" }}
                      >
                        <IconCheck size={13} /> 反映済み
                      </span>
                    ) : (
                      <button onClick={() => onAdopt(i)} className="proto-btn-ghost">
                        <IconCheck size={13} /> 本文に反映
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
