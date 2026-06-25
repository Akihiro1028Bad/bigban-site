/**
 * 本文インラインコメントの「AIに指摘を依頼」API(#182 Phase 1)。
 *
 * POST { pageId, comments: {blockIndex, excerpt, comment}[] }:
 *   承認画面のレビューUIで本文の各文に付けたコメントを受け取り、**サーバ側で excerpt の一意アンカーを
 *   再検証**してから Notion に依頼として記録する(`本文コメント指示`＋`...ステータス=依頼中`＋`...依頼時刻`)。
 *   常時稼働 PC の comment-revise ループ(Phase 2)が拾って該当文の before/after 案を提示する。
 *
 * 暴走防止: 既に 依頼中/処理中/提示中 の行は 409。アンカーできるコメントが 0 件なら 400。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。強権キーは使わない(書き込み先は Notion のみ)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { draftBodyOf, isNotionPageId } from "@/lib/growth/approve";
import {
  BODY_COMMENT_BUSY_STATUSES,
  BodyCommentsSchema,
  bodyCommentStatusOf,
  buildBodyCommentRequestProps,
  selectAnchoredComments,
} from "@/lib/growth/bodyComment";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";

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
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  const parsed = BodyCommentsSchema.safeParse((body as { comments?: unknown })?.comments);
  if (!parsed.success) return badRequest("コメントを入力してください。");

  const options = notionOptions();
  if (!options) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const page = await getPage(pageId, options);
    if (BODY_COMMENT_BUSY_STATUSES.includes(bodyCommentStatusOf(page))) {
      return NextResponse.json(
        { success: false, error: "この記事は既にコメントを処理中/提示中です。" },
        { status: 409 }
      );
    }
    // サーバ側で本文(下書きミラー)に対し excerpt の一意アンカーを再検証する(誤った箇所への適用を防ぐ)。
    const anchored = selectAnchoredComments(parsed.data, draftBodyOf(page));
    if (anchored.length === 0) {
      return badRequest("本文に一致するコメントがありません（本文が変わった可能性・要確認）。");
    }
    await updatePageProps(
      pageId,
      buildBodyCommentRequestProps(anchored, new Date().toISOString()),
      options
    );
  } catch (error) {
    const { status, body: errBody } = growthApiError(
      "body-comment",
      error,
      "コメント依頼の登録に失敗しました"
    );
    return NextResponse.json(errBody, { status });
  }

  return NextResponse.json({ success: true });
}
