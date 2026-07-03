/**
 * 記事スタイリング・アドバイスの「閉じる」API(Epic #146)。
 *
 * POST { pageId }: 表示中(提示中/失敗)のアドバイスを片付ける。指示・結果・ステータスを
 * クリアして「なし」に戻すだけ(本文・下書きには触らない・read-only 境界)。構成案修正ループの
 * 「破棄(discard)」と同型。冪等(既に「なし」でも安全)。強権キーは使わない。
 *
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。既定ON・フェイルセーフ(未設定=ON))。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { buildAdviceClearProps } from "@/lib/growth/advise";
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
    await updatePageProps(pageId, buildAdviceClearProps(), { token, fetchFn: defaultFetch });
  } catch {
    return NextResponse.json(
      { success: false, error: "アドバイスの片付けに失敗しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
