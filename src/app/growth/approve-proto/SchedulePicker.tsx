/**
 * 公開予約ピッカー(#proto・公開キュー): プリセット or 日時指定で予約時刻を決める。
 * 実機はプル型(Notion に時刻を書く→PCが到来分を公開)だが、ここでは時刻を選ぶ体験のみ。
 */
"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import { IconCalendar, IconClock } from "./icons";
import { Kbd } from "./ui";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function formatSchedule(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${hh}:${mm}`;
}

function atTime(base: Date, addDays: number, hour: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextMonday(base: Date): Date {
  const d = new Date(base);
  const delta = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

interface Preset {
  key: string;
  label: string;
  date: Date;
}

interface SchedulePickerProps {
  count: number;
  onClose: () => void;
  onConfirm: (label: string, atMs: number) => void;
}

export function SchedulePicker({ count, onClose, onConfirm }: SchedulePickerProps) {
  const presets = useMemo<Preset[]>(() => {
    const now = new Date();
    return [
      { key: "tonight", label: "今夜 21:00", date: atTime(now, 0, 21) },
      { key: "tomorrow9", label: "明日 09:00", date: atTime(now, 1, 9) },
      { key: "tomorrow12", label: "明日 12:00", date: atTime(now, 1, 12) },
      { key: "monday", label: "来週月曜 09:00", date: nextMonday(now) },
    ];
  }, []);

  const [custom, setCustom] = useState("");

  const confirmPreset = (p: Preset) => onConfirm(formatSchedule(p.date), p.date.getTime());
  const confirmCustom = () => {
    if (!custom) return;
    const d = new Date(custom);
    if (Number.isNaN(d.getTime())) return;
    onConfirm(formatSchedule(d), d.getTime());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[16vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconCalendar size={16} {...{ style: { color: "var(--p-teal)" } }} />
          <span className="text-[14px] font-semibold">公開予約</span>
          <span className="text-[12px]" style={{ color: "var(--p-text-3)" }}>
            {count}件
          </span>
          <button onClick={onClose} className="ml-auto"><Kbd>esc</Kbd></button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            よく使う時間
          </div>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => confirmPreset(p)}
                className="flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-[13px] transition-colors"
                style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
              >
                <IconClock size={14} {...{ style: { color: "var(--p-teal)" } }} />
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            日時を指定
          </div>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-[36px] flex-1 rounded-[9px] px-2.5 text-[13px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)", colorScheme: "dark" }}
            />
            <button
              onClick={confirmCustom}
              disabled={!custom}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--p-teal)", color: "#06140d" }}
            >
              予約
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
