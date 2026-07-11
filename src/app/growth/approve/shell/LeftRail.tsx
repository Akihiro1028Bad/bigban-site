/**
 * 左レール: 情報源タワー型。5面をループ順(施策→記事→プロンプト→成績→公開キュー)で切替。
 * proto(#proto) からの本番移植。
 */
"use client";

import type { ReactNode } from "react";

import { IconBolt, IconCalendar, IconChart, IconInbox, IconLayout, IconList, IconRefresh } from "@/app/growth/approve/ui/icons";
import type { ApproveView } from "@/app/growth/approve/viewRouting";

interface RailItem {
  key: ApproveView;
  label: string;
  icon: ReactNode;
  badge?: number;
}

interface RailGroup {
  label: string;
  items: RailItem[];
}

interface LeftRailProps {
  view: ApproveView;
  /** 記事(kind=idea)側のアクション待ち件数。施策を含む全体待ち(awaiting)とは別物。 */
  articleCount: number;
  proposalCount: number;
  queueReadyCount: number;
  opsIssueCount: number;
  onChange: (view: ApproveView) => void;
}

export function LeftRail({ view, articleCount, proposalCount, queueReadyCount, opsIssueCount, onChange }: LeftRailProps) {
  const groups: RailGroup[] = [
    { label: "OVERVIEW", items: [{ key: "home", label: "ホーム", icon: <IconLayout size={18} /> }] },
    { label: "WORKFLOW", items: [
      { key: "proposal", label: "施策", icon: <IconList size={18} />, badge: proposalCount },
      { key: "approve", label: "記事制作", icon: <IconInbox size={18} />, badge: articleCount },
      { key: "queue", label: "公開", icon: <IconCalendar size={18} />, badge: queueReadyCount },
    ] },
    { label: "INSIGHT", items: [{ key: "performance", label: "成績", icon: <IconChart size={18} /> }] },
    { label: "SYSTEM", items: [
      { key: "settings", label: "AI設定", icon: <IconBolt size={18} /> },
      { key: "ops", label: "運用状況", icon: <IconRefresh size={18} />, badge: opsIssueCount },
    ] },
  ];

  return (
    <nav
      aria-label="情報源"
      className="flex w-[60px] shrink-0 flex-col overflow-y-auto px-2 py-3 sm:w-[184px] sm:px-3"
      style={{ borderRight: "1px solid var(--p-border)", background: "var(--p-bg-elevated)" }}
    >
      {groups.map((group) => <div key={group.label} className="mb-3 flex flex-col gap-1">
        <div className="hidden px-2 pb-1 text-[9px] font-semibold tracking-[0.18em] sm:block" style={{ color: "var(--p-text-3)" }}>
          {group.label}
        </div>
        {group.items.map((it) => {
        const active = it.key === view;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            title={it.label}
            aria-label={it.label}
            aria-current={active ? "page" : undefined}
            className="relative flex items-center justify-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors sm:justify-start"
            style={{
              background: active ? "var(--p-bg-active)" : "transparent",
              color: active ? "var(--p-text)" : "var(--p-text-2)",
            }}
          >
            {active && (
              <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full" style={{ background: "var(--p-accent)" }} />
            )}
            <span style={{ color: active ? "var(--p-accent)" : "var(--p-text-3)" }}>{it.icon}</span>
            <span className="hidden whitespace-nowrap text-[13px] font-medium sm:inline">{it.label}</span>
            {it.badge ? (
              <span
                className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10.5px] font-semibold tabular-nums sm:static sm:ml-auto"
                style={{
                  background: it.key === "proposal" || it.key === "approve" ? "var(--p-amber)" : "var(--p-bg-raised)",
                  color: it.key === "proposal" || it.key === "approve" ? "#0a0c10" : "var(--p-text-2)",
                }}
              >
                {it.badge}
              </span>
            ) : null}
          </button>
        );
        })}
      </div>)}
    </nav>
  );
}
