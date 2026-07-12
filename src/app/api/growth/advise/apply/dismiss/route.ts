/**
 * アドバイス採用→反映の「片付け」API(#165)。
 *
 * POST { pageId }: 反映の依頼・案・ステータスをクリアして「なし」に戻すだけ(本文・下書きには
 * 触らない)。反映後の後片付け、または提示中/失敗を閉じるのに使う。冪等(既に「なし」でも安全)。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。強権キーは使わない。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { buildApplyClearProps } from "@/lib/growth/adviseApply";
import { isNotionPageId } from "@/lib/growth/approve";
import { defaultFetch, updatePageProps } from "@/lib/growth/notion";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

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
