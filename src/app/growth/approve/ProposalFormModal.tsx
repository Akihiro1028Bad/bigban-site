/**
 * 施策作成モーダル(#P5a・proto 移植): 種別セグメント4ボタン＋施策名＋(article は)カテゴリ6値チップ＋メモ。
 *
 * proto `approve-proto/ProposalFormModal.tsx` の見た目(role="dialog" aria-modal＋framer-motion＋
 * セグメント)を本番へ移植し、送信を純ロジック `validateProposalForm` で整形して既存
 * `POST /api/growth/proposals`(AddProposalForm と同一経路・onAdded コールバック)へ結線する。
 *
 * 差分(確定した設計判断・縮約):
 * - persist されるのは既存 API の {name, category, note} のみ(Notion 未拡張)。
 *   種別(kind)は `validateProposalForm` 内で既存6値カテゴリへ写像し、site/event/other の
 *   詳細フィールド(何を変える/いつ/対象 等)は persist できないため入力欄を出さない。
 *   非 article 種別は「(詳細は登録後に編集)」の注記のみ表示して誤解を避ける。
 * - 検証・写像の純ロジックは proposalForm.ts に集約(100% テスト済み)。本ファイルは presentation。
 */
"use client";

import { useState } from "react";

import { motion } from "framer-motion";

import { PROPOSAL_CATEGORIES } from "@/lib/growth/proposals";
import { validateProposalForm } from "@/lib/growth/proposalForm";
import { KIND_META } from "@/lib/growth/proposalKind";

import type { AddedProposal } from "./AddProposalForm";
import { sessionHeaders } from "./sessionHeaders";
import { toMessage } from "./errorMessage";
import { handleOverlayKeyDown } from "./hooks/overlayKeyDown";
import { useDialog } from "./hooks/useDialog";
import type { ProposalKind } from "./types";
import { IconPlus } from "./ui/icons";
import { Kbd } from "./ui/primitives";

const KIND_KEYS: ProposalKind[] = ["article", "site", "event", "other", "system"];

const FIELD_STYLE = {
  background: "var(--p-bg-input)",
  border: "1px solid var(--p-border)",
  color: "var(--p-text)",
} as const;

interface ProposalFormModalProps {
  token: string;
  initialName?: string;
  initialNote?: string;
  onClose: () => void;
  onAdded: (item: AddedProposal) => void;
}

function segmentStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "var(--p-accent-weak)" : "var(--p-bg-input)",
    color: active ? "var(--p-accent)" : "var(--p-text-3)",
    border: active ? "1px solid var(--p-accent)" : "1px solid var(--p-border)",
  };
}

export function ProposalFormModal({ token: _token, initialName = "", initialNote = "", onClose, onAdded }: ProposalFormModalProps) {
  const [kind, setKind] = useState<ProposalKind>("article");
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<string>(PROPOSAL_CATEGORIES[0]);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dialogRef = useDialog();

  async function handleSubmit(): Promise<void> {
    const validation = validateProposalForm({ name, kind, category, note });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/growth/proposals", {
        method: "POST",
        headers: sessionHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(validation.payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "追加に失敗しました。");
      }
      onAdded(json.item);
      onClose();
    } catch (caught) {
      setError(toMessage(caught, "追加に失敗しました。"));
    } finally {
      setBusy(false);
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
        onKeyDown={(e) => handleOverlayKeyDown(e, onClose)}
        className="w-full max-w-[480px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div
          className="flex items-center gap-2 px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--p-border)" }}
        >
          <IconPlus size={16} style={{ color: "var(--p-accent)" }} />
          <span className="text-[14px] font-semibold" style={{ color: "var(--p-text)" }}>
            施策を追加
          </span>
          <button type="button" onClick={onClose} className="ml-auto" aria-label="閉じる">
            <Kbd>esc</Kbd>
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* 種別セグメント */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>
              種別
            </label>
            <div className="flex flex-wrap gap-1.5">
              {KIND_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={k === kind}
                  className="rounded-[8px] px-2.5 py-[6px] text-[12px] font-medium"
                  style={segmentStyle(k === kind)}
                >
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
          </div>

          {/* 施策名(共通・必須) */}
          <div>
            <label
              htmlFor="proposal-name"
              className="mb-1.5 block text-[12px] font-medium"
              style={{ color: "var(--p-text-2)" }}
            >
              施策名 *
            </label>
            <input
              id="proposal-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例）雨の日でも楽しめる屋内ピックルボール"
              className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
              style={FIELD_STYLE}
            />
          </div>

          {/* article: カテゴリ6値チップ */}
          {kind === "article" ? (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>
                カテゴリ
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PROPOSAL_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={c === category}
                    className="rounded-[8px] px-2.5 py-[6px] text-[12px] font-medium"
                    style={segmentStyle(c === category)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--p-text-3)" }}>
              「{KIND_META[kind].label}」として登録します。詳細は登録後の編集で追記してください。
            </p>
          )}

          {/* メモ(共通・任意) */}
          <div>
            <label
              htmlFor="proposal-note"
              className="mb-1.5 block text-[12px] font-medium"
              style={{ color: "var(--p-text-2)" }}
            >
              メモ(狙い・読者)
            </label>
            <textarea
              id="proposal-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例）梅雨〜夏の検討層に、屋内施設の快適さで差別化"
              rows={3}
              className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
              style={FIELD_STYLE}
            />
          </div>

          {error ? (
            <p role="alert" className="text-[12px]" style={{ color: "var(--p-red)" }}>
              {error}
            </p>
          ) : null}
        </div>

        <div
          className="flex items-center gap-2 px-5 py-3.5"
          style={{ borderTop: "1px solid var(--p-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-[9px] px-3 py-2 text-[13px] font-medium"
            style={{ color: "var(--p-text-2)", border: "1px solid var(--p-border)" }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="ml-auto flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
          >
            <IconPlus size={14} /> 施策を追加
          </button>
        </div>
      </motion.div>
    </div>
  );
}
