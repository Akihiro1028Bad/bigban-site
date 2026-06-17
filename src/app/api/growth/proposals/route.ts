/**
 * 承認画面からの施策の手動追加 API(#255)。
 *
 * POST : 施策入力を検証し、Notion「施策提案」DB に ステータス=未処理(承認待ち)で
 *        ページを作成する。作成した表示用アイテムを返し、承認一覧に差し込む。
 *
 * 認証は承認 API と同じ APPROVE_SECRET とクエリ token の定数時間比較。
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  parseProposalInput,
  proposalProperties,
  proposalToItem,
} from "@/lib/growth/proposals";
import { createPage, defaultFetch } from "@/lib/growth/notion";

export const runtime = "nodejs";

const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460"; // 施策提案

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function unauthorized(): Response {
  return NextResponse.json({ success: false, error: "認証に失敗しました" }, { status: 401 });
}

function serverError(): Response {
  return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
}

function verifyToken(url: URL): boolean {
  const token = url.searchParams.get("token") ?? "";
  const expected = process.env.APPROVE_SECRET ?? "";
  return Boolean(expected) && safeEqual(token, expected);
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(url)) return unauthorized();

  const options = notionOptions();
  if (!options) return serverError();

  let input;
  try {
    input = parseProposalInput(await request.json());
  } catch (error) {
    /* istanbul ignore next -- @preserve throw 元は常に Error(JSON parse / parseProposalInput) */
    const message = error instanceof Error ? error.message : "不正なリクエストです。";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  let id: string;
  try {
    id = await createPage(PROPOSAL_DS, proposalProperties(input), options);
  } catch {
    // Notion 側のエラー詳細はクライアントに返さない(情報漏えい防止)
    return NextResponse.json(
      { success: false, error: "作成中にエラーが発生しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, item: proposalToItem(id, input) });
}
