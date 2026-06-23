/**
 * 承認画面のメディア(画像)操作の純ロジック(Epic #140 / #142)。
 *
 * microCMS の **MANAGEMENT API**(`{domain}.microcms-management.io/api/v1/media`)で
 * メディアを一覧 / アップロードする。MANAGEMENT キーは削除も可能な強権限のため、
 * このモジュールは **server-only**(API ルートからのみ呼ぶ)。`fetchFn` を注入して
 * テスト可能にし、I/O を持たない検証・パース関数はここに集約する。
 *
 * 提供するのは **list / upload のみ**(delete 等は意図的に作らない)。
 */

import { z } from "zod";

import type { FetchFn } from "./notion";

/** アップロード上限(5MB)。 */
export const MEDIA_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 許可する画像 MIME(ホワイトリスト)。 */
export const MEDIA_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** 一覧の既定/上限件数。 */
export const MEDIA_LIST_DEFAULT_LIMIT = 30;
export const MEDIA_LIST_MAX_LIMIT = 100;

export interface UploadValidationInput {
  size: number;
  type: string;
}

/** アップロードのサイズ / MIME を検証する(API 境界で実行)。 */
export function validateUpload(
  input: UploadValidationInput
): { ok: true } | { ok: false; error: string } {
  if (input.size <= 0) {
    return { ok: false, error: "ファイルが空です。" };
  }
  if (input.size > MEDIA_MAX_UPLOAD_BYTES) {
    return { ok: false, error: "ファイルサイズが上限(5MB)を超えています。" };
  }
  if (!(MEDIA_ALLOWED_MIME as readonly string[]).includes(input.type)) {
    return { ok: false, error: "対応していない画像形式です(JPEG/PNG/WebP/GIF/AVIF)。" };
  }
  return { ok: true };
}

/**
 * アップロードのファイル名を無害化する(#142 security M-1)。
 * パス区切りを除いて basename 化し、英数・`._-` 以外を `_` に、先頭ドットを除去、
 * 200 文字に切り詰める。空になれば `upload`。multipart の Content-Disposition への
 * 任意文字列混入(トラバーサル/制御文字)を防ぐ。
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/^.*[\\/]/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 200);
  return cleaned || "upload";
}

export interface MediaListParams {
  limit: number;
  offset: number;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** クエリから一覧の limit/offset を取り出し、安全域にクランプする。 */
export function parseMediaListParams(searchParams: URLSearchParams): MediaListParams {
  return {
    limit: clampInt(searchParams.get("limit"), MEDIA_LIST_DEFAULT_LIMIT, 1, MEDIA_LIST_MAX_LIMIT),
    offset: clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function managementBase(serviceDomain: string): string {
  return `https://${serviceDomain}.microcms-management.io/api/v1/media`;
}

export interface MediaItem {
  url: string;
}

export interface MediaListResult {
  media: MediaItem[];
  totalCount: number;
  limit: number;
  offset: number;
}

const mediaListSchema = z
  .object({
    media: z.array(z.object({ url: z.string() }).passthrough()),
    totalCount: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })
  .passthrough();

export interface ManagementOptions {
  serviceDomain: string;
  apiKey: string;
  fetchFn: FetchFn;
}

/** MANAGEMENT API でメディアを一覧する。 */
export async function fetchMediaList(
  params: MediaListParams,
  options: ManagementOptions
): Promise<MediaListResult> {
  const { serviceDomain, apiKey, fetchFn } = options;
  const url = `${managementBase(serviceDomain)}?limit=${params.limit}&offset=${params.offset}`;
  const res = await fetchFn(url, {
    method: "GET",
    headers: { "X-MICROCMS-API-KEY": apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`メディア一覧の取得に失敗しました (HTTP ${res.status}): ${text}`);
  }
  const parsed = mediaListSchema.parse(await res.json());
  return {
    media: parsed.media.map((m) => ({ url: m.url })),
    totalCount: parsed.totalCount ?? parsed.media.length,
    limit: parsed.limit ?? params.limit,
    offset: parsed.offset ?? params.offset,
  };
}

export interface UploadBlobInput {
  blob: Blob;
  fileName: string;
}

/** MANAGEMENT API へ画像をアップロードし、アセット URL を返す。 */
export async function uploadMediaBlob(
  input: UploadBlobInput,
  options: ManagementOptions
): Promise<{ url: string }> {
  const { serviceDomain, apiKey, fetchFn } = options;
  const form = new FormData();
  form.append("file", input.blob, input.fileName);
  const res = await fetchFn(managementBase(serviceDomain), {
    method: "POST",
    headers: { "X-MICROCMS-API-KEY": apiKey },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`メディアのアップロードに失敗しました (HTTP ${res.status}): ${text}`);
  }
  const body = (await res.json()) as { url?: string };
  if (!body.url) {
    throw new Error("アップロード応答に url が含まれていません。");
  }
  return { url: body.url };
}
