/**
 * 公開前チェックリスト(#proto・品質ゲート3段階)の表示。
 * フッターのサマリー行(block/warn/ok 件数)をクリックで詳細パネルに展開する。
 *
 * 入力は本番 draftQuality.ts の QualityCheck({ label; value; level; hint? })。
 * proto の {id;level;label;detail?} からのフィールド差異: 展開行 key は c.label
 * (label は draftQuality 内で一意)・詳細は c.hint。件数集計は countByLevel を再利用。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";

import { countByLevel } from "./draftQuality";
import { IconCheck, IconChevronDown, IconX } from "./ui/icons";

import type { CheckLevel, QualityCheck } from "./draftQuality";

const TONE: Record<CheckLevel, { color: string; bg: string; label: string }> = {
  block: { color: "var(--p-red)", bg: "var(--p-red-weak)", label: "公開不可" },
  warn: { color: "var(--p-amber)", bg: "var(--p-amber-weak)", label: "要確認" },
  ok: { color: "var(--p-green)", bg: "var(--p-green-weak)", label: "OK" },
};

const ORDER: CheckLevel[] = ["block", "warn", "ok"];

interface QualityChecklistProps {
  checks: QualityCheck[];
  open: boolean;
  onToggle: () => void;
}

export function QualityChecklist({ checks, open, onToggle }: QualityChecklistProps) {
  const counts = countByLevel(checks);
  const sorted = [...checks].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));

  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center gap-2.5">
        <span className="text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>
          公開前チェック
        </span>
        <span className="flex items-center gap-1.5">
          {ORDER.map((lv) =>
            counts[lv] > 0 ? (
              <span
                key={lv}
                className="flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-medium"
                style={{ background: TONE[lv].bg, color: TONE[lv].color }}
              >
                {lv === "block" ? <IconX size={11} /> : lv === "ok" ? <IconCheck size={11} /> : null}
                {TONE[lv].label} {counts[lv]}
              </span>
            ) : null
          )}
        </span>
        <span
          className="ml-auto transition-transform"
          style={{ color: "var(--p-text-3)", transform: open ? "rotate(180deg)" : "none" }}
        >
          <IconChevronDown size={15} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}
          >
            <div className="mt-2.5 flex flex-col gap-1.5">
              {sorted.map((c) => (
                <div key={c.label} className="flex items-start gap-2.5">
                  <span
                    className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                    style={{ background: TONE[c.level].bg, color: TONE[c.level].color }}
                  >
                    {c.level === "block" ? <IconX size={12} /> : c.level === "ok" ? <IconCheck size={12} /> : "!"}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="text-[12.5px]"
                      style={{ color: c.level === "ok" ? "var(--p-text-3)" : "var(--p-text)" }}
                    >
                      {c.label}
                    </span>
                    {c.hint && (
                      <span className="ml-1.5 text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
                        — {c.hint}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
