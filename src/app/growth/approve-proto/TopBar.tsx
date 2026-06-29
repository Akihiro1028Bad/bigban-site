/**
 * 上部バー(#proto): ブランド / 段階セグメント / 検索 / 統計ピル / ⌘K。
 */
"use client";

import { IconCommand, IconInbox, IconPlus, IconRefresh, IconSearch } from "./icons";
import { Kbd } from "./ui";
import type { SegmentKey } from "./types";

interface Segment {
  key: SegmentKey;
  label: string;
  count: number;
}

interface TopBarProps {
  segment: SegmentKey;
  segments: Segment[];
  query: string;
  awaitingCount: number;
  publishedThisWeek: number;
  onSegmentChange: (key: SegmentKey) => void;
  onQueryChange: (q: string) => void;
  onOpenPalette: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  syncLabel: string | null;
  syncStale: boolean;
  syncing: boolean;
  onRefresh: () => void;
  onOpenProposal: () => void;
}

export function TopBar({
  segment,
  segments,
  query,
  awaitingCount,
  publishedThisWeek,
  onSegmentChange,
  onQueryChange,
  onOpenPalette,
  searchRef,
  syncLabel,
  syncStale,
  syncing,
  onRefresh,
  onOpenProposal,
}: TopBarProps) {
  return (
    <header
      className="flex h-[52px] shrink-0 items-center gap-2 px-3 sm:gap-4 sm:px-4"
      style={{ borderBottom: "1px solid var(--p-border)", background: "var(--p-bg-elevated)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[13px]"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconInbox size={16} />
        </span>
        <span className="hidden text-[14px] font-semibold tracking-tight sm:inline">Growth Console</span>
        <span
          className="hidden rounded-full px-2 py-[1px] text-[10px] font-medium sm:inline"
          style={{ background: "var(--p-bg-active)", color: "var(--p-text-3)" }}
        >
          承認
        </span>
      </div>

      <div
        className="hidden items-center gap-[2px] rounded-[9px] p-[3px] md:flex"
        style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
        role="tablist"
        aria-label="段階フィルタ"
      >
        {segments.map((s) => {
          const active = s.key === segment;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              onClick={() => onSegmentChange(s.key)}
              className="flex items-center gap-1.5 rounded-[7px] px-2.5 py-[5px] text-[12.5px] font-medium transition-colors"
              style={{
                background: active ? "var(--p-bg-raised)" : "transparent",
                color: active ? "var(--p-text)" : "var(--p-text-2)",
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.3)" : "none",
              }}
            >
              {s.label}
              <span
                className="tabular-nums text-[11px]"
                style={{ color: active ? "var(--p-accent)" : "var(--p-text-3)" }}
              >
                {s.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative ml-auto min-w-0 flex-1 sm:w-[260px] sm:flex-none">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--p-text-3)" }}
        >
          <IconSearch size={15} />
        </span>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="記事を検索…"
          className="h-[34px] w-full rounded-[9px] pl-8 pr-12 text-[13px] outline-none"
          style={{
            background: "var(--p-bg-input)",
            border: "1px solid var(--p-border)",
            color: "var(--p-text)",
          }}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          <Kbd>/</Kbd>
        </span>
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        <span
          className="flex items-center gap-1.5 text-[12px]"
          style={{ color: "var(--p-text-2)" }}
          title="あなたのアクション待ち"
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--p-amber)" }} />
          あなた待ち <b className="tabular-nums" style={{ color: "var(--p-text)" }}>{awaitingCount}</b>
        </span>
        <span
          className="flex items-center gap-1.5 text-[12px]"
          style={{ color: "var(--p-text-2)" }}
          title="今週公開した記事数"
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--p-green)" }} />
          今週公開 <b className="tabular-nums" style={{ color: "var(--p-text)" }}>{publishedThisWeek}</b>
        </span>
      </div>

      <button
        onClick={onOpenProposal}
        title="施策を追加"
        className="flex items-center gap-1 rounded-[9px] px-2.5 py-[6px] text-[12px] font-medium"
        style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text-2)" }}
      >
        <IconPlus size={14} /> <span className="hidden sm:inline">施策</span>
      </button>

      <button
        onClick={onRefresh}
        disabled={syncing}
        title="データを更新"
        className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-[6px] text-[12px] transition-colors hover:brightness-125"
        style={{
          background: syncStale ? "var(--p-amber-weak)" : "var(--p-bg-input)",
          border: `1px solid ${syncStale ? "rgba(249,185,78,0.3)" : "var(--p-border)"}`,
          color: syncStale ? "var(--p-amber)" : "var(--p-text-3)",
        }}
      >
        <span className={syncing ? "proto-spin" : undefined} style={{ display: "inline-flex" }}>
          <IconRefresh size={13} />
        </span>
        <span className="hidden sm:inline">{syncing ? "更新中…" : (syncLabel ?? "—")}</span>
      </button>

      <button
        onClick={onOpenPalette}
        className="hidden items-center gap-2 rounded-[9px] px-2.5 py-[6px] text-[12.5px] transition-colors hover:brightness-125 sm:flex"
        style={{
          background: "var(--p-bg-input)",
          border: "1px solid var(--p-border)",
          color: "var(--p-text-2)",
        }}
      >
        <IconCommand size={14} />
        <span className="flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
    </header>
  );
}
