/**
 * 構成案の手動編集 API(Epic #51 / #54)。
 *
 * POST { pageId, outline?, title? }: 構成案/タイトルを**直接上書き**する(AIを介さない手動修正)。
 * outline / title はどちらも任意だが、少なくとも一方は非空文字が必須(#139 A)。
 * 修正状態(修正指示/修正案/修正ステータス)は触らない。
 *
 * 競合ガード: AI処理中(依頼中/処理中/提示中)は 409(古い状態へ巻き戻さない)。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。現在オフ)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { isNotionPageId, reviseStatusOf } from "@/lib/growth/approve";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";
import {
  buildOutlineEditProps,
  buildTitleEditProps,
  REVISE_BUSY_STATUSES,
} from "@/lib/growth/revise";

export const runtime = "nodejs";

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("不正なリクエストです。");
  }
  const pageId = (body as { pageId?: unknown })?.pageId;
  const outline = (body as { outline?: unknown })?.outline;
  const title = (body as { title?: unknown })?.title;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  // #139 A: outline / title はどちらも任意。少なくとも一方が非空文字なら受け付ける(後方互換)。
  const outlineStr = typeof outline === "string" ? outline : "";
  const titleStr = typeof title === "string" ? title : "";
  const hasOutline = outlineStr.trim() !== "";
  const hasTitle = titleStr.trim() !== "";
  if (!hasOutline && !hasTitle) {
    return badRequest("構成案またはタイトルを入力してください。");
  }

  const options = notionOptions();
  if (!options) {
    return NextResponse.json(
      { success: false, error: "サーバー設定エラー" },
      { status: 500 }
    );
  }

  try {
    const page = await getPage(pageId, options);
    const blocked = articleEditGuard(page);
    if (blocked) return blocked;
    if (REVISE_BUSY_STATUSES.includes(reviseStatusOf(page))) {
      return NextResponse.json(
        { success: false, error: "この記事はAI修正処理中です。完了後に編集してください。" },
        { status: 409 }
      );
    }
    await updatePageProps(
      pageId,
      {
        ...(hasOutline ? buildOutlineEditProps(outlineStr) : {}),
        ...(hasTitle ? buildTitleEditProps(titleStr) : {}),
      },
      options
    );
  } catch (error) {
    // 真因はサーバログへ。Notion プロパティ欠落は 500＋プロパティ名で可視化(#177)。
    const { status, body } = growthApiError("revise/edit", error, "保存中にエラーが発生しました");
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({ success: true });
}
