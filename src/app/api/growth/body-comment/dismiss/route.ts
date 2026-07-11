/**
 * 本文インラインコメント依頼の「閉じる/反映後の片付け」API(#182 Phase 1)。
 *
 * POST { pageId }: 本文コメントの指示・案・ステータスをクリアして「なし」に戻す(本文は触らない)。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。強権キーは使わない。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { isNotionPageId } from "@/lib/growth/approve";
import { buildBodyCommentClearProps } from "@/lib/growth/bodyComment";
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
    await updatePageProps(pageId, buildBodyCommentClearProps(), { token, fetchFn: defaultFetch });
  } catch (error) {
    const { status, body: errBody } = growthApiError(
      "body-comment/dismiss",
      error,
      "片付けに失敗しました"
    );
    return NextResponse.json(errBody, { status });
  }

  return NextResponse.json({ success: true });
}
