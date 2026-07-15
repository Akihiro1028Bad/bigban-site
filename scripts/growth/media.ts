/**
 * microCMS 管理 API へメディア(画像)をアップロードする。
 *
 * MCP 経由の base64 渡しは大きい画像で不確実なため、ファイルを直接
 * multipart/form-data で送る。fetch / readFile は注入可能(テスト容易性)。
 */

import type { FetchFn } from "./http";
import { externalApiErrorFromResponse } from "./externalApiError";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export function mimeFromExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) {
    return "application/octet-stream";
  }
  const ext = fileName.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1];
}

export interface UploadMediaOptions {
  serviceDomain: string;
  apiKey: string;
  fetchFn: FetchFn;
  readFile: (path: string) => Promise<Buffer>;
}

/** ローカル画像を microCMS にアップロードし、アセット URL を返す。 */
export async function uploadMedia(
  filePath: string,
  options: UploadMediaOptions
): Promise<string> {
  const { serviceDomain, apiKey, fetchFn, readFile } = options;

  const fileName = baseName(filePath);
  const bytes = await readFile(filePath);
  // Buffer をそのまま渡すと BlobPart の型不一致になるため Uint8Array に変換する
  const blob = new Blob([Uint8Array.from(bytes)], {
    type: mimeFromExtension(fileName),
  });

  const form = new FormData();
  form.append("file", blob, fileName);

  const url = `https://${serviceDomain}.microcms-management.io/api/v1/media`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "X-MICROCMS-API-KEY": apiKey },
    body: form,
  });

  if (!res.ok) {
    throw externalApiErrorFromResponse("microcms.media.upload", res);
  }

  const body = (await res.json()) as { url?: string };
  if (!body.url) {
    throw new Error("アップロード応答に url が含まれていません。");
  }
  return body.url;
}
