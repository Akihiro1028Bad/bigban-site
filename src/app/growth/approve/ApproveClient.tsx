"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { pendingStatus } from "@/lib/growth/approve";

interface PendingDetail {
  label: string;
  value: string;
}

interface PendingItem {
  id: string;
  kind: "proposal" | "idea";
  title: string;
  subtitle: string;
  details?: PendingDetail[];
}

type Choice = "承認" | "却下";

interface Failure {
  message: string;
  retry: () => void;
}

const KIND_BADGE: Record<PendingItem["kind"], string> = {
  proposal: "📋 施策",
  idea: "📝 記事",
};

// タップ領域 44px(min-h-11 / min-w-11 = 44px)+ AA コントラストを満たす操作ボタン
const TAP_TARGET = "min-h-11 min-w-11 px-4 rounded-md text-sm font-medium transition-colors";

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function approveUrl(token: string): string {
  return `/api/growth/approve?token=${encodeURIComponent(token)}`;
}

function removeKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}

function cardClass(choice: Choice | undefined, failed: boolean): string {
  const base = "rounded-lg border p-4 transition-colors";
  if (failed) return `${base} border-red-400 bg-red-50`;
  if (choice === "承認") return `${base} border-blue-500 bg-blue-50`;
  if (choice === "却下") return `${base} border-gray-400 bg-gray-100`;
  return `${base} border-gray-200 bg-white`;
}

function choiceButtonClass(activeClass: string): string {
  return `${TAP_TARGET} ${activeClass} disabled:opacity-50`;
}

export function ApproveClient() {
  const [passphrase, setPassphrase] = useState("");
  // 既定は表示(text)。type=password は日本語IMEを無効化するため、合言葉が日本語でも
  // 打てるよう text を既定にし、必要なときだけトグルで隠せるようにする。
  const [showPassphrase, setShowPassphrase] = useState(true);
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<PendingItem[]>([]);
  // 即時保存モデル: カードごとに保存済みの選択(承認/却下)と失敗状態を持つ。確定ボタンは無い。
  const [decided, setDecided] = useState<Record<string, Choice>>({});
  const [failures, setFailures] = useState<Record<string, Failure>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const processed = Object.keys(decided).length;

  async function enter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pass = passphrase.trim();
    if (!pass) {
      setMessage("合言葉を入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(approveUrl(pass));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          res.status === 401
            ? "合言葉が違います。LINE グループでお知らせした合言葉をご確認ください。"
            : json.error ?? "取得に失敗しました。"
        );
      }
      setItems(json.items);
      setToken(pass);
      setAuthed(true);
    } catch (error) {
      setMessage(toMessage(error, "取得に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  /** ステータスを 1 件だけ更新する(承認/却下/承認待ち復帰の共通処理)。 */
  async function postStatus(id: string, decision: string): Promise<void> {
    const res = await fetch(approveUrl(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: [{ id, decision }] }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error ?? "保存に失敗しました。");
    }
  }

  async function decide(item: PendingItem, choice: Choice): Promise<void> {
    setSavingId(item.id);
    setFailures((prev) => removeKey(prev, item.id));
    try {
      await postStatus(item.id, choice);
      setDecided((prev) => ({ ...prev, [item.id]: choice }));
    } catch (error) {
      const text = toMessage(error, "保存に失敗しました。");
      setFailures((prev) => ({
        ...prev,
        [item.id]: { message: text, retry: () => decide(item, choice) },
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function undo(item: PendingItem): Promise<void> {
    setSavingId(item.id);
    setFailures((prev) => removeKey(prev, item.id));
    try {
      await postStatus(item.id, pendingStatus(item.kind));
      setDecided((prev) => removeKey(prev, item.id));
    } catch (error) {
      const text = toMessage(error, "取り消しに失敗しました。");
      setFailures((prev) => ({
        ...prev,
        [item.id]: { message: text, retry: () => undo(item) },
      }));
    } finally {
      setSavingId(null);
    }
  }

  if (!authed) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold text-gray-900">承認ページ</h1>
        <p className="mt-2 text-sm text-gray-700">
          LINE で届いた合言葉を入力してください。
        </p>
        <form onSubmit={enter} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="passphrase" className="block text-sm font-medium text-gray-800">
              合言葉
            </label>
            <div className="flex gap-2">
              <input
                id="passphrase"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="min-h-11 w-full rounded-md border border-gray-300 px-3 text-base text-gray-900"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((prev) => !prev)}
                aria-label={showPassphrase ? "合言葉を隠す" : "合言葉を表示"}
                className={`${TAP_TARGET} shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
              >
                {showPassphrase ? "隠す" : "表示"}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className={`${TAP_TARGET} w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}
          >
            確認する
          </button>
        </form>
        {message ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {message}
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-gray-900">今週の提案</h1>
        <p className="text-sm text-gray-600">
          処理済み {processed} / {items.length}件
        </p>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const choice = decided[item.id];
          const isBusy = savingId === item.id;
          const failure = failures[item.id];
          return (
            <li
              key={item.id}
              className={cardClass(choice, Boolean(failure))}
              data-decision={choice ?? ""}
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
                  {KIND_BADGE[item.kind]}
                </span>
                {choice ? (
                  <span className="text-xs font-semibold text-gray-700">{choice}しました</span>
                ) : null}
              </div>
              <p className="mt-2 font-semibold text-gray-900">{item.title}</p>
              {item.subtitle ? (
                <p className="text-sm text-gray-600">{item.subtitle}</p>
              ) : null}
              {item.details && item.details.length > 0 ? (
                <dl className="mt-2 space-y-1 text-sm">
                  {item.details.map((detail) => (
                    <div key={detail.label} className="flex gap-2">
                      <dt className="shrink-0 font-medium text-gray-700">{detail.label}</dt>
                      <dd className="text-gray-800">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {failure ? (
                <div
                  role="alert"
                  className="mt-2 flex items-center justify-between gap-2 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
                >
                  <span>{failure.message}</span>
                  <button
                    type="button"
                    aria-label={`再試行: ${item.title}`}
                    onClick={failure.retry}
                    disabled={isBusy}
                    className={choiceButtonClass(
                      "shrink-0 border border-red-600 bg-red-600 text-white"
                    )}
                  >
                    再試行
                  </button>
                </div>
              ) : null}
              {choice ? (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-600">保存済み</span>
                  <button
                    type="button"
                    aria-label={`取り消す: ${item.title}`}
                    onClick={() => undo(item)}
                    disabled={isBusy}
                    className={choiceButtonClass(
                      "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    取り消す
                  </button>
                </div>
              ) : (
                <div role="group" aria-label={`承認または却下: ${item.title}`} className="mt-3 flex gap-2">
                  <button
                    type="button"
                    aria-label={`承認: ${item.title}`}
                    onClick={() => decide(item, "承認")}
                    disabled={isBusy}
                    className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
                  >
                    承認
                  </button>
                  <button
                    type="button"
                    aria-label={`却下: ${item.title}`}
                    onClick={() => decide(item, "却下")}
                    disabled={isBusy}
                    className={choiceButtonClass("border border-gray-700 bg-gray-700 text-white")}
                  >
                    却下
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
