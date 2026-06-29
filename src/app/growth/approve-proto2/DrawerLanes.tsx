/**
 * ドロワーの内容レーン(#proto2): 校正レーン(指摘→依頼→戻り承認)と素材レーン(画像指示)。
 * 既存ロジック(advice / imageIntent)を再利用しつつ proto2(クリアデイ)の質感で表示する。
 */
"use client";

import { useState } from "react";

import { effectiveMode, resolveAction } from "../approve-proto/imageIntent";
import type { Article } from "../approve-proto/types";

function ZoneHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--p-text)" }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: "var(--p-muted)" }}>{hint}</span>}
    </div>
  );
}

/** 校正レーン: AIアドバイスの採点＋指摘、行コメント。指摘→依頼→戻り承認の同型ループ。 */
export function ProofLane({ article }: { article: Article }) {
  const advice = article.advice;
  const [comments, setComments] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [adopted, setAdopted] = useState<Set<number>>(new Set());

  const add = () => {
    if (!draft.trim()) return;
    setComments((c) => [...c, draft.trim()]);
    setDraft("");
  };

  return (
    <section style={{ marginTop: 18, paddingTop: 16, borderTop: "0.5px solid var(--p-border)" }}>
      <ZoneHeader label="校正レーン" hint="指摘 → 依頼 → 戻り承認" />

      {advice.overall > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, padding: "2px 10px", borderRadius: 999, background: "var(--p-ready-weak)", color: "var(--p-ready)", fontSize: 12 }}>
            総合 <b className="proto2-num" style={{ fontWeight: 500 }}>{advice.overall}</b>
          </span>
          {advice.scores.map((s) => (
            <span key={s.label} className="proto2-num" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--p-text-2)" }}>
              {s.label}
              <span style={{ display: "inline-block", width: 40, height: 4, borderRadius: 999, background: "var(--p-surface-active)", overflow: "hidden", position: "relative" }}>
                <span style={{ position: "absolute", inset: 0, width: `${s.score * 10}%`, background: "var(--p-accent)" }} />
              </span>
            </span>
          ))}
        </div>
      )}

      {advice.fixes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {advice.fixes.map((f, i) => {
            const done = adopted.has(i);
            return (
              <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: done ? "var(--p-ready-weak)" : "var(--p-surface-2)", border: "0.5px solid var(--p-border)" }}>
                <div style={{ fontSize: 12, color: "var(--p-text-2)" }}>
                  <span style={{ color: "var(--p-fail)" }}>指摘:</span> {f.reason}
                </div>
                <div style={{ fontSize: 12, color: "var(--p-text-3)", marginTop: 3 }}>
                  「{f.quote}」 → {f.suggestion}
                </div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                  {done ? (
                    <span style={{ fontSize: 11.5, color: "var(--p-ready)" }}>✓ 反映を依頼済み</span>
                  ) : (
                    <button onClick={() => setAdopted((s) => new Set(s).add(i))} className="proto2-btn" style={{ padding: "4px 10px" }}>
                      反映を依頼
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {comments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {comments.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--p-info-weak)", fontSize: 12, color: "var(--p-text-2)" }}>
              <span style={{ color: "var(--p-info)" }}>＊</span> {c}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="気になる箇所を指摘…"
          style={{ flex: 1, minWidth: 0, height: 34, borderRadius: 7, border: "0.5px solid var(--p-border)", background: "var(--p-surface)", padding: "0 11px", fontSize: 12.5, color: "var(--p-text)", outline: "none" }}
        />
        <button onClick={add} disabled={!draft.trim()} className="proto2-btn" style={{ opacity: draft.trim() ? 1 : 0.5 }}>追加</button>
      </div>
    </section>
  );
}

const MODE_LABEL: Record<string, string> = { off: "画像なし", auto: "おまかせ", custom: "指定" };

/** 素材レーン: 各見出しの画像指示(off/おまかせ/指定)。house styleロックを明示。 */
export function MaterialsLane({ article }: { article: Article }) {
  return (
    <section style={{ marginTop: 18, paddingTop: 16, borderTop: "0.5px solid var(--p-border)" }}>
      <ZoneHeader label="素材" hint="宇宙人マスコット×コスミックで自動統一" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {article.outline.map((s, i) => {
          const mode = effectiveMode(s.imageInstruction);
          const action = mode === "custom" ? s.imageInstruction?.action ?? "" : mode === "auto" ? resolveAction(s) : "";
          const toneColor = mode === "off" ? "var(--p-muted)" : mode === "custom" ? "var(--p-accent)" : "var(--p-text-2)";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--p-surface-2)", border: "0.5px solid var(--p-border)" }}>
              <span style={{ width: 32, height: 24, flexShrink: 0, borderRadius: 5, background: mode === "off" ? "var(--p-surface-active)" : "var(--p-info-weak)", border: "0.5px solid var(--p-border)" }} />
              <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, color: "var(--p-text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {i + 1}. {s.heading}
              </span>
              <span style={{ fontSize: 11.5, color: toneColor, flexShrink: 0 }}>
                {MODE_LABEL[mode]}
                {action && mode !== "off" ? `：${action}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
