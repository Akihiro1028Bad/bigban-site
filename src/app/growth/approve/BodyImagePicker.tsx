"use client";

import { useState } from "react";

import Image from "next/image";

import { isMicrocmsAssetUrl } from "@/lib/growth/media";
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

/** 再生成指示の上限長(API の MAX_INSTRUCTION_LEN と一致)。 */
const MAX_REGEN_INSTRUCTION = 500;

function withToken(path: string, token: string): string {
  return `${path}?token=${encodeURIComponent(token)}`;
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 本文画像の差し替え & AI 再生成 UI(Epic #140 / #145・#156)。
 * 下書き本文HTML中の microCMS 画像を一覧し、各画像を
 *  - メディア選択 or 新規アップロードで**差し替え**て /api/growth/draft/edit に保存(#145)、または
 *  - **AI で再生成**を /api/growth/body-image/regen に依頼(プル型・PC が後で反映)(#156)
 * できる。再生成は Notion に依頼を記録するだけで、反映は常時稼働 PC の画像ループが行う。
 */
export function BodyImagePicker({ pageId, token, bodyHtml, onSaved }: BodyImagePickerProps) {
  const images = listBodyImages(bodyHtml);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [list, setList] = useState<ListPhase>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // ── AI 再生成(#156) ──
  const [regenFor, setRegenFor] = useState<number | null>(null);
  const [regenText, setRegenText] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [notice, setNotice] = useState("");

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
    setRegenFor(null);
    setError("");
    setNotice("");
    void loadMedia();
  }

  function closePick(): void {
    setPickFor(null);
    setError("");
  }

  function openRegen(index: number): void {
    setRegenFor(index);
    setPickFor(null);
    setRegenText("");
    setRegenError("");
    setNotice("");
  }

  function closeRegen(): void {
    setRegenFor(null);
    setRegenError("");
  }

  async function submitRegen(src: string): Promise<void> {
    setRegenBusy(true);
    setRegenError("");
    try {
      const res = await fetch(withToken("/api/growth/body-image/regen", token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, targetSrc: src, instruction: regenText.trim() }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error(json.error ?? "再生成の依頼に失敗しました。");
      setRegenFor(null);
      setNotice("AI再生成を依頼しました。PCの画像ループが順次反映し、完了したら通知します。");
    } catch (e) {
      setRegenError(errMsg(e, "再生成の依頼に失敗しました。"));
    } finally {
      setRegenBusy(false);
    }
  }

  async function saveReplace(index: number, newUrl: string): Promise<void> {
    // 多層防御(security M-1): 差し替え先は microCMS アセット URL に限定する。
    if (!isMicrocmsAssetUrl(newUrl)) {
      setError("無効な画像URLです。");
      return;
    }
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

  function renderRegen(index: number, src: string) {
    return (
      <div role="group" aria-label="AIで再生成" className="mt-2 rounded-md border border-gray-200 bg-white p-2">
        <label className="block text-[11px] text-gray-500" htmlFor={`regen-${index}`}>
          再生成の指示（任意・例: もっと明るく / 図解で）
        </label>
        <textarea
          id={`regen-${index}`}
          value={regenText}
          maxLength={MAX_REGEN_INSTRUCTION}
          disabled={regenBusy}
          onChange={(event) => setRegenText(event.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
          rows={2}
        />
        {regenError ? (
          <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
            {regenError}
          </p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeRegen}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={regenBusy}
            onClick={() => void submitRegen(src)}
            className="rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            再生成を依頼
          </button>
        </div>
      </div>
    );
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
      <h4 className="text-xs font-bold text-gray-600">本文画像（差し替え／AI再生成）</h4>
      {notice ? (
        <p role="status" className="mt-2 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
          {notice}
        </p>
      ) : null}
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
              {pickFor === i || regenFor === i ? null : (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`本文画像${i + 1}を差し替え`}
                    onClick={() => openPick(i)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    差し替え
                  </button>
                  <button
                    type="button"
                    aria-label={`本文画像${i + 1}をAIで再生成`}
                    onClick={() => openRegen(i)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    AIで再生成
                  </button>
                </div>
              )}
            </div>
            {pickFor === i ? renderGrid(i) : null}
            {regenFor === i ? renderRegen(i, image.src) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
