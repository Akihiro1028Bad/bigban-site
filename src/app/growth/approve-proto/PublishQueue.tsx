/**
 * 公開キュー(#proto): 公開OK / 予約済み / 要対応 に振り分けて、個別・一括で公開/予約する。
 * 予約はプル型(#H24)を模し、時刻を持たせて「予約済み」に移す。
 */
"use client";

import { useState } from "react";

import {
  IconArrowRight,
  IconBolt,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconX,
} from "./icons";
import { SchedulePicker } from "./SchedulePicker";
import type { Article, DetailTab } from "./types";
import { EyecatchThumb } from "./ui";

interface BlockInfo {
  reason: string;
  tab: DetailTab;
}

function blockInfo(a: Article): BlockInfo | null {
  if (!a.hasEyecatch) return { reason: "アイキャッチ未設定", tab: "images" };
  const body = a.checklist.find((c) => c.key === "body");
  if (body && !body.done) return { reason: "本文が空", tab: "preview" };
  return null;
}

interface PublishQueueProps {
  articles: Article[];
  nowMs: number;
  onPublishNow: (ids: string[]) => void;
  onSchedule: (ids: string[], label: string, atMs: number) => void;
  onUnschedule: (id: string) => void;
  onFix: (id: string, tab: DetailTab) => void;
}

export function PublishQueue({
  articles,
  nowMs,
  onPublishNow,
  onSchedule,
  onUnschedule,
  onFix,
}: PublishQueueProps) {
  const [scheduleFor, setScheduleFor] = useState<string[] | null>(null);

  const drafts = articles.filter((a) => a.stage === "draft_review");
  const ready = drafts.filter((a) => !blockInfo(a));
  const blocked = drafts.filter((a) => blockInfo(a));
  const scheduled = articles
    .filter((a) => a.stage === "scheduled")
    .sort((a, b) => (a.scheduledAtMs ?? 0) - (b.scheduledAtMs ?? 0));

  const nextLabel = scheduled.find((a) => a.scheduledLabel)?.scheduledLabel;

  return (
    <div className="mx-auto max-w-[860px] px-6 py-7">
      <div className="mb-5 flex items-center gap-2">
        <IconCalendar size={18} {...{ style: { color: "var(--p-accent)" } }} />
        <h2 className="text-[16px] font-semibold">公開キュー</h2>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard color="var(--p-green)" label="公開OK" value={ready.length} />
        <SummaryCard color="var(--p-teal)" label="予約済み" value={scheduled.length} sub={nextLabel ? `次: ${nextLabel}` : undefined} />
        <SummaryCard color="var(--p-amber)" label="要対応" value={blocked.length} />
      </div>

      <Section
        dot="var(--p-green)"
        title="公開OK"
        count={ready.length}
        empty="公開できる記事はありません。"
        action={
          ready.length > 0 ? (
            <>
              <button onClick={() => setScheduleFor(ready.map((a) => a.id))} className="proto-btn-ghost">
                <IconCalendar size={13} /> まとめて予約
              </button>
              <button
                onClick={() => onPublishNow(ready.map((a) => a.id))}
                className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold"
                style={{ background: "var(--p-accent)", color: "#0a0c10" }}
              >
                <IconCheck size={14} /> まとめて公開
              </button>
            </>
          ) : null
        }
      >
        {ready.map((a) => (
          <Row key={a.id} article={a}>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-green)" }}>
              <IconCheckCircle size={13} /> 公開可能
            </span>
            <button onClick={() => setScheduleFor([a.id])} className="proto-tool" style={{ height: 28 }}>
              <IconCalendar size={13} /> 予約
            </button>
            <button
              onClick={() => onPublishNow([a.id])}
              className="flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
              style={{ background: "var(--p-accent)", color: "#0a0c10" }}
            >
              <IconBolt size={13} /> 公開
            </button>
          </Row>
        ))}
      </Section>

      {scheduled.length > 0 && (
        <Section dot="var(--p-teal)" title="予約済み" count={scheduled.length} empty="">
          <div className="px-4 pt-2 pb-1 text-[11px]" style={{ color: "var(--p-text-3)" }}>
            プル型: 時刻になると常時稼働PCが公開します（予約はNotionに時刻を書くだけ）。
          </div>
          {scheduled.map((a) => {
            const pastDue = a.scheduledAtMs != null && a.scheduledAtMs < nowMs;
            return (
            <Row key={a.id} article={a}>
              {pastDue ? (
                <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-amber)" }}>
                  <IconClock size={13} /> 予定時刻を過ぎています（巡回待ち）
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-teal)" }}>
                  <IconClock size={13} /> {a.scheduledLabel ?? "予約済み"}
                </span>
              )}
              <button onClick={() => onUnschedule(a.id)} className="proto-tool" style={{ height: 28 }}>
                <IconX size={13} /> 解除
              </button>
              <button
                onClick={() => onPublishNow([a.id])}
                className="flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
                style={{ background: "var(--p-accent)", color: "#0a0c10" }}
              >
                <IconBolt size={13} /> 今すぐ
              </button>
            </Row>
            );
          })}
        </Section>
      )}

      <Section dot="var(--p-amber)" title="要対応" count={blocked.length} empty="要対応の記事はありません。">
        {blocked.map((a) => {
          const info = blockInfo(a);
          return (
            <Row key={a.id} article={a}>
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium"
                style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
              >
                <IconX size={12} /> {info?.reason}
              </span>
              <button
                onClick={() => info && onFix(a.id, info.tab)}
                className="proto-tool"
                style={{ height: 28 }}
              >
                直す <IconArrowRight size={13} />
              </button>
            </Row>
          );
        })}
      </Section>

      {scheduleFor && (
        <SchedulePicker
          count={scheduleFor.length}
          onClose={() => setScheduleFor(null)}
          onConfirm={(label, atMs) => {
            onSchedule(scheduleFor, label, atMs);
            setScheduleFor(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ color, label, value, sub }: { color: string; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-[12px] p-3.5" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <div className="flex items-center gap-1.5">
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
        <span className="text-[12px]" style={{ color: "var(--p-text-2)" }}>{label}</span>
      </div>
      <div className="mt-1.5 text-[22px] font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--p-text-3)" }}>{sub}</div>}
    </div>
  );
}

interface SectionProps {
  dot: string;
  title: string;
  count: number;
  empty: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ dot, title, count, empty, action, children }: SectionProps) {
  return (
    <div className="mb-5 rounded-[12px]" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--p-border)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
        <span className="text-[13px] font-medium">{title}</span>
        <span className="tabular-nums text-[12px]" style={{ color: "var(--p-text-3)" }}>{count}</span>
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
      <div className="flex flex-col">
        {count === 0 && empty && (
          <div className="px-4 py-5 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>{empty}</div>
        )}
        {children}
      </div>
    </div>
  );
}

function Row({ article, children }: { article: Article; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--p-border)" }}>
      <EyecatchThumb hue={article.hue} has={article.hasEyecatch} url={article.eyecatchUrl} size={36} />
      <span className="min-w-0 flex-1 truncate text-[13px]">{article.title}</span>
      {children}
    </div>
  );
}
