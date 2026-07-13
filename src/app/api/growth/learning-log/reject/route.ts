/**
 * 学習ログ「不採用」記録 API。
 *
 * 承認画面で反映しなかった AI 修正案を、記事保存とは独立して追記する。
 * 学習ログはベストエフォートで、記録失敗はクライアントの操作結果を変えない。
 */

import { after, NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { ideaTitleOf, isNotionPageId } from "@/lib/growth/approve";
import {
  AdoptedFixDetailSchema,
  appendLearningLog,
  formatAdoptedFixSummary,
  type AdoptedFixDetail,
} from "@/lib/growth/learningLog";
import { createPage, defaultFetch, getPage } from "@/lib/growth/notion";

export const runtime = "nodejs";

const MAX_REJECTED_FIXES = 20;
const MAX_SOURCE_LENGTH = 64;
const RejectedFixesSchema = AdoptedFixDetailSchema.array().min(1).max(MAX_REJECTED_FIXES);

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
  const source = (body as { source?: unknown })?.source;
  const rejectedFixesResult = RejectedFixesSchema.safeParse(
    (body as { rejectedFixes?: unknown })?.rejectedFixes
  );
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (typeof source !== "string" || source.length > MAX_SOURCE_LENGTH) {
    return badRequest("不正な source です。");
  }
  if (!rejectedFixesResult.success) return badRequest("不正な rejectedFixes です。");

  const learningLogDs = process.env.GROWTH_LEARNING_LOG_DS;
  if (!learningLogDs) return NextResponse.json({ success: true, skipped: true });

  const notionOpts = notionOptions();
  if (!notionOpts) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  let title: string;
  try {
    title = ideaTitleOf(await getPage(pageId, notionOpts));
  } catch {
    return NextResponse.json(
      { success: false, error: "対象の記事が見つかりません。" },
      { status: 404 }
    );
  }

  const rejectedFixes: AdoptedFixDetail[] = rejectedFixesResult.data;
  after(async () => {
    for (const fix of rejectedFixes) {
      const outcome = await appendLearningLog(
        {
          kind: "不採用",
          pageId,
          title,
          aspect: fix.aspect,
          before: fix.before,
          after: fix.after,
        },
        {
          dataSourceId: learningLogDs,
          notionOptions: notionOpts,
          createPageFn: createPage,
          nowIso: new Date().toISOString(),
          diffSummary: `不採用(${source})\n${formatAdoptedFixSummary(fix)}`,
        }
      );
      if (outcome.status === "failed") {
        console.error("learning-log append failed (reject)", outcome.error);
      }
    }
  });

  return NextResponse.json({ success: true });
}
