/**
 * 画像の状態トグル(#proto P3b・本番移植・画像指示再設計): オフ / おまかせ / 指定 の3択 radiogroup。
 * house style がロック済みなので、レビュアーがまず触るのはこの1操作だけ。
 * AIが画像不要と推定したセクションには「オフ推奨」ドットを控えめに重ねる(確定ではなく提案)。
 */
"use client";

import type { ImageMode } from "./imageIntentTypes";

const OPTIONS: { mode: ImageMode; label: string }[] = [
  { mode: "off", label: "オフ" },
  { mode: "auto", label: "おまかせ" },
  { mode: "custom", label: "指定" },
];

interface ImageStateToggleProps {
  mode: ImageMode;
  recommendOff?: boolean;
  onChange: (mode: ImageMode) => void;
}

export function ImageStateToggle({ mode, recommendOff, onChange }: ImageStateToggleProps) {
  const move = (dir: number) => {
    const idx = OPTIONS.findIndex((o) => o.mode === mode);
    const next = OPTIONS[(idx + dir + OPTIONS.length) % OPTIONS.length];
    onChange(next.mode);
  };

  return (
    <div
      role="radiogroup"
      aria-label="画像をどうするか"
      tabIndex={-1}
      className="inline-flex items-center gap-[2px] rounded-[8px] p-[2px]"
      style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {OPTIONS.map((o) => {
        const active = o.mode === mode;
        const showRec = o.mode === "off" && recommendOff && mode !== "off";
        return (
          <button
            key={o.mode}
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.mode)}
            title={showRec ? "AIはこのセクションを画像オフ推奨" : undefined}
            className="relative rounded-[6px] px-2.5 py-[4px] text-[11.5px] font-medium transition-colors"
            style={{
              background: active ? "var(--p-bg-raised)" : "transparent",
              color: active ? "var(--p-text)" : "var(--p-text-3)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.3)" : "none",
            }}
          >
            {o.label}
            {showRec && (
              <span
                className="absolute -right-[2px] -top-[2px] h-[7px] w-[7px] rounded-full"
                style={{ background: "var(--p-amber)", border: "1.5px solid var(--p-bg-elevated)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
