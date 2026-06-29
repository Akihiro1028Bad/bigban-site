/**
 * メディアライブラリ(#proto・画像): 既存素材から選ぶ / アップロードして差し替える。
 */
"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

import { IconCheck, IconUpload } from "./icons";
import { MEDIA_KIND_LABEL, MOCK_MEDIA } from "./mediaLibrary";
import type { MediaItem } from "./mediaLibrary";
import { Kbd } from "./ui";

interface MediaLibraryModalProps {
  heading: string;
  onClose: () => void;
  onSelect: (hue: number, label: string) => void;
}

const FILTERS: { key: MediaItem["kind"] | "all"; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "mascot", label: "マスコット" },
  { key: "minimal", label: "ミニマル" },
  { key: "diagram", label: "図解" },
  { key: "photo", label: "イメージ" },
];

export function MediaLibraryModal({ heading, onClose, onSelect }: MediaLibraryModalProps) {
  const [filter, setFilter] = useState<MediaItem["kind"] | "all">("all");
  const uploadSeq = useRef(0);
  const items = filter === "all" ? MOCK_MEDIA : MOCK_MEDIA.filter((m) => m.kind === filter);

  const upload = () => {
    const hue = (190 + uploadSeq.current * 47) % 360;
    uploadSeq.current += 1;
    onSelect(hue, "アップロード画像");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[600px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <span className="text-[14px] font-semibold">{heading}</span>
          <button onClick={onClose} className="ml-auto"><Kbd>esc</Kbd></button>
        </div>

        <div className="flex items-center gap-1 px-4 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="rounded-[7px] px-2.5 py-[5px] text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--p-bg-active)" : "transparent",
                  color: active ? "var(--p-text)" : "var(--p-text-3)",
                }}
              >
                {f.label}
              </button>
            );
          })}
          <button onClick={upload} className="proto-btn-ghost ml-auto">
            <IconUpload size={14} /> アップロード
          </button>
        </div>

        <div className="grid max-h-[420px] grid-cols-3 gap-2.5 overflow-y-auto p-4">
          {items.map((m) => (
            <button
              key={m.id}
              onClick={() => onSelect(m.hue, m.label)}
              className="group flex flex-col gap-1.5 rounded-[10px] p-2 text-left transition-colors"
              style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
            >
              <div className="relative w-full">
                <div
                  className="h-[88px] w-full overflow-hidden rounded-[7px]"
                  style={{
                    background: `linear-gradient(135deg, hsl(${m.hue} 60% 32%), hsl(${
                      (m.hue + 45) % 360
                    } 55% 20%))`,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      background: `radial-gradient(circle at 70% 25%, hsl(${
                        (m.hue + 20) % 360
                      } 70% 55% / 0.5), transparent 60%)`,
                    }}
                  />
                </div>
                <span
                  className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                >
                  <IconCheck size={14} />
                </span>
              </div>
              <span className="truncate text-[11.5px]" style={{ color: "var(--p-text-2)" }}>
                {m.label}
              </span>
              <span className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>
                {MEDIA_KIND_LABEL[m.kind]}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
