/**
 * 承認画面共通の小さなUI部品。proto(#proto) からの本番移植。
 */
"use client";

import type { ReactNode } from "react";

import { STAGE_META, toneVar, toneWeakVar } from "./boardStage";
import type { BoardStage } from "./boardStage";
import { ringGeometry, ringTone, scoreBarTone, sparkColor, sparklineGeometry } from "./scales";

/** キーキャップ表示。 */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex min-w-[20px] items-center justify-center rounded-[5px] px-[5px] py-[1px] text-[11px] font-medium"
      style={{
        fontFamily: "var(--p-mono)",
        background: "var(--p-bg-active)",
        border: "1px solid var(--p-border-strong)",
        color: "var(--p-text-2)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </kbd>
  );
}

interface StageChipProps {
  stage: BoardStage;
  small?: boolean;
}

/** 段階チップ。 */
export function StageChip({ stage, small }: StageChipProps) {
  const meta = STAGE_META[stage];
  const tone = meta.tone;
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-full font-medium ${
        small ? "px-2 py-[2px] text-[11px]" : "px-2.5 py-[3px] text-[12px]"
      }`}
      style={{
        background: toneWeakVar(tone),
        color: toneVar(tone),
      }}
    >
      <span
        className={stage === "generating" ? "approve-pulse" : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: toneVar(tone),
          boxShadow: `0 0 8px ${toneVar(tone)}`,
        }}
      />
      {meta.label}
    </span>
  );
}

interface ScoreBarProps {
  score: number;
}

/** 優先度スコアの細バー。 */
export function ScoreBar({ score }: ScoreBarProps) {
  const tone = scoreBarTone(score);
  return (
    <div className="flex items-center gap-2" title={`優先度スコア ${score}`}>
      <div
        className="relative h-[5px] w-[44px] overflow-hidden rounded-full"
        style={{ background: "var(--p-bg-active)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${score}%`, background: tone }}
        />
      </div>
      <span
        className="tabular-nums text-[11px] font-medium"
        style={{ color: "var(--p-text-3)" }}
      >
        {score}
      </span>
    </div>
  );
}

/** 「あなた待ち」ドット。 */
export function AwaitingDot() {
  return (
    <span
      title="あなたのアクション待ち"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "var(--p-amber)",
        boxShadow: "0 0 0 3px var(--p-amber-weak)",
      }}
    />
  );
}

interface RingScoreProps {
  value: number;
  size?: number;
}

/** 円形スコア(アドバイス総評など)。 */
export function RingScore({ value, size = 56 }: RingScoreProps) {
  const tone = ringTone(value);
  const { r, circumference, dashOffset } = ringGeometry(value, size);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--p-bg-active)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular-nums"
        style={{ color: "var(--p-text)" }}
      >
        {value}
      </span>
    </div>
  );
}

interface SparklineProps {
  data: number[];
  up: boolean;
  width?: number;
  height?: number;
}

/** 小さな推移グラフ(スパークライン)。 */
export function Sparkline({ data, up, width = 124, height = 34 }: SparklineProps) {
  const geo = sparklineGeometry(data, width, height);
  if (geo === null) return <div style={{ width, height }} />;
  const color = sparkColor(up);
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={geo.area} fill={color} opacity={0.12} />
      <path d={geo.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={geo.last.x} cy={geo.last.y} r={2.6} fill={color} />
    </svg>
  );
}

interface MetaStatProps {
  icon: ReactNode;
  children: ReactNode;
  title?: string;
}

/** メタ情報の小片(アイコン＋値)。 */
export function MetaStat({ icon, children, title }: MetaStatProps) {
  return (
    <span
      className="inline-flex items-center gap-[5px] text-[12px] tabular-nums"
      style={{ color: "var(--p-text-2)" }}
      title={title}
    >
      <span style={{ color: "var(--p-text-3)" }}>{icon}</span>
      {children}
    </span>
  );
}
