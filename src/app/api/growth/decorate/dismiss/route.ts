/**
 * 記事装飾アシスタントの「閉じる」API(Epic #147)。
 *
 * POST { pageId }: 表示中(提示中/失敗)の装飾提案を片付ける。指示・結果・ステータスをクリアして
 * 「なし」に戻すだけ(本文・下書きには触らない)。構成案修正の「破棄」と同型。冪等。強権キー不使用。
 *
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。現在オフ)。
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { isNotionPageId } from "@/lib/growth/approve";
import { buildDecorateClearProps } from "@/lib/growth/decorate";
import { defaultFetch, updatePageProps } from "@/lib/growth/notion";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifyToken(url: URL): boolean {
  if (!APPROVE_AUTH_ENABLED) return true;
  const token = url.searchParams.get("token") ?? "";
  const expected = process.env.APPROVE_SECRET ?? "";
  return Boolean(expected) && safeEqual(token, expected);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(url)) {
    return NextResponse.json({ success: false, error: "認証に失敗しました" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "不正なリクエストです。" }, { status: 400 });
  }
  const pageId = (body as { pageId?: unknown })?.pageId;
  if (!isNotionPageId(pageId)) {
    return NextResponse.json({ success: false, error: "不正な pageId です。" }, { status: 400 });
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    await updatePageProps(pageId, buildDecorateClearProps(), { token, fetchFn: defaultFetch });
  } catch {
    return NextResponse.json(
      { success: false, error: "装飾提案の片付けに失敗しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
