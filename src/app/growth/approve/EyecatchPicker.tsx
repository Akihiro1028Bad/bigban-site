"use client";

import { useState } from "react";

import Image from "next/image";

import { REGEN_BUSY_STATUSES, type RegenStatus } from "@/lib/growth/eyecatchRegen";
import { readJsonObject } from "@/lib/growth/safeJson";

import { StaleNotice } from "./StaleNotice";

interface EyecatchPickerProps {
  pageId: string;
  token: string;
  /** 差し替え成功時に呼ぶ(親が下書きを再取得してプレビューを更新する)。 */
  onReplaced: () => void;
  /** #166: アイキャッチ AI 再生成のステータス(依頼中/処理中/失敗/なし)。未指定は「なし」。 */
  regenStatus?: RegenStatus;
  /** #C2 UI: アイキャッチ再生成の依頼時刻(ms)。経過/滞留表示用。未指定は null。 */
  regenRequestedAtMs?: number | null;
}

/** 再生成が進行中(依頼中/処理中)か。進行中は再依頼を無効化しバッジを出す。 */
function isRegenBusy(status: RegenStatus): boolean {
  return (REGEN_BUSY_STATUSES as readonly string[]).includes(status);
}

interface MediaItem {
  url: string;
}

type ListPhase =
  | { status: "loading" }
  | { status: "ready"; media: MediaItem[] }
  | { status: "error" };

type Mode = "closed" | "pick" | "regen";

function withToken(path: string, token: string): string {
  return `${path}?token=${encodeURIComponent(token)}`;
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * アイキャッチの差し替え / AI 再生成 UI(Epic #140 / #143 / #144)。
 * - 差し替え(#143): microCMS メディアの一覧から選択 or 新規アップロードして即差し替え。
 * - AI 再生成(#144): 指示を添えて PC の画像ループへ再生成を依頼する(プル型・非同期)。
 */
export function EyecatchPicker({
  pageId,
  token,
  onReplaced,
  regenStatus = "なし",
  regenRequestedAtMs = null,
}: EyecatchPickerProps) {
  const [mode, setMode] = useState<Mode>("closed");
  const [list, setList] = useState<ListPhase>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [regenText, setRegenText] = useState("");

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

  function openPick(): void {
    setMode("pick");
    setNotice("");
    void loadMedia();
  }

  function openRegen(): void {
    setMode("regen");
    setNotice("");
    setActionError("");
    setRegenText("");
  }

  function close(): void {
    setMode("closed");
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
      setMode("closed");
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

  async function requestRegen(): Promise<void> {
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(withToken("/api/growth/eyecatch/regen", token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, instruction: regenText.trim() }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error(json.error ?? "再生成の依頼に失敗しました。");
      setNotice("再生成を依頼しました。PCが処理して数分で反映されます。");
      setMode("closed");
    } catch (error) {
      setActionError(errMsg(error, "再生成の依頼に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "closed") {
    // #166: 再生成の進行中/失敗を永続表示する(一時 notice と違い再取得でも消えない)。
    const regenBusy = isRegenBusy(regenStatus);
    return (
      <div className="mt-2">
        {notice ? (
          <p className="mb-2 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">{notice}</p>
        ) : null}
        {regenBusy ? (
          <p role="status" className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
            AI再生成 {regenStatus}…（PCが処理し、完了したら自動で反映されます）
          </p>
        ) : null}
        <StaleNotice requestedAtMs={regenRequestedAtMs} busy={regenBusy} />
        {regenStatus === "失敗" ? (
          <p role="status" className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            AI再生成に失敗しました。もう一度依頼できます。
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="アイキャッチを差し替え"
            onClick={openPick}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            アイキャッチを差し替え
          </button>
          <button
            type="button"
            aria-label="アイキャッチをAIで再生成"
            onClick={openRegen}
            disabled={regenBusy}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            AIで再生成
          </button>
        </div>
      </div>
    );
  }

  if (mode === "regen") {
    return (
      <div
        role="group"
        aria-label="アイキャッチをAIで再生成"
        className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3"
      >
        <label htmlFor={`regen-${pageId}`} className="block text-xs font-medium text-gray-600">
          再生成の指示（任意・空ならおまかせ）
        </label>
        <textarea
          id={`regen-${pageId}`}
          value={regenText}
          onChange={(event) => setRegenText(event.target.value)}
          maxLength={500}
          disabled={busy}
          rows={2}
          placeholder="例: 梅雨の屋内で打つ宇宙人。青系で明るく。"
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-xs text-gray-900"
        />
        {actionError ? (
          <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {actionError}
          </p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void requestRegen()}
            disabled={busy}
            className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            再生成を依頼
          </button>
        </div>
      </div>
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
          onClick={close}
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
