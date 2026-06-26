/**
 * 公開キュー(#H23 例外管理型 + #H24 予約公開)。
 * 下書き済み記事を「公開OK(green)」と「要対応(例外)」に分け、green を一括公開/一括予約できる。
 *
 * - 公開は既存 `/api/growth/publish`(冪等)を ready 件数ぶん順次呼ぶ。
 * - 予約は `/api/growth/publish/schedule`(Notion に時刻を書くだけ)。実際の公開は PC の publish-due。
 * 振り分け・到来判定の純ロジックは publishQueue.ts でテスト済み。
 */

"use client";

import { useState } from "react";

import { partitionPublishQueue, type PublishQueueItem } from "@/lib/growth/publishQueue";

import { formatScheduledAt } from "./articleMetricsView";
import { authHeaders } from "./authHeaders";

interface QueueArticle extends PublishQueueItem {
  title: string;
}

interface PublishQueueProps {
  items: readonly QueueArticle[];
  token: string;
  /** 公開/予約後に盤を更新するためのコールバック。 */
  onChanged: () => void;
}

export function PublishQueue({ items, token, onChanged }: PublishQueueProps) {
  const { ready, blocked } = partitionPublishQueue(items);
  const [open, setOpen] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready.length === 0 && blocked.length === 0) return null;

  async function post(url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
  }

  async function run(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await task();
      onChanged();
    } catch {
      setError("処理中にエラーが発生しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  function handlePublishNow(): void {
    void run(async () => {
      for (const article of ready) {
        await post("/api/growth/publish", { pageId: article.id });
      }
    });
  }

  function handleSchedule(): void {
    const iso = new Date(scheduledLocal).toISOString();
    void run(async () => {
      for (const article of ready) {
        await post("/api/growth/publish/schedule", { pageId: article.id, scheduledAt: iso });
      }
    });
  }

  function handleUnschedule(id: string): void {
    void run(async () => {
      await post("/api/growth/publish/schedule", { pageId: id, scheduledAt: null });
    });
  }

  return (
    <section aria-label="公開キュー" className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm font-bold text-gray-900"
      >
        <span>公開キュー（公開OK {ready.length} 件 / 要対応 {blocked.length} 件）</span>
        <span aria-hidden className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <>
      {blocked.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-rose-700">要対応（公開できない例外）</p>
          <ul className="mt-1 space-y-1">
            {blocked.map(({ item, reason }) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-900">{item.title}</span>
                <span className="text-xs font-semibold text-rose-700">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ready.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-emerald-700">公開OK</p>
          <ul className="mt-1 space-y-1">
            {ready.map((article) => (
              <li key={article.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-900">{article.title}</span>
                {typeof article.scheduledAtMs === "number" ? (
                  <span className="flex items-center gap-2 text-xs text-gray-600">
                    予約 {formatScheduledAt(article.scheduledAtMs)}
                    <button
                      type="button"
                      onClick={() => handleUnschedule(article.id)}
                      disabled={busy}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 disabled:opacity-50"
                    >
                      解除
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePublishNow}
              disabled={busy}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              公開OK {ready.length} 件を今すぐ公開
            </button>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              予約時刻
              <input
                type="datetime-local"
                value={scheduledLocal}
                onChange={(event) => setScheduledLocal(event.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleSchedule}
              disabled={busy || scheduledLocal === ""}
              className="rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-semibold text-emerald-700 disabled:opacity-50"
            >
              この時刻に予約
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        </>
      ) : null}
    </section>
  );
}
