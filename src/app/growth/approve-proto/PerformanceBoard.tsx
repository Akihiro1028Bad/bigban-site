/**
 * 成績ボード(#proto): 公開記事のGA4成績(モック)を期間切替・推移つきで俯瞰し、
 * 伸びた記事から「次のネタ案」へ橋渡ししてグロースループを閉じる。
 */
"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  IconArrowDown,
  IconArrowUp,
  IconChart,
  IconChevronDown,
  IconPlus,
  IconSparkles,
} from "./icons";
import { RANGES, rangeView } from "./metricsView";
import type { Range } from "./metricsView";
import type { Article } from "./types";
import { EyecatchThumb, Sparkline } from "./ui";

function fmt(n: number): string {
  return n.toLocaleString();
}

interface PerformanceBoardProps {
  articles: Article[];
  onAddIdea: (article: Article) => void;
}

export function PerformanceBoard({ articles, onAddIdea }: PerformanceBoardProps) {
  const [range, setRange] = useState<Range>("7");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return articles
      .filter((a) => a.metrics)
      .map((a) => ({ article: a, m: rangeView(a.metrics!, range) }))
      .sort((x, y) => y.m.views - x.m.views);
  }, [articles, range]);

  const totalViews = rows.reduce((n, r) => n + r.m.views, 0);
  const totalUsers = rows.reduce((n, r) => n + r.m.users, 0);
  const avgDelta = rows.length
    ? Math.round(rows.reduce((n, r) => n + r.m.deltaPct, 0) / rows.length)
    : 0;
  const maxViews = Math.max(1, ...rows.map((r) => r.m.views));
  const best = rows.find((r) => r.m.deltaPct > 0);

  return (
    <div className="mx-auto max-w-[880px] px-6 py-7">
      <div className="mb-5 flex items-center gap-3">
        <IconChart size={18} {...{ style: { color: "var(--p-accent)" } }} />
        <h2 className="text-[16px] font-semibold">成績ボード</h2>
        <div
          className="ml-auto flex items-center gap-[2px] rounded-[9px] p-[3px]"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
        >
          {RANGES.map((r) => {
            const active = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className="rounded-[7px] px-2.5 py-[5px] text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--p-bg-raised)" : "transparent",
                  color: active ? "var(--p-text)" : "var(--p-text-2)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <SummaryCard label="公開記事" value={String(rows.length)} />
        <SummaryCard label="合計表示数" value={fmt(totalViews)} />
        <SummaryCard label="合計ユーザー" value={fmt(totalUsers)} />
        <SummaryCard label="平均伸び率" value={`${avgDelta >= 0 ? "+" : ""}${avgDelta}%`} tone={avgDelta >= 0 ? "up" : "down"} />
      </div>

      {best && (
        <div
          className="mb-5 flex items-center gap-3 rounded-[12px] p-3.5"
          style={{ background: "var(--p-green-weak)", border: "1px solid rgba(61,220,151,0.25)" }}
        >
          <IconArrowUp size={18} {...{ style: { color: "var(--p-green)" } }} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px]" style={{ color: "var(--p-green)" }}>
              いちばん伸びた記事
            </div>
            <div className="truncate text-[13.5px] font-medium">{best.article.title}</div>
          </div>
          <div className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--p-green)" }}>
            +{best.m.deltaPct}%
          </div>
          <button
            onClick={() => onAddIdea(best.article)}
            className="flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
            style={{ background: "var(--p-green)", color: "#06140d" }}
          >
            <IconPlus size={13} /> 似た企画をネタ案に
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map(({ article: a, m }) => {
          const up = m.deltaPct >= 0;
          const expanded = expandedId === a.id;
          return (
            <div
              key={a.id}
              className="rounded-[12px]"
              style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}
            >
              <button
                onClick={() => setExpandedId(expanded ? null : a.id)}
                className="proto-row flex w-full items-center gap-3.5 p-3.5 text-left"
              >
                <EyecatchThumb hue={a.hue} has={a.hasEyecatch} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{a.title}</div>
                  <div className="mt-1.5 h-[6px] overflow-hidden rounded-full" style={{ background: "var(--p-bg-active)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(m.views / maxViews) * 100}%`, background: "var(--p-accent)" }} />
                  </div>
                </div>
                <Sparkline data={m.series} up={up} />
                <div className="w-[84px] text-right">
                  <div className="text-[14px] font-semibold tabular-nums">{fmt(m.views)}</div>
                  <div className="text-[11px]" style={{ color: "var(--p-text-3)" }}>表示数</div>
                </div>
                <div
                  className="flex w-[64px] items-center justify-end gap-1 text-[13px] font-medium tabular-nums"
                  style={{ color: up ? "var(--p-green)" : "var(--p-red)" }}
                >
                  {up ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
                  {Math.abs(m.deltaPct)}%
                </div>
                <span
                  className="transition-transform"
                  style={{ color: "var(--p-text-3)", transform: expanded ? "rotate(180deg)" : "none" }}
                >
                  <IconChevronDown size={16} />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <RowDetail article={a} users={m.users} onAddIdea={() => onAddIdea(a)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "var(--p-green)" : tone === "down" ? "var(--p-red)" : "var(--p-text)";
  return (
    <div className="rounded-[12px] p-4" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <div className="text-[12px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
      <div className="mt-1.5 text-[24px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function RowDetail({ article, users, onAddIdea }: { article: Article; users: number; onAddIdea: () => void }) {
  // モックの内訳(記事の属性から決定的に算出)。
  const bounce = 36 + (article.score % 12);
  const avgRead = Math.max(1, article.readMinutes - 1) + 0.4;
  const searchShare = 52 + (article.hue % 18);
  return (
    <div className="border-t px-3.5 py-4" style={{ borderColor: "var(--p-border)" }}>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="ユーザー" value={fmt(users)} />
        <Stat label="直帰率" value={`${bounce}%`} />
        <Stat label="平均読了" value={`${avgRead.toFixed(1)}分`} />
        <Stat label="検索流入" value={`${searchShare}%`} />
      </div>
      <div
        className="mt-3 flex items-center gap-2 rounded-[10px] p-3"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <IconSparkles size={15} {...{ style: { color: "var(--p-accent)" } }} />
        <span className="flex-1 text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
          この記事は検索流入が強め。同じ切り口で関連テーマを増やすと伸びやすい傾向です。
        </span>
        <button
          onClick={onAddIdea}
          className="flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconPlus size={13} /> 似た企画をネタ案に追加
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] p-2.5" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      <div className="text-[11px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
