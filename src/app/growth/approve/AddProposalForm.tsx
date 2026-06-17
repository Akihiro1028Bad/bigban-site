"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { PROPOSAL_CATEGORIES } from "@/lib/growth/proposals";

interface AddedDetail {
  label: string;
  value: string;
}

export interface AddedProposal {
  id: string;
  kind: "proposal" | "idea";
  title: string;
  subtitle: string;
  details?: AddedDetail[];
  score?: number;
}

interface AddProposalFormProps {
  token: string;
  onAdded: (item: AddedProposal) => void;
}

const FIELD = "min-h-11 w-full rounded-md border border-gray-300 px-3 text-base text-gray-900";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "追加に失敗しました。";
}

export function AddProposalForm({ token, onAdded }: AddProposalFormProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("施策名を入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/growth/proposals?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, category, note }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "追加に失敗しました。");
      }
      onAdded(json.item);
      setName("");
      setCategory("");
      setNote("");
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold text-gray-700">施策を追加</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="space-y-1">
          <label htmlFor="proposal-name" className="block text-sm font-medium text-gray-800">
            施策名
          </label>
          <input
            id="proposal-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={FIELD}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="proposal-category" className="block text-sm font-medium text-gray-800">
            カテゴリ
          </label>
          <select
            id="proposal-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={FIELD}
          >
            <option value="">（未選択）</option>
            {PROPOSAL_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="proposal-note" className="block text-sm font-medium text-gray-800">
            想定アクション / メモ
          </label>
          <textarea
            id="proposal-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base text-gray-900"
            rows={2}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          追加する
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </form>
    </details>
  );
}
