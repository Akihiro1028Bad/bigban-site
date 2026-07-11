/**
 * 画像スロット(#proto・画像指示再設計): 行内のコンパクトな状態表示。
 * off=「画像なし」/ auto=「おまかせ」チップ / custom=ミニ house-style サムネ＋行為チップ(クリックで再編集)。
 */
"use client";

import { IconImage } from "./icons";
import { mediaSvgUrl } from "./mediaLibrary";
import type { ImageMode } from "./types";

interface ImageSlotProps {
  mode: ImageMode;
  action: string;
  hue: number;
  isEyecatch?: boolean;
  onEdit: () => void;
}

export function ImageSlot({ mode, action, hue, isEyecatch, onEdit }: ImageSlotProps) {
  if (mode === "off") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--p-text-3)" }}>
        <IconImage size={12} /> このセクションは画像なし
      </span>
    );
  }

  if (mode === "auto") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px]"
        style={{ background: "var(--p-purple-weak)", color: "var(--p-purple)" }}
      >
        <IconImage size={12} /> おまかせ（見出しから自動生成）
      </span>
    );
  }

  // custom: ミニサムネ＋行為(クリックで ImageDirector を再展開)
  return (
    <button onClick={onEdit} className="inline-flex items-center gap-2 text-left" title="画像指示を編集">
      <span
        className="relative block h-[30px] w-[40px] shrink-0 overflow-hidden rounded-[5px]"
        style={{ border: "1px solid var(--p-border-strong)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URI のモック画像。本番は next/image。 */}
        <img src={mediaSvgUrl("mascot", hue)} alt="" aria-hidden className="h-full w-full object-cover" />
        <span className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 70% 20%, rgba(48,110,195,0.4), transparent 60%)" }} />
      </span>
      <span className="inline-flex items-center gap-1">
        {isEyecatch && (
          <span className="rounded-[4px] px-1.5 py-[1px] text-[10px] font-semibold" style={{ background: "var(--p-accent)", color: "#0a0c10" }}>
            アイキャッチ
          </span>
        )}
        <span className="text-[11.5px]" style={{ color: "var(--p-purple)" }}>
          宇宙人: {action || "（動きおまかせ）"}
        </span>
      </span>
    </button>
  );
}
