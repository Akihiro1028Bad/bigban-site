/**
 * アドバイス採用→反映の「片付け」API(#165)。
 *
 * POST { pageId }: 反映の依頼・案・ステータスをクリアして「なし」に戻すだけ(本文・下書きには
 * 触らない)。反映後の後片付け、または提示中/失敗を閉じるのに使う。冪等(既に「なし」でも安全)。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。強権キーは使わない。
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { buildApplyClearProps } from "@/lib/growth/adviseApply";
import { isNotionPageId } from "@/lib/growth/approve";
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
    await updatePageProps(pageId, buildApplyClearProps(), { token, fetchFn: defaultFetch });
  } catch {
    return NextResponse.json(
      { success: false, error: "反映の片付けに失敗しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
