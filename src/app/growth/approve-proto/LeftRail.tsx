/**
 * 左レール(#proto): 主ビュー(承認 / 成績 / 公開キュー)を切替える。
 */
"use client";

import { IconCalendar, IconChart, IconInbox } from "./icons";
import type { MainView } from "./types";

interface RailItem {
  key: MainView;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface LeftRailProps {
  view: MainView;
  awaitingCount: number;
  onChange: (view: MainView) => void;
}

export function LeftRail({ view, awaitingCount, onChange }: LeftRailProps) {
  const items: RailItem[] = [
    { key: "approve", label: "承認", icon: <IconInbox size={20} />, badge: awaitingCount },
    { key: "performance", label: "成績", icon: <IconChart size={20} /> },
    { key: "queue", label: "公開キュー", icon: <IconCalendar size={20} /> },
  ];

  return (
    <nav
      className="flex w-[64px] shrink-0 flex-col items-center gap-1.5 py-3"
      style={{ borderRight: "1px solid var(--p-border)", background: "var(--p-bg-elevated)" }}
    >
      {items.map((it) => {
        const active = it.key === view;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className="relative flex w-[52px] flex-col items-center gap-1 rounded-[10px] py-2 transition-colors"
            style={{
              background: active ? "var(--p-bg-active)" : "transparent",
              color: active ? "var(--p-text)" : "var(--p-text-3)",
            }}
            title={it.label}
          >
            <span className="relative">
              {it.icon}
              {it.badge ? (
                <span
                  className="absolute -right-2 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-[10px] font-semibold tabular-nums"
                  style={{ background: "var(--p-amber)", color: "#0a0c10" }}
                >
                  {it.badge}
                </span>
              ) : null}
            </span>
            <span className="text-[10.5px] font-medium">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
