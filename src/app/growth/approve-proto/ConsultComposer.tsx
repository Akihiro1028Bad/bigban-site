/**
 * 相談コンポーザ(#proto・往復統合): モード別の入力。送信は相談ドロワーが受ける。
 */
"use client";

import { useState } from "react";

import { IconWand } from "./icons";
import type { ConsultKind } from "./types";

interface ConsultComposerProps {
  mode: ConsultKind;
  sentenceCount: number;
  onSubmitOverall: (focus: string) => void;
  onSubmitRevise: (instruction: { title?: string; body?: string }) => void;
  onSubmitSentence: () => void;
}

export function ConsultComposer({ mode, sentenceCount, onSubmitOverall, onSubmitRevise, onSubmitSentence }: ConsultComposerProps) {
  if (mode === "overall") return <OverallComposer onSubmit={onSubmitOverall} />;
  if (mode === "revise") return <ReviseComposer onSubmit={onSubmitRevise} />;
  return <SentenceComposer count={sentenceCount} onSubmit={onSubmitSentence} />;
}

function SubmitButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="proto-btn-primary flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: "var(--p-accent)", color: "#0a0c10" }}
    >
      <IconWand size={15} /> 相談する
    </button>
  );
}

function OverallComposer({ onSubmit }: { onSubmit: (focus: string) => void }) {
  const [focus, setFocus] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
        文体・構成・具体性・内部リンク導線の観点で、下書き全体をAIに見てもらえます。
      </div>
      <textarea
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        placeholder="特に見てほしい点（任意・例：導入の説得力）"
        rows={2}
        className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
        style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
      />
      <SubmitButton onClick={() => onSubmit(focus.trim())} />
    </div>
  );
}

function ReviseComposer({ onSubmit }: { onSubmit: (i: { title?: string; body?: string }) => void }) {
  const [titleOn, setTitleOn] = useState(false);
  const [bodyOn, setBodyOn] = useState(true);
  const [titleText, setTitleText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const canSend = (titleOn && titleText.trim()) || (bodyOn && bodyText.trim());
  return (
    <div className="flex flex-col gap-3">
      <RevisePart label="タイトル" on={titleOn} onToggle={() => setTitleOn((v) => !v)} value={titleText} onChange={setTitleText} placeholder="例）もう少し短く、すっきりさせたい" />
      <RevisePart label="本文" on={bodyOn} onToggle={() => setBodyOn((v) => !v)} value={bodyText} onChange={setBodyText} placeholder="例）結びに体験予約への内部リンク導線を一つ足してほしい" />
      <p className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>指示を出した対象だけが、案になって戻ってきます。</p>
      <SubmitButton
        disabled={!canSend}
        onClick={() => onSubmit({ title: titleOn && titleText.trim() ? titleText.trim() : undefined, body: bodyOn && bodyText.trim() ? bodyText.trim() : undefined })}
      />
    </div>
  );
}

function SentenceComposer({ count, onSubmit }: { count: number; onSubmit: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
        左の本文の各文に <strong style={{ color: "var(--p-text)" }}>＋</strong> で指摘を足し、まとめてAIに相談できます。
      </div>
      <div className="rounded-[9px] px-3 py-2 text-[12.5px]" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)", color: "var(--p-text-2)" }}>
        {count > 0 ? `${count}件の指摘` : "まだ指摘がありません"}
      </div>
      <SubmitButton disabled={count === 0} onClick={onSubmit} />
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
