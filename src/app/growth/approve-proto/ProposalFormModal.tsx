/**
 * 施策の構造化登録フォーム(#proto): 種別セグメント＋施策名＋種別別フィールド＋メモ。
 * 種別(article/site/event/other)によって入力フィールドが切り替わる。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { IconPlus } from "./icons";
import { Kbd } from "./ui";
import { useDialog } from "./useDialog";
import { KIND_META } from "./proposalKind";
import type { ProposalKind, SiteProposalDetail, EventProposalDetail } from "./types";

const CATEGORIES = ["SEO記事", "季節・イベント", "比較・選び方", "施設・体験", "法人・団体", "お知らせ"];

const KIND_KEYS: ProposalKind[] = ["article", "site", "event", "other"];

interface ProposalFormModalProps {
  onClose: () => void;
  onSubmit: (data: {
    kind: ProposalKind;
    title: string;
    category: string;
    note: string;
    siteDetail?: SiteProposalDetail;
    eventDetail?: EventProposalDetail;
    freeNote?: string;
  }) => void;
}

export function ProposalFormModal({ onClose, onSubmit }: ProposalFormModalProps) {
  const [kind, setKind] = useState<ProposalKind>("article");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");

  // site fields
  const [whatChange, setWhatChange] = useState("");
  const [whereTarget, setWhereTarget] = useState("");
  const [whyReason, setWhyReason] = useState("");

  // event fields
  const [whenLabel, setWhenLabel] = useState("");
  const [audience, setAudience] = useState("");
  const [format, setFormat] = useState("");

  // other field
  const [freeNote, setFreeNote] = useState("");

  const canSubmit =
    title.trim().length > 0 && (kind !== "site" || whatChange.trim().length > 0);

  const dialogRef = useDialog();

  function handleSubmit() {
    if (!canSubmit) return;
    const base = { kind, title: title.trim(), note: note.trim() };
    if (kind === "article") {
      onSubmit({ ...base, category });
    } else if (kind === "site") {
      const siteDetail: SiteProposalDetail = {
        whatChange: whatChange.trim(),
        ...(whereTarget.trim() ? { whereTarget: whereTarget.trim() } : {}),
        ...(whyReason.trim() ? { whyReason: whyReason.trim() } : {}),
      };
      onSubmit({ ...base, category: "", siteDetail });
    } else if (kind === "event") {
      const eventDetail: EventProposalDetail = {
        whenLabel: whenLabel.trim() || "未定",
        ...(audience.trim() ? { audience: audience.trim() } : {}),
        ...(format.trim() ? { format: format.trim() } : {}),
      };
      onSubmit({ ...base, category: "", eventDetail });
    } else {
      onSubmit({ ...base, category: "", freeNote: freeNote.trim() });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="施策を追加"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-[14px]"
        style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border-strong)", boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconPlus size={16} {...{ style: { color: "var(--p-accent)" } }} />
          <span className="text-[14px] font-semibold">施策を追加</span>
          <button onClick={onClose} className="ml-auto"><Kbd>esc</Kbd></button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* 種別セグメント */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>種別</label>
            <div className="flex flex-wrap gap-1.5">
              {KIND_KEYS.map((k) => {
                const active = k === kind;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className="rounded-[8px] px-2.5 py-[6px] text-[12px] font-medium"
                    style={{
                      background: active ? "var(--p-accent-weak)" : "var(--p-bg-input)",
                      color: active ? "var(--p-accent)" : "var(--p-text-3)",
                      border: active ? "1px solid var(--p-accent)" : "1px solid var(--p-border)",
                    }}
                  >
                    {KIND_META[k].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 施策名（共通） */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>施策名 *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例）雨の日でも楽しめる屋内ピックルボール"
              className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>

          {/* 種別別フィールド */}
          {kind === "article" && (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>カテゴリ</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => {
                  const active = c === category;
                  return (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className="rounded-[8px] px-2.5 py-[6px] text-[12px] font-medium"
                      style={{
                        background: active ? "var(--p-accent-weak)" : "var(--p-bg-input)",
                        color: active ? "var(--p-accent)" : "var(--p-text-3)",
                        border: active ? "1px solid var(--p-accent)" : "1px solid var(--p-border)",
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {kind === "site" && (
            <>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>何を変える *</label>
                <input
                  value={whatChange}
                  onChange={(e) => setWhatChange(e.target.value)}
                  placeholder="例）ヒーローのコピーをピックルボール体験訴求に"
                  className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
                  style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>どこを</label>
                <input
                  value={whereTarget}
                  onChange={(e) => setWhereTarget(e.target.value)}
                  placeholder="例）トップページ ヒーローセクション"
                  className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
                  style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>なぜ</label>
                <textarea
                  value={whyReason}
                  onChange={(e) => setWhyReason(e.target.value)}
                  placeholder="例）初訪問者がピックルボールを知らず離脱している"
                  rows={2}
                  className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
                  style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                />
              </div>
            </>
          )}

          {kind === "event" && (
            <>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>いつ</label>
                <input
                  value={whenLabel}
                  onChange={(e) => setWhenLabel(e.target.value)}
                  placeholder="例）7月中旬（未確定）"
                  className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
                  style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>対象</label>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="例）法人・チーム・ファミリー"
                  className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
                  style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>形式</label>
                <input
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  placeholder="例）体験会 / 大会 / ワークショップ"
                  className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
                  style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                />
              </div>
            </>
          )}

          {kind === "other" && (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>内容</label>
              <textarea
                value={freeNote}
                onChange={(e) => setFreeNote(e.target.value)}
                placeholder="施策の内容を自由に記述してください"
                rows={3}
                className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
                style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
              />
            </div>
          )}

          {/* メモ（共通） */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>メモ（狙い・読者）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例）梅雨〜夏の検討層に、屋内施設の快適さで差別化"
              rows={3}
              className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderTop: "1px solid var(--p-border)" }}>
          <button onClick={onClose} className="proto-btn-ghost">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="proto-btn-primary ml-auto flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconPlus size={14} /> 施策を追加
          </button>
        </div>
      </motion.div>
    </div>
  );
}
