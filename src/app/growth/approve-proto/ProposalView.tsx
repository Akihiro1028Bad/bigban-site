/**
 * 施策ビュー(#proto): 施策(proposal)を状態別に並べ、承認(=記事化)/保留/却下(理由)するトリアージ面。
 * 記事ビューと対称の master-detail。a/r は page 側で結線。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { IconArrowLeft, IconArrowRight, IconCheck, IconChart, IconList, IconPlus, IconX } from "./icons";
import type { Article, ProposalStatus } from "./types";

const STATUS_META: Record<Exclude<ProposalStatus, "adopted">, { label: string; tone: string; order: number }> = {
  pending: { label: "未処理", tone: "var(--p-amber)", order: 0 },
  considering: { label: "検討中", tone: "var(--p-accent)", order: 1 },
  rejected: { label: "却下", tone: "var(--p-text-3)", order: 2 },
};
const ORDER: Exclude<ProposalStatus, "adopted">[] = ["pending", "considering", "rejected"];

interface ProposalViewProps {
  proposals: Article[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onApprove: (id: string) => void;
  onHold: (id: string) => void;
  onReject: (id: string, note: string) => void;
  onOpenForm: () => void;
}

function EvidenceChips({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((e) => (
        <span
          key={e}
          className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px]"
          style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
        >
          <IconChart size={11} {...{ style: { color: "var(--p-text-3)" } }} />
          {e}
        </span>
      ))}
    </span>
  );
}

export function ProposalView({ proposals, activeId, onActivate, onApprove, onHold, onReject, onOpenForm }: ProposalViewProps) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  // 狭幅(lg未満)の1ペイン制御: 一覧で施策を選ぶと詳細へ、戻る/トリアージ完了で一覧へ。lg以上は常に両ペイン。
  const [showDetailMobile, setShowDetailMobile] = useState(false);
  const openDetail = (id: string) => {
    onActivate(id);
    setShowDetailMobile(true);
  };
  const active = proposals.find((p) => p.id === activeId) ?? null;
  const groups = ORDER.map((s) => ({ status: s, items: proposals.filter((p) => p.proposalStatus === s) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`${showDetailMobile ? "hidden lg:block" : "block"} w-full overflow-y-auto lg:w-[40%] lg:min-w-[340px] lg:max-w-[500px]`}
        style={{ borderRight: "1px solid var(--p-border)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconList size={16} {...{ style: { color: "var(--p-accent)" } }} />
          <span className="text-[14px] font-semibold">施策</span>
          <button onClick={onOpenForm} className="proto-btn-ghost ml-auto">
            <IconPlus size={13} /> 手動で追加
          </button>
        </div>
        {groups.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--p-text-3)" }}>
            施策はありません。
          </div>
        )}
        {groups.map((g) => (
          <section key={g.status} className="py-1">
            <div className="flex items-center gap-2 px-4 py-[7px]">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_META[g.status].tone }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-2)" }}>
                {STATUS_META[g.status].label}
              </span>
              <span className="tabular-nums text-[11px]" style={{ color: "var(--p-text-3)" }}>{g.items.length}</span>
            </div>
            {g.items.map((p) => {
              const isActive = p.id === activeId;
              return (
                <button
                  key={p.id}
                  onClick={() => openDetail(p.id)}
                  className="relative flex w-full flex-col gap-1.5 px-4 py-[11px] text-left transition-colors"
                  style={{ background: isActive ? "var(--p-bg-raised)" : "transparent" }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--p-bg-hover)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  {isActive && <span className="absolute inset-y-1 left-0 w-[3px] rounded-full" style={{ background: "var(--p-accent)" }} />}
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">{p.title}</span>
                  </span>
                  <span className="rounded-full px-2 py-[1px] text-[10.5px] self-start" style={{ background: "var(--p-bg-active)", color: "var(--p-text-3)" }}>
                    {p.proposalCategory}
                  </span>
                  {p.evidence && <EvidenceChips items={p.evidence.slice(0, 3)} />}
                </button>
              );
            })}
          </section>
        ))}
      </div>

      <div
        className={`${showDetailMobile ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto`}
        style={{ background: "var(--p-bg)" }}
      >
        {!active ? (
          <div className="flex h-full items-center justify-center text-[13px]" style={{ color: "var(--p-text-3)" }}>
            施策を選んでください
          </div>
        ) : (
          <motion.div key={active.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="flex h-full flex-col">
            <div className="px-6 pt-5 pb-3" style={{ borderBottom: "1px solid var(--p-border)" }}>
              <div className="mb-2.5 lg:hidden">
                <button onClick={() => setShowDetailMobile(false)} className="proto-btn-ghost" aria-label="施策一覧へ戻る">
                  <IconArrowLeft size={14} /> 施策一覧
                </button>
              </div>
              <span className="rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}>
                {active.proposalCategory}
              </span>
              <h1 className="mt-3 text-[19px] font-semibold leading-snug tracking-tight">{active.title}</h1>
              {active.evidence && <div className="mt-2.5"><EvidenceChips items={active.evidence} /></div>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {active.hypothesis && (
                <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
                  {[
                    ["記事タイプ", active.hypothesis.articleType],
                    ["狙う読者", active.hypothesis.targetReader],
                    ["検索意図", active.hypothesis.searchIntent],
                    ["勝ち筋", active.hypothesis.winningAngle],
                    ["成功指標", active.hypothesis.successMetric],
                    ["想定CTA", active.hypothesis.plannedCta],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
                      <div className="mt-[1px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
              {active.proposalStatus === "rejected" && active.proposalRejectNote && (
                <div className="mt-4 rounded-[10px] p-3 text-[12.5px]" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)", color: "var(--p-text-3)" }}>
                  却下理由: {active.proposalRejectNote}
                </div>
              )}
            </div>

            <footer className="px-6 py-3.5" style={{ borderTop: "1px solid var(--p-border)", background: "var(--p-bg-elevated)" }}>
              {rejecting ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="却下理由（必須）"
                    className="h-[36px] flex-1 rounded-[9px] px-3 text-[13px] outline-none"
                    style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                  />
                  <button onClick={() => setRejecting(false)} className="proto-btn-ghost">取消</button>
                  <button
                    onClick={() => { if (note.trim()) { onReject(active.id, note.trim()); setRejecting(false); setNote(""); setShowDetailMobile(false); } }}
                    disabled={!note.trim()}
                    className="proto-btn-primary rounded-[9px] px-3 py-2 text-[12.5px] font-semibold disabled:opacity-40"
                    style={{ background: "var(--p-red)", color: "#1a0808" }}
                  >
                    却下する
                  </button>
                </div>
              ) : active.proposalStatus === "rejected" ? (
                <button onClick={() => { onHold(active.id); setShowDetailMobile(false); }} className="proto-btn-ghost">検討中に戻す</button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setRejecting(true)} className="proto-btn-ghost" style={{ color: "var(--p-red)" }}>
                    <IconX size={14} /> 却下
                  </button>
                  <button onClick={() => { onHold(active.id); setShowDetailMobile(false); }} className="proto-btn-ghost">保留</button>
                  <button
                    onClick={() => { onApprove(active.id); setShowDetailMobile(false); }}
                    className="proto-btn-primary ml-auto flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold sm:w-auto sm:justify-start"
                    style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                  >
                    <IconCheck size={15} /> 承認して記事化 <span className="hidden opacity-70 sm:inline">A</span> <IconArrowRight size={14} />
                  </button>
                </div>
              )}
            </footer>
          </motion.div>
        )}
      </div>
    </div>
  );
}
