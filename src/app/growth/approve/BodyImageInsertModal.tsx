/**
 * 本文画像の新規挿入位置を選ぶ薄い presentation。
 * h2 見出し候補と末尾を選び、挿入方法だけ親へ返す。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { extractBodyHeadings } from "@/lib/growth/bodyImageInsert";

import { handleOverlayKeyDown } from "./hooks/overlayKeyDown";
import { useDialog } from "./hooks/useDialog";
import { IconImage, IconSparkles } from "./ui/icons";
import { Kbd } from "./ui/primitives";

export interface BodyImageInsertChoice {
  headingIndex: number | null;
  method: "media" | "ai";
}

interface BodyImageInsertModalProps {
  heading: string;
  bodyHtml: string;
  onClose: () => void;
  onSubmit: (choice: BodyImageInsertChoice) => void;
}

export function BodyImageInsertModal({
  heading,
  bodyHtml,
  onClose,
  onSubmit,
}: BodyImageInsertModalProps) {
  const headings = extractBodyHeadings(bodyHtml);
  const [headingIndex, setHeadingIndex] = useState<number | null>(null);
  const dialogRef = useDialog();

  function handleSubmit(method: BodyImageInsertChoice["method"]): void {
    onSubmit({ headingIndex, method });
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
        aria-label={`本文画像を追加: ${heading}`}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOverlayKeyDown(e, onClose)}
        className="w-full max-w-[520px] overflow-hidden rounded-[14px]"
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
              挿入位置
            </legend>
            <div className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-[12.5px]" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
                <input
                  type="radio"
                  name="body-image-insert-position"
                  checked={headingIndex === null}
                  onChange={() => setHeadingIndex(null)}
                />
                本文の末尾
              </label>
              {headings.map((h) => (
                <label
                  key={h.index}
                  className="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-[12.5px]"
                  style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
                >
                  <input
                    type="radio"
                    name="body-image-insert-position"
                    checked={headingIndex === h.index}
                    onChange={() => setHeadingIndex(h.index)}
                  />
                  {h.text} の後
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="approve-btn-ghost">
              キャンセル
            </button>
            <button type="button" onClick={() => handleSubmit("media")} className="approve-btn-ghost">
              <IconImage size={13} /> メディアから挿入
            </button>
            <button
              type="button"
              onClick={() => handleSubmit("ai")}
              className="approve-btn-primary flex items-center gap-1.5 rounded-[8px] px-3.5 py-[8px] text-[12.5px] font-semibold"
              style={{ background: "var(--p-accent)", color: "#0a0c10" }}
            >
              <IconSparkles size={13} /> AIで生成
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
