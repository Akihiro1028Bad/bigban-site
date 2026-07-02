/**
 * メディアライブラリ(#proto P5b・#143 差し替えの後継導線)。
 *
 * proto `approve-proto/MediaLibraryModal.tsx` の見た目を本番へ移植し、実 API に結線する:
 *  - 一覧 : `GET /api/growth/media?limit=…`(`authHeaders`)→ サムネグリッド(next/image)。
 *  - 追加 : `POST /api/growth/media`(multipart `file`)→ 返却 URL を先頭へ挿入し即選択候補に。
 *  - 反映 : `POST /api/growth/draft/eyecatch { pageId, eyecatchUrl }`(`authHeaders`)→ 成功で `onApplied`。
 *
 * proto の `MOCK_MEDIA`(モックデータ)/種別フィルタ chip はこのモーダルでは不使用
 * (実データは API 経由で取得)。`mediaSvgUrl` は別途 HouseStylePreview / ImageSlot が使用中。
 * 実データ(microCMS メディア)にフィルタ軸が無いためフィルタは縮約(非表示)。
 * MANAGEMENT キーは server-only のため一覧/アップロードは API ルート経由のみ(鍵はクライアントへ出さない)。
 * クライアント事前検証は `media.ts` の純関数 `validateUpload`(client-safe)を再利用する(重複実装しない)。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

import { MEDIA_ALLOWED_MIME, validateUpload } from "@/lib/growth/media";

import { authHeaders } from "./authHeaders";
import { handleOverlayKeyDown } from "./hooks/overlayKeyDown";
import { useDialog } from "./hooks/useDialog";
import { IconCheck, IconUpload } from "./ui/icons";
import { Kbd } from "./ui/primitives";

interface MediaLibraryModalProps {
  token: string;
  /** 差し替え対象記事の Notion page id。 */
  pageId: string;
  /** モーダル見出し(記事タイトルなど)。 */
  heading: string;
  onClose: () => void;
  /** アイキャッチ反映が成功したときに親へ通知(盤の再取得など)。 */
  onApplied: () => void;
}

/** 一覧取得の上限。proto の 30 件相当。 */
const LIST_LIMIT = 30;

interface MediaListResponse {
  success?: boolean;
  media?: { url?: unknown }[];
}

interface UploadResponse {
  success?: boolean;
  url?: unknown;
  error?: unknown;
}

interface EyecatchResponse {
  success?: boolean;
  error?: unknown;
}

/** レスポンス JSON から URL 配列を安全に取り出す(欠落耐性)。 */
function pickUrls(body: MediaListResponse): string[] {
  if (!Array.isArray(body.media)) return [];
  return body.media.map((m) => m.url).filter((u): u is string => typeof u === "string");
}

/** エラー本文の error 文字列を安全に取り出す(無ければ既定文言)。 */
function pickError(body: { error?: unknown }, fallback: string): string {
  return typeof body.error === "string" && body.error !== "" ? body.error : fallback;
}

export function MediaLibraryModal({ token, pageId, heading, onClose, onApplied }: MediaLibraryModalProps) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialog();

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/growth/media?limit=${LIST_LIMIT}`, {
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as MediaListResponse;
      setUrls(pickUrls(body));
    } catch {
      setError("メディア一覧の取得に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    setError(null);
    const file = e.target.files?.[0];
    // input を即リセットし、同じファイルの再選択でも change が発火するようにする。
    e.target.value = "";
    if (!file) return;
    // クライアント事前検証は media.ts の純関数を再利用(重複実装しない)。
    // 中身(マジックバイト)検証はサーバ側 API が担うため head は渡さない。
    const check = validateUpload({ size: file.size, type: file.type });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/growth/media", {
        method: "POST",
        headers: authHeaders(token),
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as UploadResponse;
      // 他の呼び出し(api.ts postDecision 等)と揃え、HTTP 200 でも success:false は失敗扱いにする。
      if (!res.ok || body.success === false || typeof body.url !== "string") {
        setError(pickError(body, "アップロードに失敗しました。もう一度お試しください。"));
        return;
      }
      // 返却 URL を先頭へ挿入し、そのまま選択候補として即差し替えへ進める。
      const uploaded = body.url;
      setUrls((prev) => [uploaded, ...prev.filter((u) => u !== uploaded)]);
      await applyEyecatch(uploaded);
    } catch {
      setError("アップロードに失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function applyEyecatch(url: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/growth/draft/eyecatch", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, eyecatchUrl: url }),
      });
      const body = (await res.json().catch(() => ({}))) as EyecatchResponse;
      // 他の呼び出しと揃え、HTTP 200 でも success:false は失敗扱いにする(防御的整合)。
      if (!res.ok || body.success === false) {
        setError(pickError(body, "アイキャッチの反映に失敗しました。もう一度お試しください。"));
        return;
      }
      onApplied();
      onClose();
    } catch {
      setError("アイキャッチの反映に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  function handleSelect(url: string): void {
    void applyEyecatch(url);
  }

  return (
    // approve-shell: fixed overlay は .approve-shell 配下の外に出るため root 自身に付け var(--p-*) を解決する。
    // z-[80]: 公開キュー行から開くため、詳細/編集/パレットより前面に出す(ConfirmActionDialog と同格)。
    <div
      className="approve-shell fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`メディアライブラリ: ${heading}`}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOverlayKeyDown(e, onClose)}
        className="w-full max-w-[600px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <span className="min-w-0 truncate text-[14px] font-semibold">{heading}</span>
          <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto">
            <Kbd>esc</Kbd>
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <span className="text-[12px]" style={{ color: "var(--p-text-3)" }}>
            画像を選んでアイキャッチに設定
          </span>
          <input
            ref={fileRef}
            type="file"
            accept={MEDIA_ALLOWED_MIME.join(",")}
            onChange={handleFile}
            className="hidden"
            aria-label="画像をアップロード"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="approve-btn-ghost ml-auto flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
          >
            <IconUpload size={14} /> アップロード
          </button>
        </div>

        {error ? (
          <div role="alert" className="px-4 pt-2.5 text-[12px]" style={{ color: "var(--p-red)" }}>
            {error}
          </div>
        ) : null}

        <div className="grid max-h-[420px] grid-cols-2 gap-2.5 overflow-y-auto p-4 sm:grid-cols-3">
          {loading ? (
            <p className="col-span-full py-6 text-center text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
              読み込み中…
            </p>
          ) : urls.length === 0 ? (
            <p className="col-span-full py-6 text-center text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
              メディアがありません。アップロードして追加してください。
            </p>
          ) : (
            urls.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => handleSelect(url)}
                disabled={busy}
                aria-label="この画像をアイキャッチに設定"
                className="group flex flex-col gap-1.5 rounded-[10px] p-2 text-left disabled:opacity-50"
                style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
              >
                <span className="relative block w-full">
                  <Image
                    src={url}
                    alt=""
                    width={180}
                    height={88}
                    unoptimized
                    className="h-[88px] w-full rounded-[7px] object-cover"
                    style={{ border: "1px solid var(--p-border)" }}
                  />
                  <span
                    className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                  >
                    <IconCheck size={14} />
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
