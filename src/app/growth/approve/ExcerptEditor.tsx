"use client";

import { useState } from "react";

import { autoExcerpt, EXCERPT_MAX, isExcerptTooLong } from "@/lib/growth/excerptDraft";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "./authHeaders";

interface ExcerptEditorProps {
  pageId: string;
  token: string;
  /** 自動生成の元になる本文プレーンテキスト。 */
  plain: string;
}

/**
 * メタディスクリプション(excerpt)編集(#H20)。本文から自動生成 or 手動入力し、
 * /api/growth/draft/excerpt(CONTENTキー) で microCMS 下書きへ保存する。120字カウンタ付き。
 */
export function ExcerptEditor({ pageId, token, plain }: ExcerptEditorProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/growth/draft/excerpt", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, excerpt: value }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "保存に失敗しました。");
      }
      setMessage("保存しました。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const tooLong = isExcerptTooLong(value);
  return (
    <section aria-label="メタディスクリプション" className="mt-4">
      <h3 className="mb-2 text-sm font-bold text-gray-700">メタディスクリプション（検索スニペット）</h3>
      <label htmlFor="excerpt-input" className="sr-only">
        メタディスクリプション
      </label>
      <textarea
        id="excerpt-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-gray-300 p-2 text-xs"
      />
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className={tooLong ? "font-medium text-amber-700" : "text-gray-400"}>
          {value.length} / {EXCERPT_MAX}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setValue(autoExcerpt(plain))}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            本文から自動生成
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded border border-blue-600 bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
      {message ? (
        <p role="status" className="mt-1 text-[11px] text-gray-600">
          {message}
        </p>
      ) : null}
    </section>
  );
}
