/**
 * 施策ビュー(#proto): 施策(proposal)を状態別に並べ、承認(=記事化)/保留/却下(理由)するトリアージ面。
 * 記事ビューと対称の master-detail。a/r は page 側で結線。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { IconArrowLeft, IconArrowRight, IconCheck, IconChart, IconList, IconPlus, IconX } from "./icons";
import type { Article, ProposalKind, ProposalStatus } from "./types";
import { KIND_META, approveOutcomeFor } from "./proposalKind";
import { ProposalDetailBody, KIND_ICON } from "./ProposalDetailBody";

const STATUS_META: Record<Exclude<ProposalStatus, "adopted">, { label: string; tone: string; order: number }> = {
  pending: { label: "未処理", tone: "var(--p-amber)", order: 0 },
  rejected: { label: "却下", tone: "var(--p-text-3)", order: 1 },
};
const ORDER: Exclude<ProposalStatus, "adopted">[] = ["pending", "rejected"];

/** 種別フィルタの選択肢（"all" + 全ProposalKind）。 */
const KIND_FILTER_OPTIONS: Array<ProposalKind | "all"> = ["all", "article", "site", "event", "other"];

interface ProposalViewProps {
  proposals: Article[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onApprove: (id: string) => void;
  onReopen: (id: string) => void;
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

export function ProposalView({ proposals, activeId, onActivate, onApprove, onReopen, onReject, onOpenForm }: ProposalViewProps) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  // Step 1: 種別フィルタ state
  const [kindFilter, setKindFilter] = useState<ProposalKind | "all">("all");
  // 狭幅(lg未満)の1ペイン制御: 一覧で施策を選ぶと詳細へ、戻る/トリアージ完了で一覧へ。lg以上は常に両ペイン。
  const [showDetailMobile, setShowDetailMobile] = useState(false);
  const openDetail = (id: string) => {
    onActivate(id);
    setShowDetailMobile(true);
  };
  const active = proposals.find((p) => p.id === activeId) ?? null;

  // Step 1: kindFilter を適用してから groups を作成
  const filteredProposals = kindFilter === "all"
    ? proposals
    : proposals.filter((p) => (p.proposalKind ?? "article") === kindFilter);

  const groups = ORDER.map((s) => ({ status: s, items: filteredProposals.filter((p) => p.proposalStatus === s) })).filter(
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

        {/* Step 1: 種別フィルタ chip 行 */}
        <div className="flex flex-wrap gap-1.5 px-4 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          {KIND_FILTER_OPTIONS.map((k) => {
            const isSelected = kindFilter === k;
            const count = k === "all"
              ? proposals.length
              : proposals.filter((p) => (p.proposalKind ?? "article") === k).length;
            const label = k === "all" ? "すべて" : KIND_META[k].label;
            return (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium transition-colors"
                style={{
                  background: isSelected ? "var(--p-bg-active)" : "transparent",
                  border: `1px solid ${isSelected ? "var(--p-accent)" : "var(--p-border)"}`,
                  color: isSelected ? "var(--p-text)" : "var(--p-text-3)",
                }}
              >
                {label}
                <span className="tabular-nums" style={{ color: "var(--p-text-3)" }}>{count}</span>
              </button>
            );
          })}
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
              // Step 2: カードの種別chip 用
              const cardKind = p.proposalKind ?? "article";
              const CardKindIcon = KIND_ICON[cardKind];
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
                  {/* Step 2: 種別chip（タイトル行の前） */}
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium self-start" style={{ color: KIND_META[cardKind].tone }}>
                    <CardKindIcon size={12} /> {KIND_META[cardKind].label}
                  </span>
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
              {/* Step 3: 詳細ヘッダに種別chip を先頭追加 */}
              {(() => {
                const detailKind = active.proposalKind ?? "article";
                const DetailKindIcon = KIND_ICON[detailKind];
                return (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: KIND_META[detailKind].tone }}>
                    <DetailKindIcon size={12} /> {KIND_META[detailKind].label}
                  </span>
                );
              })()}
              <span className="ml-2 rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}>
                {active.proposalCategory}
              </span>
              <h1 className="mt-3 text-[19px] font-semibold leading-snug tracking-tight">{active.title}</h1>
              {active.evidence && <div className="mt-2.5"><EvidenceChips items={active.evidence} /></div>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* Step 3: hypothesis グリッドを ProposalDetailBody に置換 */}
              <ProposalDetailBody article={active} />
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
                <button onClick={() => { onReopen(active.id); setShowDetailMobile(false); }} className="proto-btn-ghost">未処理に戻す</button>
              ) : active.proposalStatus === "adopted" ? (
                /* Step 5: adopted reopen */
                <div className="flex flex-col gap-2">
                  {(() => {
                    const adoptedKind = active.proposalKind ?? "article";
                    const o = approveOutcomeFor(adoptedKind);
                    return (
                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-green)" }}>
                        <IconCheck size={13} /> {o.done}
                      </div>
                    );
                  })()}
                  <button onClick={() => { onReopen(active.id); setShowDetailMobile(false); }} className="proto-btn-ghost self-start">未処理に戻す</button>
                </div>
              ) : (
                <div className="flex flex-col">
                  {/* Step 4: 結末プレビュー行 */}
                  {(() => {
                    const footerKind = active.proposalKind ?? "article";
                    const o = approveOutcomeFor(footerKind);
                    const FooterKindIcon = KIND_ICON[footerKind];
                    return (
                      <div className="mb-2.5 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-text-3)" }}>
                        <span style={{ color: KIND_META[footerKind].tone, display: "inline-flex" }}><FooterKindIcon size={13} /></span>
                        承認すると <span style={{ color: KIND_META[footerKind].tone }}>{o.preview}</span> へ
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setRejecting(true)} className="proto-btn-ghost" style={{ color: "var(--p-red)" }}>
                      <IconX size={14} /> 却下
                    </button>
                    <button
                      onClick={() => { onApprove(active.id); setShowDetailMobile(false); }}
                      className="proto-btn-primary ml-auto flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold sm:w-auto sm:justify-start"
                      style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                    >
                      <IconCheck size={15} /> {approveOutcomeFor(active.proposalKind ?? "article").buttonLabel} <span className="hidden opacity-70 sm:inline">A</span> <IconArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </footer>
          </motion.div>
        )}
      </div>
    </div>
  );
}
