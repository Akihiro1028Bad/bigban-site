/**
 * 下書きのメタディスクリプション(excerpt)保存 API(#H20)。
 *
 * POST { pageId, excerpt }: 検索スニペット用の excerpt を microCMS 下書きへ保存する。
 * - 書き込みは **content API キー**(MICROCMS_CONTENT_API_KEY)で `patchDraft`(管理キーは使わない)。
 * - excerpt は本文ミラー(#95)対象外のため Notion ミラーは更新しない(ロールバック不要)。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { draftLinkOf, isNotionPageId, mediaOf } from "@/lib/growth/approve";
import { patchDraft } from "@/lib/growth/content";
import { growthEndpoint } from "@/lib/growth/endpoint";
import { EXCERPT_HARD_MAX } from "@/lib/growth/excerptDraft";
import { defaultFetch, getPage } from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";

export const runtime = "nodejs";

const CONTENT_ID_RE = /^[a-z0-9-]+$/;

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function serverError(): Response {
  return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function microcmsOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } | null {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_CONTENT_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
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
  const excerpt = (body as { excerpt?: unknown })?.excerpt;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (typeof excerpt !== "string") return badRequest("メタディスクリプションが不正です。");
  if (excerpt.length > EXCERPT_HARD_MAX) return badRequest("メタディスクリプションが長すぎます。");

  const notionOpts = notionOptions();
  const microOpts = microcmsOptions();
  if (!notionOpts || !microOpts) return serverError();

  let contentId: string;
  let stageBlocked: Response | null = null;
  let endpoint = growthEndpoint();
  try {
    const page = await getPage(pageId, notionOpts);
    stageBlocked = articleEditGuard(page);
    contentId = draftLinkOf(page).contentId;
    endpoint = growthEndpoint(mediaOf(page));
  } catch {
    return NextResponse.json(
      { success: false, error: "保存中にエラーが発生しました" },
      { status: 502 }
    );
  }
  if (stageBlocked) return stageBlocked;
  if (!contentId || !CONTENT_ID_RE.test(contentId)) {
    return NextResponse.json(
      { success: false, error: "編集対象の下書きが見つかりません。" },
      { status: 404 }
    );
  }

  try {
    await patchDraft(endpoint, contentId, { excerpt }, microOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "メタディスクリプションの保存に失敗しました。再保存してください。" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
