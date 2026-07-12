/**
 * 本文画像 AI 再生成の生成モーダル(#156/P2)。スタイル6択チップ＋自由指示(500字)＋
 * 文字・数値入力欄(textSpec・1000字)を集め、確定で親へ入力を渡す(依頼は親=ApproveClient が実行)。
 * P2 では画像タブ「AIで再生成」からのみ起動する(P3 でエディタからも同モーダルを使う前提の共通設計)。
 * 薄い presentation(dialog/フォーカストラップ/入力→onSubmit の結線)のためカバレッジ除外。
 * 純ロジック(チップ定義・送信 body)は bodyRegenRequest.ts でテスト済み。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { BODY_IMAGE_STYLE_CHIPS, type BodyImageRegenInput } from "./bodyRegenRequest";
import { handleOverlayKeyDown } from "./hooks/overlayKeyDown";
import { useDialog } from "./hooks/useDialog";
import { IconSparkles } from "./ui/icons";
import { Kbd } from "./ui/primitives";
import type { RequestedBodyImageStyle } from "@/lib/growth/bodyImage";

const MAX_INSTRUCTION = 500;
const MAX_TEXTSPEC = 1000;

interface BodyImageRegenModalProps {
  /** 見出し(記事タイトルなど)。 */
  heading: string;
  onClose: () => void;
  /** 確定で入力を親へ渡す(親が API 依頼を実行する)。 */
  onSubmit: (input: BodyImageRegenInput) => void;
}

export function BodyImageRegenModal({ heading, onClose, onSubmit }: BodyImageRegenModalProps) {
  const [style, setStyle] = useState<RequestedBodyImageStyle>("auto");
  const [instruction, setInstruction] = useState("");
  const [textSpec, setTextSpec] = useState("");
  const dialogRef = useDialog();

  function handleSubmit(): void {
    onSubmit({ style, instruction: instruction.trim(), textSpec: textSpec.trim() });
  }

  return (
    <div
      className="approve-shell fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`本文画像をAIで再生成: ${heading}`}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOverlayKeyDown(e, onClose)}
        className="w-full max-w-[560px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <span className="min-w-0 truncate text-[14px] font-semibold">{heading}</span>
          <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto">
            <Kbd>esc</Kbd>
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              スタイル
            </legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="本文画像スタイル">
              {BODY_IMAGE_STYLE_CHIPS.map((chip) => {
                const selected = chip.key === style;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setStyle(chip.key)}
                    className="rounded-full px-3 py-[6px] text-[12.5px]"
                    style={{
                      background: selected ? "var(--p-accent)" : "var(--p-bg-raised)",
                      color: selected ? "#0a0c10" : "var(--p-text-2)",
                      border: "1px solid var(--p-border)",
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="body-regen-instruction" className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              指示（任意）
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--p-text-3)" }}>
                {instruction.length}/{MAX_INSTRUCTION}
              </span>
            </label>
            <textarea
              id="body-regen-instruction"
              value={instruction}
              maxLength={MAX_INSTRUCTION}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              placeholder="どんな画像にしたいか（空ならおまかせ）"
              className="w-full resize-none rounded-[8px] p-2.5 text-[12.5px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>

          <div>
            <label htmlFor="body-regen-textspec" className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              図に入れる文字・数値（任意）
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--p-text-3)" }}>
                {textSpec.length}/{MAX_TEXTSPEC}
              </span>
            </label>
            <textarea
              id="body-regen-textspec"
              value={textSpec}
              maxLength={MAX_TEXTSPEC}
              onChange={(e) => setTextSpec(e.target.value)}
              rows={2}
              placeholder="コート寸法・手順名など、図に焼き込む文字を1行ずつ"
              className="w-full resize-none rounded-[8px] p-2.5 text-[12.5px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>

          <p className="text-[12px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
            AI生成は数分かかります。完了すると自動反映され、LINEに通知されます。
          </p>

          <button
            type="button"
            onClick={handleSubmit}
            aria-label="本文画像の再生成を依頼"
            className="approve-btn-primary ml-auto flex items-center gap-1.5 rounded-[8px] px-3.5 py-[8px] text-[12.5px] font-semibold"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconSparkles size={13} /> AIで再生成を依頼
          </button>
        </div>
      </motion.div>
    </div>
  );
}
