/**
 * コマンドパレット(#proto): ⌘K で開く。記事ジャンプと操作を1か所から。
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { IconArrowRight, IconSearch } from "./icons";
import type { Article } from "./types";
import { EyecatchThumb, Kbd, StageChip } from "./ui";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  articles: Article[];
  onClose: () => void;
  onJump: (id: string) => void;
}

/** open のときだけ親がマウントする(状態リセットはマウントで自然に行う)。 */
export function CommandPalette({
  commands,
  articles,
  onClose,
  onJump,
}: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // マウント時に入力へフォーカス(外部DOMの同期なので effect が適切)。
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, []);

  const rows = useMemo(() => {
    const lower = q.toLowerCase();
    const cmd = commands
      .filter((c) => c.label.toLowerCase().includes(lower))
      .map((c) => ({ type: "cmd" as const, cmd: c }));
    const art = articles
      .filter(
        (a) =>
          a.title.toLowerCase().includes(lower) ||
          a.keyword.toLowerCase().includes(lower)
      )
      .slice(0, 6)
      .map((a) => ({ type: "art" as const, art: a }));
    return [...cmd, ...art];
  }, [q, commands, articles]);

  // 件数変動に追従(描画時にクランプ。state は保持し effect で書かない)。
  const safeCursor = rows.length === 0 ? 0 : Math.min(cursor, rows.length - 1);

  const activate = (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.type === "cmd") row.cmd.run();
    else onJump(row.art.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor(Math.min(rows.length - 1, safeCursor + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor(Math.max(0, safeCursor - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            activate(safeCursor);
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="flex items-center gap-2.5 px-4" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconSearch size={17} {...{ style: { color: "var(--p-text-3)" } }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="コマンドを実行、または記事へジャンプ…"
            className="h-[48px] flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: "var(--p-text)" }}
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--p-text-3)" }}>
              一致する項目がありません
            </div>
          )}
          {rows.map((row, i) => {
            const focused = i === safeCursor;
            return (
              <button
                key={row.type === "cmd" ? row.cmd.id : row.art.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => activate(i)}
                className="proto-row flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left"
                style={{ background: focused ? "var(--p-bg-hover)" : "transparent" }}
              >
                {row.type === "cmd" ? (
                  <>
                    <span
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px]"
                      style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
                    >
                      {row.cmd.icon ?? <IconArrowRight size={14} />}
                    </span>
                    <span className="flex-1 text-[13px]">{row.cmd.label}</span>
                    {row.cmd.hint && <Kbd>{row.cmd.hint}</Kbd>}
                  </>
                ) : (
                  <>
                    <EyecatchThumb hue={row.art.hue} has={row.art.hasEyecatch} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{row.art.title}</span>
                    </span>
                    <span className="shrink-0">
                      <StageChip stage={row.art.stage} small />
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div
          className="flex items-center gap-3 px-4 py-2 text-[11px]"
          style={{ borderTop: "1px solid var(--p-border)", color: "var(--p-text-3)" }}
        >
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> 移動</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> 実行</span>
          <span className="ml-auto tabular-nums">{articles.length} 記事</span>
        </div>
      </motion.div>
    </div>
  );
}
