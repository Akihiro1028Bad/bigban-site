"use client";

import { useState } from "react";
import type { FormEvent } from "react";

interface PendingItem {
  id: string;
  kind: "proposal" | "idea";
  title: string;
  subtitle: string;
}

type Choice = "承認" | "却下";

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function approveUrl(token: string): string {
  return `/api/growth/approve?token=${encodeURIComponent(token)}`;
}

export function ApproveClient() {
  const [passphrase, setPassphrase] = useState("");
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
          res.status === 401 ? "合言葉が違います。" : json.error ?? "取得に失敗しました。"
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
    if (decisions.length === 0) {
      setMessage("承認または却下を選んでください。");
      return;
    }
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
      <main>
        <h1>承認ページ</h1>
        <form onSubmit={enter}>
          <label htmlFor="passphrase">合言葉</label>
          <input
            id="passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={busy}>
            入る
          </button>
        </form>
        {message ? <p role="alert">{message}</p> : null}
      </main>
    );
  }

  return (
    <main>
      <h1>承認待ち {items.length}件</h1>
      {message ? <p role="status">{message}</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <p>{item.title}</p>
            <p>{item.subtitle}</p>
            <button
              type="button"
              aria-pressed={choices[item.id] === "承認"}
              aria-label={`承認: ${item.title}`}
              onClick={() => choose(item.id, "承認")}
            >
              承認
            </button>
            <button
              type="button"
              aria-pressed={choices[item.id] === "却下"}
              aria-label={`却下: ${item.title}`}
              onClick={() => choose(item.id, "却下")}
            >
              却下
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={save} disabled={busy}>
        まとめて保存
      </button>
    </main>
  );
}
