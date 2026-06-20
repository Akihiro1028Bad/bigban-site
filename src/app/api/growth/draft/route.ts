/**
 * 下書きプレビュー取得 API(Epic #72 / #74)。
 *
 * GET ?pageId=<NotionページID>: Notion 行に保存された contentId+draftKey(#73)から
 * microCMS 下書きを取得し、承認画面の詳細パネルがプレビュー描画するための本文を返す。
 *
 * - 下書き未作成(contentId 無し)→ exists:false(エラーにしない)
 * - microCMS 取得失敗 → 502(沈黙させない)
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。現在オフ)
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { draftLinkOf, isNotionPageId } from "@/lib/growth/approve";
import { defaultFetch, getPage } from "@/lib/growth/notion";
import { getNewsByContentId } from "@/lib/microcms/queries";

export const runtime = "nodejs";

// microCMS contentId の許可文字(slugToContentId と同じ)。Notion 由来の値を
// そのまま URL パスに載せる前に検証し、パス分離(`/`)等の不正値を弾く(防御的)。
const CONTENT_ID_RE = /^[a-z0-9-]+$/;

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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(url)) return unauthorized();

  const pageId = url.searchParams.get("pageId");
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");

  const options = notionOptions();
  if (!options) {
    return NextResponse.json(
      { success: false, error: "サーバー設定エラー" },
      { status: 500 }
    );
  }

  try {
    const page = await getPage(pageId, options);
    const { contentId, draftKey } = draftLinkOf(page);
    if (!contentId) {
      // まだ下書きが作成されていない(下書きモード未実行)。
      return NextResponse.json({ success: true, exists: false, draft: null });
    }
    if (!CONTENT_ID_RE.test(contentId)) {
      // Notion 側の値が壊れている等。不正値を microCMS の URL に載せない。
      return NextResponse.json(
        { success: false, error: "下書きの取得に失敗しました" },
        { status: 502 }
      );
    }
    const news = await getNewsByContentId({
      id: contentId,
      draftKey: draftKey || undefined,
    });
    if (!news) {
      return NextResponse.json(
        { success: false, error: "下書きの取得に失敗しました" },
        { status: 502 }
      );
    }
    // displayMode/bodyHtml/body は NewsBodyRenderer(#75)がそのまま使う最小セット
    // (html モードは bodyHtml、空なら body へフォールバックするため body も渡す)。
    return NextResponse.json({
      success: true,
      exists: true,
      draft: {
        title: news.title,
        displayMode: news.displayMode,
        bodyHtml: news.bodyHtml,
        body: news.body,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "取得中にエラーが発生しました" },
      { status: 502 }
    );
  }
}
