"use client";

import { useEffect, useState } from "react";

interface PendingItem {
  id: string;
  kind: "proposal" | "idea";
  title: string;
  subtitle: string;
}

type Choice = "承認" | "却下";
type Status = "loading" | "ready" | "error";

interface ApproveClientProps {
  token: string;
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function approveUrl(token: string): string {
  return `/api/growth/approve?token=${encodeURIComponent(token)}`;
}

export function ApproveClient({ token }: ApproveClientProps) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("リンクが正しくありません。");
      return;
    }
    (async () => {
      try {
        const res = await fetch(approveUrl(token));
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "取得に失敗しました。");
        }
        setItems(json.items);
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setMessage(toMessage(error, "取得に失敗しました。"));
      }
    })();
  }, [token]);

  function choose(id: string, choice: Choice): void {
    setChoices((prev) => ({ ...prev, [id]: choice }));
  }

  async function save(): Promise<void> {
    const decisions = Object.entries(choices).map(([id, decision]) => ({ id, decision }));
    if (decisions.length === 0) {
      setMessage("承認または却下を選んでください。");
      return;
    }
    setSaving(true);
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
      setSaving(false);
    }
  }

  if (status === "loading") return <p>読み込み中…</p>;
  if (status === "error") {
    return <p role="alert">{message}</p>;
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
      <button type="button" onClick={save} disabled={saving}>
        まとめて保存
      </button>
    </main>
  );
}
