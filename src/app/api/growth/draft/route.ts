/**
 * 下書きプレビュー取得 API(Epic #72 / #74 / #95)。
 *
 * GET ?pageId=<NotionページID>: Notion 行に保存された本文HTMLミラー(#95 `下書き本文HTML`)
 * を読み、承認画面の詳細パネルがプレビュー描画するための本文を返す。
 *
 * #95: 無料プラン=APIキー1本・公開キーの下書き取得オフ方針のため、microCMS の下書きは
 * 読まず、publish-draft が Notion に保存した本文ミラーを NOTION_TOKEN で読む。
 *
 * - ミラー未保存(本文HTML 無し)→ exists:false(エラーにしない)
 * - Notion 取得失敗 → 502(沈黙させない)
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。現在オフ)
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import {
  draftBodyOf,
  eyecatchUrlOf,
  ideaTitleOf,
  isNotionPageId,
} from "@/lib/growth/approve";
import { defaultFetch, getPage } from "@/lib/growth/notion";

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
    const bodyHtml = draftBodyOf(page);
    if (!bodyHtml) {
      // まだ本文ミラーが保存されていない(下書きモード未実行 / 旧記事)。
      return NextResponse.json({ success: true, exists: false, draft: null });
    }
    // #95: 本文ミラーは常に html モード。NewsBodyRenderer(#75)が bodyHtml をそのまま使う。
    return NextResponse.json({
      success: true,
      exists: true,
      draft: {
        title: ideaTitleOf(page),
        displayMode: "html",
        bodyHtml,
        body: "",
        // #141: アイキャッチURLミラー(未設定は空文字)。プレビューが画像表示に使う。
        eyecatch: eyecatchUrlOf(page),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "取得中にエラーが発生しました" },
      { status: 502 }
    );
  }
}
