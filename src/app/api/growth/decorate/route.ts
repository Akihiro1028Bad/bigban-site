/**
 * 記事装飾の提案依頼 API(Epic #147)。
 *
 * POST { pageId, instruction? }: 記事の下書きを AI に見てもらい、装飾の提案リストを作る依頼を
 * Notion に記録する(`装飾指示`＋`...ステータス=依頼中`＋`...依頼時刻=stamp`)。常時稼働 PC の
 * decorate ループが `依頼中` を拾って下書き本文ミラーを読み、箇所ごとの提案を書き戻す(プル型)。
 * 反映(採用)は別途、決定的な applyDecoration＋既存 /api/growth/draft/edit が担う(本ルートは依頼のみ)。
 *
 * 暴走防止: 既に 依頼中/処理中/提示中 の行は 409。下書き未作成(contentId 無し)は 400。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。既定ON・フェイルセーフ(未設定=ON))。強権キーは使わない。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { isNotionPageId } from "@/lib/growth/approve";
import {
  DECORATE_BUSY_STATUSES,
  buildDecorateRequestProps,
  decorateRowFromPage,
} from "@/lib/growth/decorate";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";

export const runtime = "nodejs";

/** 補足指示(自由文)の上限長。濫用・巨大ペイロード防止。 */
const MAX_INSTRUCTION_LEN = 500;

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
  const rawInstruction = (body as { instruction?: unknown })?.instruction;
  const instruction = typeof rawInstruction === "string" ? rawInstruction.trim() : "";
  if (instruction.length > MAX_INSTRUCTION_LEN) {
    return badRequest(`指示は${MAX_INSTRUCTION_LEN}文字以内にしてください。`);
  }

  const options = notionOptions();
  if (!options) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const page = await getPage(pageId, options);
    const blocked = articleEditGuard(page);
    if (blocked) return blocked;
    const row = decorateRowFromPage(page);
    if (!row.contentId) {
      return badRequest("下書きがまだありません。下書き作成後に提案を依頼できます。");
    }
    if (DECORATE_BUSY_STATUSES.includes(row.status)) {
      return NextResponse.json(
        { success: false, error: "この記事は既に装飾提案を処理中/提示中です。" },
        { status: 409 }
      );
    }
    await updatePageProps(
      pageId,
      buildDecorateRequestProps(instruction, new Date().toISOString()),
      options
    );
  } catch (error) {
    // 真因はサーバログへ。Notion プロパティ欠落は 500＋プロパティ名で可視化(#177)。
    const { status, body } = growthApiError("decorate", error, "装飾提案の依頼登録に失敗しました");
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({ success: true });
}
