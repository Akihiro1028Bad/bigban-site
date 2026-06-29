/**
 * プロトタイプ共通の小さなUI部品(#proto)。
 */
"use client";

import type { ReactNode } from "react";

import { STAGE_META, toneVar, toneWeakVar } from "./stages";
import type { Stage } from "./types";

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

/** 段階チップ。 */
export function StageChip({ stage, small }: { stage: Stage; small?: boolean }) {
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
        className={stage === "generating" ? "proto-pulse" : undefined}
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

/** 優先度スコアの細バー。 */
export function ScoreBar({ score }: { score: number }) {
  const tone =
    score >= 85 ? "var(--p-green)" : score >= 70 ? "var(--p-accent)" : "var(--p-text-3)";
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

/** アイキャッチサムネ。url があれば実画像、無ければ色相からのグラデーション。 */
export function EyecatchThumb({
  hue,
  size = 40,
  has = true,
  url,
}: {
  hue: number;
  size?: number;
  has?: boolean;
  url?: string;
}) {
  if (has && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data-URI のモック画像。本番は next/image。
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[8px] object-cover"
        style={{ width: size, height: size, border: "1px solid var(--p-border)" }}
      />
    );
  }
  if (!has) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-[8px]"
        style={{
          width: size,
          height: size,
          background: "var(--p-bg-active)",
          border: "1px dashed var(--p-border-strong)",
          color: "var(--p-text-3)",
          fontSize: 10,
        }}
      >
        無
      </div>
    );
  }
  return (
    <div
      className="shrink-0 overflow-hidden rounded-[8px]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 62% 32%), hsl(${
          (hue + 40) % 360
        } 58% 22%))`,
        border: "1px solid var(--p-border)",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 70% 25%, hsl(${
            (hue + 20) % 360
          } 70% 55% / 0.55), transparent 60%)`,
        }}
      />
    </div>
  );
}

/** 円形スコア(アドバイス総評など)。 */
export function RingScore({ value, size = 56 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const tone =
    value >= 85 ? "var(--p-green)" : value >= 70 ? "var(--p-accent)" : "var(--p-amber)";
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
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
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

/** 小さな推移グラフ(スパークライン)。 */
export function Sparkline({
  data,
  up,
  width = 124,
  height = 34,
}: {
  data: number[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pad = 3;
  const stepX = (width - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [
    pad + i * stepX,
    pad + (height - pad * 2) * (1 - (v - min) / span),
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${line} L${last[0].toFixed(1)} ${height - pad} L${pts[0][0].toFixed(1)} ${height - pad} Z`;
  const color = up ? "var(--p-green)" : "var(--p-red)";
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  );
}

/** メタ情報の小片(アイコン＋値)。 */
export function MetaStat({
  icon,
  children,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  title?: string;
}) {
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
