/**
 * グロース施策の承認/却下 API。
 *
 * GET  : 承認待ち(施策提案=未処理 / 記事ネタ案=提案中)を一覧で返す。
 * POST : decisions[] を受け取り、各ページの「ステータス」を承認/却下に更新する。
 *
 * 認証は APPROVE_SECRET とクエリ token の定数時間比較(draft/enable と同方式)。
 * Notion 更新には内部インテグレーションの NOTION_TOKEN が必要。
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { DRAFT_READY_STATUS, parseDecisions, toPendingItems } from "@/lib/growth/approve";
import { defaultFetch, queryDataSource, updatePageSelect } from "@/lib/growth/notion";

export const runtime = "nodejs";

const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460"; // 施策提案
const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const STATUS_PROP = "ステータス";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function unauthorized(): Response {
  return NextResponse.json({ success: false, error: "認証に失敗しました" }, { status: 401 });
}

function serverError(): Response {
  return NextResponse.json(
    { success: false, error: "サーバー設定エラー" },
    { status: 500 }
  );
}

function verifyToken(url: URL): boolean {
  // 合言葉認証が無効(一時措置)のときは token 検証をスキップする。
  if (!APPROVE_AUTH_ENABLED) return true;
  const token = url.searchParams.get("token") ?? "";
  const expected = process.env.APPROVE_SECRET ?? "";
  return Boolean(expected) && safeEqual(token, expected);
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function statusFilter(value: string): unknown {
  return { property: STATUS_PROP, select: { equals: value } };
}

// #87: 記事は「提案中」に加え「下書き作成済み」も取得する(承認後に下書きを
// プレビュー/編集できるよう、承認画面の下書きタブへ流す)。
function ideaStatusFilter(): unknown {
  return { or: [statusFilter("提案中"), statusFilter(DRAFT_READY_STATUS)] };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(url)) return unauthorized();

  const options = notionOptions();
  if (!options) return serverError();

  const proposals = await queryDataSource(
    PROPOSAL_DS,
    { filter: statusFilter("未処理"), pageSize: 100 },
    options
  );
  const ideas = await queryDataSource(
    IDEA_DS,
    { filter: ideaStatusFilter(), pageSize: 100 },
    options
  );

  return NextResponse.json({
    success: true,
    items: toPendingItems(proposals.pages, ideas.pages),
  });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(url)) return unauthorized();

  const options = notionOptions();
  if (!options) return serverError();

  let decisions;
  try {
    decisions = parseDecisions(await request.json());
  } catch (error) {
    /* istanbul ignore next -- @preserve throw 元は常に Error(JSON parse / parseDecisions) */
    const message = error instanceof Error ? error.message : "不正なリクエストです。";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  try {
    for (const decision of decisions) {
      await updatePageSelect(decision.id, STATUS_PROP, decision.decision, options);
    }
  } catch {
    // Notion 側のエラー詳細はクライアントに返さない(情報漏えい防止)
    return NextResponse.json(
      { success: false, error: "更新中にエラーが発生しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, updated: decisions.length });
}
