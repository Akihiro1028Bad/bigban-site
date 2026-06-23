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

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { isNotionPageId, reviseStatusOf } from "@/lib/growth/approve";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import {
  buildOutlineEditProps,
  buildTitleEditProps,
  REVISE_BUSY_STATUSES,
} from "@/lib/growth/revise";

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

function unauthorized(): Response {
  return NextResponse.json({ success: false, error: "認証に失敗しました" }, { status: 401 });
}

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(url)) return unauthorized();

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
  } catch {
    return NextResponse.json(
      { success: false, error: "保存中にエラーが発生しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
