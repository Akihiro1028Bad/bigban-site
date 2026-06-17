"use client";

import { useState } from "react";
import type { FormEvent } from "react";

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

function cardClass(choice: Choice | undefined): string {
  const base = "rounded-lg border p-4 transition-colors";
  if (choice === "承認") return `${base} border-blue-500 bg-blue-50`;
  if (choice === "却下") return `${base} border-gray-400 bg-gray-100`;
  return `${base} border-gray-200 bg-white`;
}

function choiceButtonClass(active: boolean, activeClass: string): string {
  const inactive = "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50";
  return `${TAP_TARGET} ${active ? activeClass : inactive}`;
}

export function ApproveClient() {
  const [passphrase, setPassphrase] = useState("");
  // 既定は表示(text)。type=password は日本語IMEを無効化するため、合言葉が日本語でも
  // 打てるよう text を既定にし、必要なときだけトグルで隠せるようにする。
  const [showPassphrase, setShowPassphrase] = useState(true);
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedCount = Object.keys(choices).length;

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

  function choose(id: string, choice: Choice): void {
    setChoices((prev) => ({ ...prev, [id]: choice }));
  }

  async function save(): Promise<void> {
    const decisions = Object.entries(choices).map(([id, decision]) => ({ id, decision }));
    setBusy(true);
    try {
      const res = await fetch(approveUrl(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "保存に失敗しました。");
      }
      setItems((prev) => prev.filter((item) => !choices[item.id]));
      setChoices({});
      setMessage(`${json.updated}件を保存しました。`);
    } catch (error) {
      setMessage(toMessage(error, "保存に失敗しました。"));
    } finally {
      setBusy(false);
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
      <h1 className="text-xl font-bold text-gray-900">承認待ち {items.length}件</h1>
      {message ? (
        <p role="status" className="mt-2 text-sm text-gray-700">
          {message}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const choice = choices[item.id];
          return (
            <li key={item.id} className={cardClass(choice)} data-decision={choice ?? ""}>
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
                  {KIND_BADGE[item.kind]}
                </span>
                {choice ? (
                  <span className="text-xs font-semibold text-gray-700">選択中: {choice}</span>
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
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  aria-pressed={choice === "承認"}
                  aria-label={`承認: ${item.title}`}
                  onClick={() => choose(item.id, "承認")}
                  className={choiceButtonClass(choice === "承認", "border border-blue-600 bg-blue-600 text-white")}
                >
                  承認
                </button>
                <button
                  type="button"
                  aria-pressed={choice === "却下"}
                  aria-label={`却下: ${item.title}`}
                  onClick={() => choose(item.id, "却下")}
                  className={choiceButtonClass(choice === "却下", "border border-gray-700 bg-gray-700 text-white")}
                >
                  却下
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={save}
        disabled={busy || selectedCount === 0}
        className={`${TAP_TARGET} mt-4 w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}
      >
        {selectedCount}件を確定する
      </button>
    </main>
  );
}
