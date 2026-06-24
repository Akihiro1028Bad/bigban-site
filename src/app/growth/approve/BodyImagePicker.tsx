"use client";

import { useState } from "react";

import Image from "next/image";

import { readJsonObject } from "@/lib/growth/safeJson";

import { listBodyImages, replaceBodyImageSrc } from "./bodyImageEdit";

interface BodyImagePickerProps {
  pageId: string;
  token: string;
  bodyHtml: string;
  /** 差し替え保存に成功したら呼ぶ(親が下書きを再取得してプレビューを更新する)。 */
  onSaved: () => void;
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
 * 本文画像の差し替え UI(Epic #140 / #145)。
 * 下書き本文HTML中の microCMS 画像を一覧し、各画像をメディア選択 or 新規アップロードで
 * 差し替えて /api/growth/draft/edit に保存する。再生成は別 issue(本 PR は差し替えのみ)。
 */
export function BodyImagePicker({ pageId, token, bodyHtml, onSaved }: BodyImagePickerProps) {
  const images = listBodyImages(bodyHtml);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [list, setList] = useState<ListPhase>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (images.length === 0) return null;

  async function loadMedia(): Promise<void> {
    setList({ status: "loading" });
    setError("");
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

  function openPick(index: number): void {
    setPickFor(index);
    setError("");
    void loadMedia();
  }

  function closePick(): void {
    setPickFor(null);
    setError("");
  }

  async function saveReplace(index: number, newUrl: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const html = replaceBodyImageSrc(bodyHtml, index, newUrl);
      const res = await fetch(withToken("/api/growth/draft/edit", token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, bodyHtml: html }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error(json.error ?? "差し替えの保存に失敗しました。");
      onSaved();
      setPickFor(null);
    } catch (e) {
      setError(errMsg(e, "差し替えの保存に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAndReplace(index: number, file: File): Promise<void> {
    setBusy(true);
    setError("");
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
    } catch (e) {
      setError(errMsg(e, "アップロードに失敗しました。"));
    } finally {
      setBusy(false);
    }
    if (uploadedUrl) await saveReplace(index, uploadedUrl);
  }

  function renderGrid(index: number) {
    return (
      <div role="group" aria-label="メディアから選択" className="mt-2 rounded-md border border-gray-200 bg-white p-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">差し替える画像を選択</span>
          <label className="cursor-pointer rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700">
            画像をアップロード
            <input
              type="file"
              accept="image/*"
              aria-label="画像をアップロード"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAndReplace(index, file);
              }}
              className="sr-only"
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
            {error}
          </p>
        ) : null}
        {list.status === "loading" ? (
          <p className="mt-2 text-[11px] text-gray-500" aria-busy="true">
            読み込み中…
          </p>
        ) : list.status === "error" ? (
          <div role="alert" className="mt-2 flex items-center gap-2 text-[11px] text-red-700">
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
          <p className="mt-2 text-[11px] text-gray-500">メディアがまだありません。</p>
        ) : (
          <ul className="mt-2 grid grid-cols-4 gap-1.5">
            {list.media.map((m, j) => (
              <li key={m.url}>
                <button
                  type="button"
                  aria-label={`この画像に差し替え ${j + 1}`}
                  disabled={busy}
                  onClick={() => void saveReplace(index, m.url)}
                  className="block w-full overflow-hidden rounded border border-gray-300 hover:border-blue-500 disabled:opacity-50"
                >
                  <Image src={m.url} alt="" width={100} height={64} className="h-12 w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={closePick}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="本文画像" className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
      <h4 className="text-xs font-bold text-gray-600">本文画像（差し替え）</h4>
      <ul className="mt-2 space-y-2">
        {images.map((image, i) => (
          <li key={`${image.src}-${i}`} className="rounded-md border border-gray-200 bg-white p-2">
            <div className="flex items-center gap-2">
              <Image
                src={image.src}
                alt={image.alt}
                width={80}
                height={52}
                className="h-12 w-20 shrink-0 rounded object-cover"
              />
              <span className="flex-1 truncate text-xs text-gray-600">{image.alt || "（説明なし）"}</span>
              {pickFor === i ? null : (
                <button
                  type="button"
                  aria-label={`本文画像${i + 1}を差し替え`}
                  onClick={() => openPick(i)}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  差し替え
                </button>
              )}
            </div>
            {pickFor === i ? renderGrid(i) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
