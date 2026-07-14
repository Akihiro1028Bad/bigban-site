/**
 * 「構成からやり直す」API(下書き作成済み → 提案中に戻す)。
 *
 * POST { pageId }: 記事を提案中へ戻し、Notion の下書きリンクと前回生成物を空にする。
 * 用途は構成案・タイトルのやり直し。戻して直して再承認すると、下書きモードが冪等PUTで下書きを作り直す。
 *
 * - microCMS には一切触らない(Notion 書き込みのみ)。本文HTML・アイキャッチ・根拠台帳のミラーはクリアする。
 * - 段階ガード(#H9): 生成中・公開済みからは戻せない(409)。UI でボタンを隠すのに加えた多層防御。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { buildRevertProps, draftLinkOf, isNotionPageId } from "@/lib/growth/approve";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { SOURCE_LEDGER_PROP } from "@/lib/growth/sourceLedger";
import { articleEditGuard } from "@/lib/growth/stageGuard";

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
    await updatePageProps(
      pageId,
      buildRevertProps({
        hasSourceLedger: SOURCE_LEDGER_PROP in page.properties,
        sourceContentId: draftLinkOf(page).contentId,
      }),
      options
    );
  } catch (error) {
    const { status, body } = growthApiError("approve/revert", error, "更新中にエラーが発生しました");
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({ success: true });
}
