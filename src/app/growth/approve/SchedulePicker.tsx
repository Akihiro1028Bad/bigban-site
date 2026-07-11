/**
 * 公開予約ピッカー(#proto P5b・公開キュー): プリセット or 日時指定で予約時刻を決める。
 * 実機はプル型(Notion に時刻を書く→PCが到来分を公開)だが、ここでは時刻を選ぶ体験のみ。
 * 見た目は proto(#proto SchedulePicker)ダーク。T5(PublishQueue 再スキン)が結線する。
 *
 * 日時計算はコンポーネント内に一切書かない。プリセット/表示は Task3 の純ロジック
 * (`schedulePresets`/`formatSchedule` @ src/lib/growth/publishQueueView.ts)へ委譲し、
 * `datetime-local` の入力文字列→atMs 変換だけを薄く結線する。
 */
"use client";

import { useMemo, useId, useState } from "react";
import { motion } from "framer-motion";

import { formatSchedule, schedulePresets } from "@/lib/growth/publishQueueView";

import { IconCalendar, IconClock } from "./ui/icons";
import { Kbd } from "./ui/primitives";
import { handleOverlayKeyDown } from "./hooks/overlayKeyDown";
import { useDialog } from "./hooks/useDialog";

interface SchedulePickerProps {
  count: number;
  onClose: () => void;
  onConfirm: (label: string, atMs: number) => void;
}

function dateTimeLocalValue(atMs: number): string {
  const date = new Date(atMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function hasScheduleExpired(atMs: number): boolean {
  return atMs <= Date.now();
}

export function SchedulePicker({ count, onClose, onConfirm }: SchedulePickerProps) {
  // Task3 純関数でプリセットを算出(日時計算はコンポーネントに書かない)。
  // Date.now() は useState の lazy initializer で「マウント時に一度だけ」評価し固定する
  // (レンダ本体で impure 関数を呼ばない=react-hooks/purity 準拠。開いている間は揺れない)。
  const [nowMs] = useState(() => Date.now());
  const presets = useMemo(() => schedulePresets(nowMs), [nowMs]);

  const [custom, setCustom] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const customAtMs = custom ? new Date(custom).getTime() : Number.NaN;
  const canConfirmCustom = Number.isFinite(customAtMs) && customAtMs > nowMs;
  const dialogRef = useDialog();
  const customInputId = useId();

  const handleConfirmPreset = (atMs: number) => {
    if (hasScheduleExpired(atMs)) {
      setScheduleError("選択した日時は過ぎています。別の日時を選んでください。");
      return;
    }
    onConfirm(formatSchedule(new Date(atMs)), atMs);
  };
  const handleConfirmCustom = () => {
    if (!canConfirmCustom) return;
    if (hasScheduleExpired(customAtMs)) {
      setScheduleError("選択した日時は過ぎています。別の日時を選んでください。");
      return;
    }
    onConfirm(formatSchedule(new Date(customAtMs)), customAtMs);
  };

  return (
    // approve-shell: fixed overlay は .approve-shell 配下の外に出るため、root 自身に付けて
    // var(--p-*) トークンと .approve-btn-* を解決する(ConfirmActionDialog d144a8c 方式)。
    // z-[80]: 詳細パネル(z-50)・編集ワークスペース(z-60)・コマンドパレット(z-70)より上、
    // 確認ダイアログと同じ帯。トースト(z-90)より下。公開キューから開くため前面でないと隠れる。
    <div
      className="approve-shell fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[16vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="公開日時を予約"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOverlayKeyDown(e, onClose)}
        className="w-full max-w-[440px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div
          className="flex items-center gap-2 px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--p-border)" }}
        >
          <IconCalendar size={16} style={{ color: "var(--p-teal)" }} />
          <span className="text-[14px] font-semibold" style={{ color: "var(--p-text)" }}>
            公開予約
          </span>
          <span className="text-[12px]" style={{ color: "var(--p-text-3)" }}>
            {count}件
          </span>
          <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto">
            <Kbd>esc</Kbd>
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--p-text-3)" }}
          >
            よく使う時間
          </div>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => (
              <button
                key={`${p.label}-${p.atMs}`}
                type="button"
                onClick={() => handleConfirmPreset(p.atMs)}
                className="flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-[13px] transition-colors"
                style={{
                  background: "var(--p-bg-raised)",
                  border: "1px solid var(--p-border)",
                  color: "var(--p-text)",
                }}
              >
                <IconClock size={14} style={{ color: "var(--p-teal)" }} />
                {p.label}
              </button>
            ))}
          </div>

          <label
            htmlFor={customInputId}
            className="mt-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--p-text-3)" }}
          >
            日時を指定
          </label>
          <div className="flex items-center gap-2">
            <input
              id={customInputId}
              type="datetime-local"
              min={dateTimeLocalValue(nowMs)}
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setScheduleError(null);
              }}
              className="h-[36px] flex-1 rounded-[9px] px-2.5 text-[13px] outline-none"
              style={{
                background: "var(--p-bg-input)",
                border: "1px solid var(--p-border)",
                color: "var(--p-text)",
                colorScheme: "dark",
              }}
            />
            <button
              type="button"
              onClick={handleConfirmCustom}
              disabled={!canConfirmCustom}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--p-teal)", color: "#06140d" }}
            >
              予約
            </button>
          </div>
          {scheduleError ? (
            <p role="alert" className="text-[12px]" style={{ color: "var(--p-danger)" }}>
              {scheduleError}
            </p>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
