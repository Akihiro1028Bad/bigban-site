/**
 * グロース施策の承認/却下 API。
 *
 * GET  : 承認待ち(施策提案=未処理 / 記事ネタ案=提案中)を一覧で返す。
 * POST : decisions[] を受け取り、各ページの「ステータス」を承認/却下に更新する。
 *
 * 認証は APPROVE_SECRET とクエリ token の定数時間比較(draft/enable と同方式)。
 * Notion 更新には内部インテグレーションの NOTION_TOKEN が必要。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { DRAFT_READY_STATUS, parseDecisions, toPendingItems } from "@/lib/growth/approve";
import { defaultFetch, getPage, queryDataSource, updatePageSelect } from "@/lib/growth/notion";
import type { NotionPage } from "@/lib/growth/notion";

export const runtime = "nodejs";

const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460"; // 施策提案
const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const STATUS_PROP = "ステータス";

function serverError(): Response {
  return NextResponse.json(
    { success: false, error: "サーバー設定エラー" },
    { status: 500 }
  );
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function statusFilter(value: string): unknown {
  return { property: STATUS_PROP, select: { equals: value } };
}

// #106/#167: パイプライン盤のため、記事は全段階(提案中/承認=生成待ち/生成中/下書き作成済み/公開済み)を
// 横断取得する。却下・クローズはアーカイブ扱いで除外(盤から非表示)。公開済みは成否確認のため盤に残す。
function ideaStatusFilter(): unknown {
  return {
    or: [
      statusFilter("提案中"),
      statusFilter("承認"),
      statusFilter("生成中"),
      statusFilter(DRAFT_READY_STATUS),
      statusFilter("公開済み"),
    ],
  };
}

// #106: 施策も未処理に加え承認を取得し、盤の施策レーンで段階表示できるようにする。
// 成果物化済も残し、growth:initiatives 実行後に成果物リンクを確認できるようにする。
function proposalStatusFilter(): unknown {
  return { or: [statusFilter("未処理"), statusFilter("承認"), statusFilter("成果物化済")] };
}

function currentStatus(page: NotionPage): string {
  const property = page.properties[STATUS_PROP] as
    | { select?: { name?: string } | null }
    | undefined;
  return property?.select?.name ?? "";
}

function isAllowedTransition(page: NotionPage, next: string): boolean {
  const current = currentStatus(page);
  if ("タイトル案" in page.properties) {
    if (current === "提案中") return next === "承認" || next === "却下";
    if (current === "承認" || current === "却下") return next === "提案中";
    return false;
  }
  if ("施策名" in page.properties) {
    if (current === "未処理") return next === "承認" || next === "却下";
    if (current === "承認" || current === "却下") return next === "未処理";
    if (current === "成果物化済") return next === "クローズ";
  }
  return false;
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  const options = notionOptions();
  if (!options) return serverError();

  try {
    const proposals = await queryDataSource(
      PROPOSAL_DS,
      { filter: proposalStatusFilter(), pageSize: 100 },
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
  } catch {
    // Notion 側のエラー詳細はクライアントに返さない(情報漏えい防止)。
    // 本文ゼロの 500 を返すと client の res.json() が壊れるため、必ず JSON で返す。
    return NextResponse.json(
      { success: false, error: "取得中にエラーが発生しました" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

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
    const pages = await Promise.all(decisions.map((decision) => getPage(decision.id, options)));
    const invalid = decisions.find((decision, index) => !isAllowedTransition(pages[index], decision.decision));
    if (invalid) {
      return NextResponse.json(
        { success: false, error: "現在の処理段階ではこのステータスへ変更できません。画面を更新してください。" },
        { status: 409 }
      );
    }
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
