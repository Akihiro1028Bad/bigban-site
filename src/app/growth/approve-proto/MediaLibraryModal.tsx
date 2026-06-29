/**
 * メディアライブラリ(#proto・画像): 実サムネ(SVG)から選ぶ / 実ファイルをアップロードして差し替える。
 * アップロードは 5MB・MIMEホワイトリスト検証＋エラー表示つき(クライアント完結のモック)。
 */
"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

import { IconCheck, IconUpload } from "./icons";
import { MEDIA_KIND_LABEL, MOCK_MEDIA } from "./mediaLibrary";
import type { MediaKind } from "./mediaLibrary";
import { useDialog } from "./useDialog";
import { Kbd } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;
// 本番同様 SVG は禁止(XSS対策)。アップロードはラスタ画像のみ許可。
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface MediaLibraryModalProps {
  heading: string;
  onClose: () => void;
  onSelect: (url: string, label: string) => void;
}

const FILTERS: { key: MediaKind | "all"; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "mascot", label: "マスコット" },
  { key: "minimal", label: "ミニマル" },
  { key: "diagram", label: "図解" },
  { key: "photo", label: "イメージ" },
];

export function MediaLibraryModal({ heading, onClose, onSelect }: MediaLibraryModalProps) {
  const [filter, setFilter] = useState<MediaKind | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialog();
  const items = filter === "all" ? MOCK_MEDIA : MOCK_MEDIA.filter((m) => m.kind === filter);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError("対応していない形式です（PNG / JPEG / WebP / GIF。SVGは不可）");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`サイズが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB / 上限 5MB）`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onSelect(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[600px] overflow-hidden rounded-[14px]"
        style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border-strong)", boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}
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
                className="rounded-[7px] px-2.5 py-[5px] text-[12px] font-medium"
                style={{ background: active ? "var(--p-bg-active)" : "transparent", color: active ? "var(--p-text)" : "var(--p-text-3)" }}
              >
                {f.label}
              </button>
            );
          })}
          <input ref={fileRef} type="file" accept={ALLOWED.join(",")} onChange={onFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="proto-btn-ghost ml-auto">
            <IconUpload size={14} /> アップロード
          </button>
        </div>

        {error && (
          <div className="px-4 pt-2.5 text-[12px]" style={{ color: "var(--p-red)" }}>
            {error}
          </div>
        )}

        <div className="grid max-h-[420px] grid-cols-2 gap-2.5 overflow-y-auto p-4 sm:grid-cols-3">
          {items.map((m) => (
            <button
              key={m.id}
              onClick={() => onSelect(m.url, m.label)}
              className="group flex flex-col gap-1.5 rounded-[10px] p-2 text-left"
              style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
            >
              <div className="relative w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- data-URI のモック画像 */}
                <img src={m.url} alt={m.label} className="h-[88px] w-full rounded-[7px] object-cover" style={{ border: "1px solid var(--p-border)" }} />
                <span
                  className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                >
                  <IconCheck size={14} />
                </span>
              </div>
              <span className="truncate text-[11.5px]" style={{ color: "var(--p-text-2)" }}>{m.label}</span>
              <span className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>{MEDIA_KIND_LABEL[m.kind]}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
