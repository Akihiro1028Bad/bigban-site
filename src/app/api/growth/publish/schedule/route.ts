/**
 * 予約公開の予約/解除 API(#H24)。
 *
 * POST { pageId, scheduledAt: string|null }:
 *   - scheduledAt(未来の ISO 文字列): Notion `公開予約時刻` に書く(=予約。公開はまだしない)。
 *   - null: 予約を解除する。
 *
 * microCMS は書き込み API で予約公開を持たないため、予約はプル型で実現する:
 * ここは Notion に時刻を書くだけ。実際の公開は常時稼働 PC の `growth:publish-due`
 * が到来分を `publishContent`(管理キー)で行う。よってこの API は強権キー不要。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { articleStageOf, isNotionPageId } from "@/lib/growth/approve";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { buildScheduleProps } from "@/lib/growth/publishQueue";
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

/** scheduledAt を検証して正規化(未来の ISO)。null は予約解除。不正は文字列のエラーを返す。 */
function parseScheduledAt(value: unknown, nowMs: number): { iso: string | null } | { error: string } {
  if (value === null) return { iso: null };
  if (typeof value !== "string") return { error: "scheduledAt は ISO 文字列または null です。" };
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return { error: "予約時刻の形式が不正です。" };
  if (ms <= nowMs) return { error: "予約時刻は未来の時刻にしてください。" };
  return { iso: new Date(ms).toISOString() };
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("リクエストボディが不正です。");
  }

  const pageId = (body as { pageId?: unknown })?.pageId;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");

  const parsed = parseScheduledAt((body as { scheduledAt?: unknown })?.scheduledAt, Date.now());
  if ("error" in parsed) return badRequest(parsed.error);

  const options = notionOptions();
  if (!options) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const page = await getPage(pageId, options);
    const blocked = articleEditGuard(page);
    if (blocked) return blocked;
    if (articleStageOf(page) !== "drafted") {
      return badRequest("下書きがまだありません。下書き作成後に予約できます。");
    }
    await updatePageProps(pageId, buildScheduleProps(parsed.iso), options);
  } catch (error) {
    const { status, body: errorBody } = growthApiError(
      "publish/schedule",
      error,
      "予約の保存中にエラーが発生しました"
    );
    return NextResponse.json(errorBody, { status });
  }

  return NextResponse.json({ success: true });
}
