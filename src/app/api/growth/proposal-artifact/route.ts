/**
 * 施策成果物プレビュー API。
 *
 * GET ?pageId=<NotionページID>: 成果物化された施策ページの本文ブロックを Notion から読み、
 * 承認画面の詳細パネルで表示できる安全なテキスト配列へ落とす。read-only。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { isNotionPageId } from "@/lib/growth/approve";
import { defaultFetch, listBlockChildren } from "@/lib/growth/notion";

export const runtime = "nodejs";

const SUPPORTED_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "quote",
  "callout",
  "to_do",
  "code",
]);

interface ProposalArtifactBlock {
  id: string;
  type: string;
  text: string;
}

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function plainTextFromRichText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const record = asRecord(item);
      const plainText = record?.plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("")
    .trim();
}

function blockText(block: Record<string, unknown>): string {
  const type = block.type;
  if (typeof type !== "string") return "";
  const body = asRecord(block[type]);
  return plainTextFromRichText(body?.rich_text);
}

function previewBlockOf(block: unknown): ProposalArtifactBlock | null {
  const record = asRecord(block);
  if (!record) return null;
  const id = record.id;
  const type = record.type;
  if (typeof id !== "string" || typeof type !== "string" || !SUPPORTED_TYPES.has(type)) return null;
  const text = blockText(record);
  if (!text) return null;
  return { id, type, text };
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  const url = new URL(request.url);
  const pageId = url.searchParams.get("pageId");
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");

  const options = notionOptions();
  if (!options) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const result = await listBlockChildren(pageId, options, { pageSize: 80 });
    const blocks = result.blocks.map(previewBlockOf).filter((block): block is ProposalArtifactBlock => block !== null);
    return NextResponse.json({ success: true, blocks, hasMore: result.hasMore });
  } catch {
    return NextResponse.json({ success: false, error: "成果物の取得に失敗しました" }, { status: 502 });
  }
}
