/**
 * 構成案の修正依頼 API(Epic #40 / #42)。
 *
 * POST : 記事ネタ案の構成案に対する行コメント(修正指示)を受け取り、Notion に
 *        `修正指示`＋`修正ステータス=依頼中`＋`修正依頼時刻=now` を 1 PATCH で書き込む。
 *        常時稼働PCの poller が `依頼中` を拾って修正する(プル型)。
 *
 * 暴走防止: 既に 依頼中/処理中/提示中 の行は 409(再依頼拒否)。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。現在オフ)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { isNotionPageId, reviseStatusOf } from "@/lib/growth/approve";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";
import {
  buildReviseRequestProps,
  REVISE_BUSY_STATUSES,
  serializeReviseInstructions,
} from "@/lib/growth/revise";

export const runtime = "nodejs";

/** タイトルへの修正指示(自由文)の上限長。濫用・巨大ペイロード防止(#139 B)。 */
const MAX_TITLE_INSTRUCTION_LEN = 500;

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

  // #139 B: 構成案コメント・タイトル指示は片方だけでも可。少なくとも一方が非空なら受け付ける。
  const rawComments = (body as { comments?: unknown }).comments;
  const hasComments = Array.isArray(rawComments) && rawComments.length > 0;
  const rawTitleInstruction = (body as { titleInstruction?: unknown }).titleInstruction;
  const titleInstruction =
    typeof rawTitleInstruction === "string" ? rawTitleInstruction.trim() : "";
  // 上限長: 自由文の濫用(巨大ペイロードによる Notion API 浪費)を防ぐ。
  if (titleInstruction.length > MAX_TITLE_INSTRUCTION_LEN) {
    return badRequest(`タイトルへの指示は${MAX_TITLE_INSTRUCTION_LEN}文字以内にしてください。`);
  }

  let instructionsJson: string | null = null;
  if (hasComments) {
    try {
      instructionsJson = serializeReviseInstructions(rawComments);
    } catch (error) {
      /* istanbul ignore next -- @preserve throw 元は常に Error(serializeReviseInstructions) */
      const message = error instanceof Error ? error.message : "不正なコメントです。";
      return badRequest(message);
    }
  }
  if (!instructionsJson && !titleInstruction) {
    return badRequest("構成案コメントまたはタイトルへの指示を入力してください。");
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
        { success: false, error: "この記事は修正処理中です。完了までお待ちください。" },
        { status: 409 }
      );
    }
    await updatePageProps(
      pageId,
      buildReviseRequestProps(
        instructionsJson,
        titleInstruction || null,
        new Date().toISOString()
      ),
      options
    );
  } catch (error) {
    // Notion 側のエラー詳細はクライアントに返さない(情報漏えい防止)。真因はサーバログへ(#177)。
    const { status, body } = growthApiError("revise", error, "修正依頼の登録に失敗しました");
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({ success: true });
}
