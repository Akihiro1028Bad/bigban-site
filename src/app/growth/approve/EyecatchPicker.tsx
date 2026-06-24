"use client";

import { useState } from "react";

import Image from "next/image";

import { readJsonObject } from "@/lib/growth/safeJson";

interface EyecatchPickerProps {
  pageId: string;
  token: string;
  /** 差し替え成功時に呼ぶ(親が下書きを再取得してプレビューを更新する)。 */
  onReplaced: () => void;
}

interface MediaItem {
  url: string;
}

type ListPhase =
  | { status: "loading" }
  | { status: "ready"; media: MediaItem[] }
  | { status: "error" };

function withToken(path: string, token: string): string {
  return `${path}?token=${encodeURIComponent(token)}`;
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * アイキャッチ差し替え UI(Epic #140 / #143)。
 * microCMS メディアの一覧から選択、または新規アップロードして、その URL を
 * 下書きのアイキャッチへ差し替える(/api/growth/draft/eyecatch)。
 */
export function EyecatchPicker({ pageId, token, onReplaced }: EyecatchPickerProps) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListPhase>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function loadMedia(): Promise<void> {
    setList({ status: "loading" });
    setActionError("");
    try {
      const res = await fetch(withToken("/api/growth/media", token));
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error("メディアの取得に失敗しました。");
      const media = Array.isArray(json.media) ? (json.media as MediaItem[]) : [];
      setList({ status: "ready", media });
    } catch {
      setList({ status: "error" });
    }
  }

  function openPicker(): void {
    setOpen(true);
    void loadMedia();
  }

  function closePicker(): void {
    setOpen(false);
    setActionError("");
  }

  async function applyEyecatch(eyecatchUrl: string): Promise<void> {
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(withToken("/api/growth/draft/eyecatch", token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, eyecatchUrl }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error(json.error ?? "差し替えに失敗しました。");
      onReplaced();
      setOpen(false);
    } catch (error) {
      setActionError(errMsg(error, "差し替えに失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAndApply(file: File): Promise<void> {
    setBusy(true);
    setActionError("");
    let uploadedUrl = "";
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(withToken("/api/growth/media", token), { method: "POST", body: form });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success || typeof json.url !== "string") {
        throw new Error(json.error ?? "アップロードに失敗しました。");
      }
      uploadedUrl = json.url;
    } catch (error) {
      setActionError(errMsg(error, "アップロードに失敗しました。"));
    } finally {
      setBusy(false);
    }
    if (uploadedUrl) await applyEyecatch(uploadedUrl);
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) void uploadAndApply(file);
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="アイキャッチを差し替え"
        onClick={openPicker}
        className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        アイキャッチを差し替え
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="メディアから選択"
      className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">アイキャッチを差し替え</span>
        <label className="cursor-pointer rounded-md border border-blue-600 bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
          画像をアップロード
          <input
            type="file"
            accept="image/*"
            aria-label="画像をアップロード"
            disabled={busy}
            onChange={onFileChange}
            className="sr-only"
          />
        </label>
      </div>

      {actionError ? (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {actionError}
        </p>
      ) : null}

      {list.status === "loading" ? (
        <p className="mt-2 text-xs text-gray-500" aria-busy="true">
          読み込み中…
        </p>
      ) : list.status === "error" ? (
        <div role="alert" className="mt-2 flex items-center gap-2 text-xs text-red-700">
          <span>メディアの取得に失敗しました。</span>
          <button
            type="button"
            aria-label="再読み込み"
            onClick={() => void loadMedia()}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50"
          >
            再読み込み
          </button>
        </div>
      ) : list.media.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">メディアがまだありません。</p>
      ) : (
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {list.media.map((m, i) => (
            <li key={m.url}>
              <button
                type="button"
                aria-label={`アイキャッチに設定 ${i + 1}`}
                disabled={busy}
                onClick={() => void applyEyecatch(m.url)}
                className="block w-full overflow-hidden rounded border border-gray-300 hover:border-blue-500 disabled:opacity-50"
              >
                <Image src={m.url} alt="" width={120} height={80} className="h-16 w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={closePicker}
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
