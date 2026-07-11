/**
 * 公開キュー(#H23 例外管理型 + #H24 予約公開・#proto P5b 再スキン)。
 * 下書き済み記事を proto の 3サマリカード(公開OK/予約済み/要対応)＋3セクションで表示し、
 * ready を一括公開/一括予約できる。個別行でも公開/予約/解除/修正できる。
 *
 * - 3分割は `splitPublishQueue`(純ロジック)へ委譲。ready/scheduled/blocked。
 * - 公開は既存 `/api/growth/publish`(冪等)を ready 件数ぶん順次呼ぶ。
 * - 予約は `/api/growth/publish/schedule`(Notion に時刻を書くだけ・実公開は PC の publish-due)。
 *   予約は SchedulePicker(プリセット/日時指定)で時刻を選び、atMs→ISO で POST する。
 * - 要対応行は onFix で詳細パネルへ遷移(親 ApproveClient が activeId/view を設定)。
 * 振り分け・到来判定の純ロジックは publishQueue.ts / publishQueueView.ts でテスト済み。
 */

"use client";

import { useState } from "react";

import { EYECATCH_MISSING_REASON } from "@/lib/growth/publishQueue";
import { splitPublishQueue, formatSchedule } from "@/lib/growth/publishQueueView";

import { authHeaders } from "./authHeaders";
import { MediaLibraryModal } from "./MediaLibraryModal";
import { SchedulePicker } from "./SchedulePicker";
import { cardHue } from "./boardCardView";
import type { PendingItem } from "./types";
import { EyecatchThumb } from "./ui/eyecatchThumb";
import {
  IconArrowRight,
  IconBolt,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconImage,
  IconX,
} from "./ui/icons";

interface PublishQueueProps {
  items: readonly PendingItem[];
  token: string;
  /** 公開/予約後に盤を更新するためのコールバック。 */
  onChanged: () => void;
  /** 要対応行の「修正する」から詳細パネルへ遷移する(親が activeId/view を設定)。 */
  onFix?: (id: string) => void;
}

export function PublishQueue({ items, token, onChanged, onFix }: PublishQueueProps) {
  const { ready, scheduled, blocked } = splitPublishQueue(items);
  // 予約ピッカーの対象 id 群(null=閉)。まとめて/個別の両方で使う。
  const [scheduleFor, setScheduleFor] = useState<string[] | null>(null);
  // メディアライブラリ(アイキャッチ差し替え #143後継)の対象記事(null=閉)。
  const [mediaFor, setMediaFor] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 公開待ち(ready/scheduled/blocked)が空でも、見出しは残して空状態を明示する。
  // 記事公開直後にキューが空になり画面が真っ白になる問題(UX)への対処。
  if (ready.length === 0 && scheduled.length === 0 && blocked.length === 0) {
    return (
      <section aria-label="公開キュー" className="mx-auto max-w-[860px] px-6 py-7">
        <div className="mb-5 flex items-center gap-2">
          <IconCalendar size={18} style={{ color: "var(--p-accent)" }} />
          <h2 className="text-[16px] font-semibold">公開キュー</h2>
        </div>
        <div
          className="rounded-[12px] px-6 py-10 text-center"
          style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
        >
          <p className="text-[13.5px] font-medium">公開待ちの記事はありません</p>
          <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
            記事を承認して下書きができると、ここに公開待ちとして並びます。
          </p>
        </div>
      </section>
    );
  }

  async function post(url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    // 他の呼び出し(api.ts postDecision 等)と揃え、HTTP 200 でも success:false は失敗扱いにする
    // (防御的整合)。本文が空/非JSONでも例外にしないよう catch で握る。
    const json = (await res.json().catch(() => ({}))) as { success?: boolean };
    if (!res.ok || json.success === false) throw new Error(String(res.status));
  }

  async function run(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch {
      setError("処理中にエラーが発生しました。もう一度お試しください。");
    } finally {
      setBusy(false);
      // 成否に関わらず盤を再取得する。一括公開が途中で失敗しても、既に公開済みの分を盤へ反映させる。
      onChanged();
    }
  }

  function handlePublishNow(ids: readonly string[]): void {
    void run(async () => {
      for (const id of ids) {
        await post("/api/growth/publish", { pageId: id });
      }
    });
  }

  function handleSchedule(ids: readonly string[], atMs: number): void {
    // atMs→ISO 変換は run() 内に置く。不正値で toISOString() が throw しても catch が拾う。
    void run(async () => {
      const iso = new Date(atMs).toISOString();
      for (const id of ids) {
        await post("/api/growth/publish/schedule", { pageId: id, scheduledAt: iso });
      }
    });
  }

  function handleUnschedule(id: string): void {
    void run(async () => {
      await post("/api/growth/publish/schedule", { pageId: id, scheduledAt: null });
    });
  }

  const nextLabel = scheduled[0]?.scheduledAtMs != null
    ? formatSchedule(new Date(scheduled[0].scheduledAtMs))
    : undefined;
  const scheduleDays = Array.from(
    scheduled.reduce<Map<string, number>>((days, item) => {
      const label = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(item.scheduledAtMs as number));
      days.set(label, (days.get(label) ?? 0) + 1);
      return days;
    }, new Map()),
  );

  return (
    <section aria-label="公開キュー" className="mx-auto max-w-[860px] px-6 py-7">
      <div className="mb-5 flex items-center gap-2">
        <IconCalendar size={18} style={{ color: "var(--p-accent)" }} />
        <h2 className="text-[16px] font-semibold">公開キュー</h2>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard color="var(--p-green)" label="公開OK" value={ready.length} />
        <SummaryCard
          color="var(--p-teal)"
          label="予約済み"
          value={scheduled.length}
          sub={nextLabel ? `次: ${nextLabel}` : undefined}
        />
        <SummaryCard color="var(--p-amber)" label="要対応" value={blocked.length} />
      </div>

      {scheduleDays.length > 0 ? (
        <section aria-label="公開予定" className="mb-6 rounded-[12px] p-4" style={{ background: "linear-gradient(135deg, var(--p-teal-weak), var(--p-bg-elevated))", border: "1px solid var(--p-border)" }}>
          <div className="flex items-center gap-2 text-[12px] font-semibold"><IconCalendar size={14} style={{ color: "var(--p-teal)" }} /> 公開予定</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {scheduleDays.map(([label, count]) => <div key={label} className="rounded-[10px] px-3 py-2" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}><div className="text-[11px]" style={{ color: "var(--p-text-3)" }}>{label}</div><div className="mt-1 text-[13px] font-semibold">{count}件</div></div>)}
          </div>
        </section>
      ) : null}

      <Section
        dot="var(--p-green)"
        title="公開OK"
        count={ready.length}
        empty="公開できる記事はありません。"
        action={
          ready.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setScheduleFor(ready.map((a) => a.id))}
                disabled={busy}
                className="approve-btn-ghost flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
              >
                <IconCalendar size={13} /> まとめて予約
              </button>
              <button
                type="button"
                onClick={() => handlePublishNow(ready.map((a) => a.id))}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
                style={{ background: "var(--p-accent)", color: "#0a0c10" }}
              >
                <IconCheck size={14} /> 公開OK {ready.length} 件を今すぐ公開
              </button>
            </>
          ) : null
        }
      >
        {ready.map((a) => (
          <Row key={a.id} id={a.id} title={a.title} url={a.eyecatchUrl}>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-green)" }}>
              <IconCheckCircle size={13} /> 公開可能
            </span>
            <button
              type="button"
              onClick={() => setScheduleFor([a.id])}
              disabled={busy}
              className="approve-tool disabled:opacity-50"
              style={{ height: 28 }}
            >
              <IconCalendar size={13} /> 予約
            </button>
            <button
              type="button"
              onClick={() => handlePublishNow([a.id])}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold disabled:opacity-50"
              style={{ background: "var(--p-accent)", color: "#0a0c10" }}
            >
              <IconBolt size={13} /> 公開
            </button>
          </Row>
        ))}
      </Section>

      {scheduled.length > 0 ? (
        <Section dot="var(--p-teal)" title="予約済み" count={scheduled.length} empty="">
          <div className="px-4 pt-2 pb-1 text-[11px]" style={{ color: "var(--p-text-3)" }}>
            プル型: 時刻になると常時稼働PCが公開します（予約はNotionに時刻を書くだけ）。
          </div>
          {scheduled.map((a) => (
            <Row key={a.id} id={a.id} title={a.title} url={a.eyecatchUrl}>
              <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-teal)" }}>
                {/* scheduled は splitPublishQueue が scheduledAtMs!=null のものだけを分類する(常に非 null)。 */}
                <IconClock size={13} /> 予約 {formatSchedule(new Date(a.scheduledAtMs!))}
              </span>
              <button
                type="button"
                onClick={() => handleUnschedule(a.id)}
                disabled={busy}
                aria-label={`予約を解除: ${a.title}`}
                className="approve-tool disabled:opacity-50"
                style={{ height: 28 }}
              >
                <IconX size={13} /> 解除
              </button>
              <button
                type="button"
                onClick={() => handlePublishNow([a.id])}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold disabled:opacity-50"
                style={{ background: "var(--p-accent)", color: "#0a0c10" }}
              >
                <IconBolt size={13} /> 今すぐ
              </button>
            </Row>
          ))}
        </Section>
      ) : null}

      <Section dot="var(--p-amber)" title="要対応" count={blocked.length} empty="要対応の記事はありません。">
        {blocked.map(({ item, reason }) => (
          <Row key={item.id} id={item.id} title={item.title} url={item.eyecatchUrl}>
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium"
              style={{ background: "var(--p-red-weak)", color: "var(--p-red)" }}
            >
              <IconX size={12} /> {reason}
            </span>
            {reason === EYECATCH_MISSING_REASON ? (
              // #143後継: アイキャッチ未設定はメディアライブラリで選択/アップロードして反映する。
              <button
                type="button"
                onClick={() => setMediaFor({ id: item.id, title: item.title })}
                className="approve-tool"
                style={{ height: 28 }}
              >
                <IconImage size={13} /> 画像を選ぶ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onFix?.(item.id)}
                className="approve-tool"
                style={{ height: 28 }}
              >
                修正する <IconArrowRight size={13} />
              </button>
            )}
          </Row>
        ))}
      </Section>

      {error ? <p className="mt-2 text-[13px]" style={{ color: "var(--p-red)" }}>{error}</p> : null}

      {scheduleFor ? (
        <SchedulePicker
          count={scheduleFor.length}
          onClose={() => setScheduleFor(null)}
          onConfirm={(_label, atMs) => {
            handleSchedule(scheduleFor, atMs);
            setScheduleFor(null);
          }}
        />
      ) : null}

      {mediaFor ? (
        <MediaLibraryModal
          token={token}
          pageId={mediaFor.id}
          heading={mediaFor.title}
          onClose={() => setMediaFor(null)}
          onApplied={() => {
            // 反映成功→盤を再取得(要対応→公開OKへ移動)。モーダルは自身で閉じる。
            setMediaFor(null);
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

interface SummaryCardProps {
  color: string;
  label: string;
  value: number;
  sub?: string;
}

function SummaryCard({ color, label, value, sub }: SummaryCardProps) {
  return (
    <div className="rounded-[12px] p-3.5" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <div className="flex items-center gap-1.5">
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
        <span className="text-[12px]" style={{ color: "var(--p-text-2)" }}>{label}</span>
      </div>
      <div className="mt-1.5 text-[22px] font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--p-text-3)" }}>{sub}</div> : null}
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
        {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
      </div>
      <div className="flex flex-col">
        {count === 0 && empty ? (
          <div className="px-4 py-5 text-[12.5px]" style={{ color: "var(--p-text-2)" }}>{empty}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

interface RowProps {
  id: string;
  title: string;
  url?: string;
  children: React.ReactNode;
}

function Row({ id, title, url, children }: RowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--p-border)" }}>
      <EyecatchThumb hue={cardHue(id)} has={Boolean(url)} url={url} size={36} />
      <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
      {children}
    </div>
  );
}
