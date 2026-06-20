/**
 * 下書き本文の保存 API(Epic #72 / #76)。
 *
 * POST { pageId, bodyHtml }: リッチエディタ(#77)で編集した本文を microCMS 下書きへ保存する。
 * **サーバ側で必ず再サニタイズ**(STRICT_HTML_CONFIG)してから書き込む(XSS 防御の最終段)。
 *
 * - 書き込みは **content API キー**(MICROCMS_CONTENT_API_KEY)で `patchDraft`(管理キーは使わない)。
 * - status=draft の PATCH のみ。公開はしない。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。現在オフ)。
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { draftLinkOf, isNotionPageId } from "@/lib/growth/approve";
import { patchDraft } from "@/lib/growth/content";
import { defaultFetch, getPage } from "@/lib/growth/notion";
import { sanitizeNewsHtml, STRICT_HTML_CONFIG } from "@/lib/news/sanitize";

export const runtime = "nodejs";

const ENDPOINT = "news";
// microCMS contentId の許可文字(slugToContentId と同じ)。不正値を URL パスに載せない。
const CONTENT_ID_RE = /^[a-z0-9-]+$/;
// 本文HTMLの上限(記事本文として十分・過大入力を境界で弾く)。
const MAX_BODY_HTML = 500_000;

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
  // 書き込みは content API キーのみ(管理キーは使わない=#76)。
  const apiKey = process.env.MICROCMS_CONTENT_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
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
  const bodyHtml = (body as { bodyHtml?: unknown })?.bodyHtml;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (typeof bodyHtml !== "string" || bodyHtml.trim() === "") {
    return badRequest("本文が空です。");
  }
  if (bodyHtml.length > MAX_BODY_HTML) {
    return badRequest("本文が大きすぎます。");
  }

  const notionOpts = notionOptions();
  const microOpts = microcmsOptions();
  if (!notionOpts || !microOpts) return serverError();

  try {
    const page = await getPage(pageId, notionOpts);
    const { contentId } = draftLinkOf(page);
    if (!contentId || !CONTENT_ID_RE.test(contentId)) {
      return NextResponse.json(
        { success: false, error: "編集対象の下書きが見つかりません。" },
        { status: 404 }
      );
    }
    // サーバ側で再サニタイズ(許可外タグ/属性を除去)してから書き込む。
    const sanitized = sanitizeNewsHtml(bodyHtml, STRICT_HTML_CONFIG);
    await patchDraft(ENDPOINT, contentId, { bodyHtml: sanitized }, microOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "保存中にエラーが発生しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
