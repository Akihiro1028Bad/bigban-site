/**
 * インライン本文エディタ(#proto・feature2): プレビューと地続きの編集体験。
 *
 * 見た目検証用。書式はブラウザの execCommand を使った最小実装で、
 * 保存時に innerHTML を親へ返す(本番は TipTap + サニタイズを想定)。
 */
"use client";

import { useCallback, useRef } from "react";

import {
  IconCheck,
  IconImage,
  IconLayout,
  IconList,
  IconWand,
  IconX,
} from "./icons";

interface InlineEditorProps {
  html: string;
  onSave: (html: string) => void;
  onCancel: () => void;
  onLiveChange?: (html: string) => void;
}

interface ToolDef {
  label: string;
  icon?: React.ReactNode;
  text?: string;
  command: string;
  value?: string;
}

// ツールバーは静的データ。実行は委譲ハンドラ側で行い、render から ref を触らない。
const TOOLS: ToolDef[] = [
  { label: "太字", text: "B", command: "bold" },
  { label: "見出し", icon: <IconLayout size={14} />, command: "formatBlock", value: "h2" },
  { label: "本文", text: "P", command: "formatBlock", value: "p" },
  { label: "箇条書き", icon: <IconList size={14} />, command: "insertUnorderedList" },
  { label: "引用", icon: <IconWand size={14} />, command: "formatBlock", value: "blockquote" },
  { label: "画像", icon: <IconImage size={14} />, command: "noop" },
];

export function InlineEditor({ html, onSave, onCancel, onLiveChange }: InlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // ツールバーのクリックを1か所で受け、押されたボタンの data 属性から書式を実行する。
  const handleToolbarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-command]");
      if (!btn) return;
      const command = btn.dataset.command;
      if (!command || command === "noop") return;
      editorRef.current?.focus();
      document.execCommand(command, false, btn.dataset.value || undefined);
      onLiveChange?.(editorRef.current?.innerHTML ?? "");
    },
    [onLiveChange]
  );

  const handleSave = useCallback(() => {
    onSave(editorRef.current?.innerHTML ?? html);
  }, [onSave, html]);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-[10px] p-1.5"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
        }}
        onClick={handleToolbarClick}
      >
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            data-command={t.command}
            data-value={t.value}
            className="proto-tool"
            title={t.label}
            aria-label={t.label}
          >
            {t.icon ?? <span style={{ fontWeight: 700 }}>{t.text}</span>}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          <button onClick={onCancel} className="proto-btn-ghost">
            <IconX size={14} /> 取消
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-[8px] px-3 py-[7px] text-[12.5px] font-semibold"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconCheck size={14} /> 保存
          </button>
        </span>
      </div>

      {/* mockData.ts 由来の静的HTMLのみ。本番は microCMS 由来をサニタイズしてから渡す。 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onLiveChange?.(editorRef.current?.innerHTML ?? "")}
        className="proto-article proto-editable p-4"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)", minHeight: 280 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
        ※ 見た目検証用の簡易エディタです。本番は TipTap + サニタイズで下書きを上書きします。
      </p>
    </div>
  );
}
