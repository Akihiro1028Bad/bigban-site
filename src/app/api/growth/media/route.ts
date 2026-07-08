/**
 * メディア(画像)一覧 / アップロード API(Epic #140 / #142)。
 *
 * GET  : microCMS MANAGEMENT API でメディアを一覧する(limit/offset)。
 * POST : multipart/form-data の `file` を MANAGEMENT API へアップロードし URL を返す。
 *
 * 提供は **list / upload のみ**(delete 等は作らない)。`MICROCMS_MANAGEMENT_API_KEY` は
 * 削除も可能な強権限のため **server-only**(このルートでのみ参照・クライアントへ渡さない)。
 *
 * 強権限 API のため、APPROVE_AUTH_ENABLED=false でも fail-closed にする。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import {
  fetchMediaList,
  parseMediaListParams,
  sanitizeFileName,
  uploadMediaBlob,
  validateUpload,
  type ManagementOptions,
} from "@/lib/growth/media";
import { defaultFetch } from "@/lib/growth/notion";

export const runtime = "nodejs";

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function serverError(): Response {
  return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
}

/** MANAGEMENT API の接続情報(server-only)。未設定は null。 */
function managementOptions(): ManagementOptions | null {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_MANAGEMENT_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(request, true)) return unauthorized("メディア操作には認証が必要です。");

  const options = managementOptions();
  if (!options) return serverError();

  try {
    const result = await fetchMediaList(parseMediaListParams(url.searchParams), options);
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json(
      { success: false, error: "メディア一覧の取得に失敗しました" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request, true)) return unauthorized("メディア操作には認証が必要です。");

  const options = managementOptions();
  if (!options) return serverError();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("不正なリクエストです(multipart/form-data が必要です)。");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest("ファイルが指定されていません。");
  }

  // #SEC-06: クライアント申告の MIME だけでなく先頭バイトで実形式を検証する(SVG/HTML 偽装を弾く)。
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = validateUpload({ size: file.size, type: file.type, head });
  if (!check.ok) return badRequest(check.error);

  try {
    const { url: assetUrl } = await uploadMediaBlob(
      { blob: file, fileName: sanitizeFileName(file.name) },
      options
    );
    return NextResponse.json({ success: true, url: assetUrl });
  } catch {
    return NextResponse.json(
      { success: false, error: "アップロードに失敗しました" },
      { status: 502 }
    );
  }
}
