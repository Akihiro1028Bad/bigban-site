/**
 * sentence 提示ボディ(#proto・往復統合): 指摘への修正案(元→新)を個別/一括反映。
 * ConsultCard から presenting 時に描画される。
 */
"use client";

import { IconCheck } from "./icons";
import type { BodyCommentFix } from "./types";

interface SentenceFixBodyProps {
  fixes: BodyCommentFix[];
  onApplyFix: (block: number) => void;
  onDismissFix: (block: number) => void;
  onApplyAll: () => void;
}

export function SentenceFixBody({ fixes, onApplyFix, onDismissFix, onApplyAll }: SentenceFixBodyProps) {
  return (
    <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          指摘への修正案（元 → 新）
        </span>
        <button
          onClick={onApplyAll}
          className="proto-btn-primary ml-auto flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
          style={{ background: "var(--p-green)", color: "#06140d" }}
        >
          <IconCheck size={13} /> すべて反映
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {fixes.map((f) => (
          <div key={f.block} className="rounded-[10px] p-3" style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
              {f.from}
            </div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
              {f.from}{" "}
              <span style={{ background: "var(--p-green-weak)", color: "var(--p-green)", borderRadius: 4, padding: "1px 4px" }}>
                {f.sentence}
              </span>
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <button onClick={() => onDismissFix(f.block)} className="proto-btn-ghost" style={{ color: "var(--p-text-3)" }}>
                却下
              </button>
              <button
                onClick={() => onApplyFix(f.block)}
                className="proto-btn-primary flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
                style={{ background: "var(--p-green)", color: "#06140d" }}
              >
                <IconCheck size={13} /> 本文へ反映
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
