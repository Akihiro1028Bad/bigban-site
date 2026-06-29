/**
 * 修正依頼モーダル(#proto・修正ループ): タイトル/本文に指示を書いて送る。
 * 指示が来た対象だけが後で「提示中」になる。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { IconWand } from "./icons";
import { Kbd } from "./ui";
import { useDialog } from "./useDialog";

interface ReviseRequestModalProps {
  title: string;
  onClose: () => void;
  onSubmit: (instruction: { title?: string; body?: string }) => void;
}

export function ReviseRequestModal({ title, onClose, onSubmit }: ReviseRequestModalProps) {
  const [titleOn, setTitleOn] = useState(false);
  const [bodyOn, setBodyOn] = useState(true);
  const [titleText, setTitleText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const dialogRef = useDialog();

  const canSend = (titleOn && titleText.trim()) || (bodyOn && bodyText.trim());

  const submit = () => {
    if (!canSend) return;
    onSubmit({
      title: titleOn && titleText.trim() ? titleText.trim() : undefined,
      body: bodyOn && bodyText.trim() ? bodyText.trim() : undefined,
    });
  };

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
        aria-label={`「${title}」の修正を依頼`}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[540px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconWand size={16} {...{ style: { color: "var(--p-accent)" } }} />
          <span className="text-[14px] font-semibold">修正を依頼</span>
          <button onClick={onClose} className="ml-auto"><Kbd>esc</Kbd></button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="truncate text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
            対象記事：{title}
          </div>

          <RevisePart
            label="タイトル"
            on={titleOn}
            onToggle={() => setTitleOn((v) => !v)}
            value={titleText}
            onChange={setTitleText}
            placeholder="例）もう少し短く、すっきりさせたい"
          />
          <RevisePart
            label="本文"
            on={bodyOn}
            onToggle={() => setBodyOn((v) => !v)}
            value={bodyText}
            onChange={setBodyText}
            placeholder="例）結びに体験予約への内部リンク導線を一つ足してほしい"
          />

          <p className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
            指示を出した対象だけが、PCの修正ループで案になって戻ってきます。
          </p>
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderTop: "1px solid var(--p-border)" }}>
          <button onClick={onClose} className="proto-btn-ghost">取消</button>
          <button
            onClick={submit}
            disabled={!canSend}
            className="ml-auto flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconWand size={14} /> 修正を依頼
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RevisePart({
  label,
  on,
  onToggle,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      className="rounded-[10px] p-3"
      style={{
        background: on ? "var(--p-bg-raised)" : "var(--p-bg-input)",
        border: on ? "1px solid var(--p-border-strong)" : "1px solid var(--p-border)",
      }}
    >
      <label className="flex cursor-pointer items-center gap-2">
        <span
          onClick={onToggle}
          className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px]"
          style={{
            background: on ? "var(--p-accent)" : "transparent",
            border: on ? "1px solid var(--p-accent)" : "1px solid var(--p-border-strong)",
            color: "#0a0c10",
            fontSize: 12,
          }}
        >
          {on ? "✓" : ""}
        </span>
        <span className="text-[13px] font-medium">{label}を直す</span>
      </label>
      {on && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          autoFocus={label === "本文"}
          className="mt-2.5 w-full resize-none rounded-[8px] p-2.5 text-[13px] outline-none"
          style={{
            background: "var(--p-bg-input)",
            border: "1px solid var(--p-border)",
            color: "var(--p-text)",
          }}
        />
      )}
    </div>
  );
}
