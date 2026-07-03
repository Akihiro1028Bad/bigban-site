/**
 * 構成案の修正「反映 / やり直し」API(Epic #40 / #43)。
 *
 * POST { pageId, action }:
 *   - action="apply"  : 提示中の `修正案` を `構成案` へ上書きし、修正状態をクリア(1 PATCH)。
 *   - action="discard": 構成案は触らず、修正指示・修正案・ステータスをクリア(再コメント可能へ)。
 *
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。既定ON・フェイルセーフ(未設定=ON))。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import {
  isNotionPageId,
  reviseProposalOf,
  reviseStatusOf,
  reviseTitleProposalOf,
} from "@/lib/growth/approve";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { buildReviseApplyProps, buildReviseDiscardProps } from "@/lib/growth/revise";

export const runtime = "nodejs";

type ReviseAction = "apply" | "discard";

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function conflict(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 409 });
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
  const action = (body as { action?: unknown })?.action;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (action !== "apply" && action !== "discard") {
    return badRequest("action は apply / discard のみです。");
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
    const status = reviseStatusOf(page);

    if ((action as ReviseAction) === "apply") {
      if (status !== "提示中") return conflict("反映できるのは提示中のときだけです。");
      // #139 B: 構成案・タイトルのうち提案がある方だけ反映する(部分提案を許容)。
      const proposal = reviseProposalOf(page);
      const titleProposal = reviseTitleProposalOf(page);
      if (!proposal && !titleProposal) return conflict("反映する修正案がありません。");
      await updatePageProps(
        pageId,
        buildReviseApplyProps(proposal || null, titleProposal || null),
        options
      );
    } else {
      // discard は「提示中/失敗 → なし」だけ許可。依頼中/処理中(PC作業中)は
      // 競合を避けるため拒否する(古い状態へ巻き戻さない)。
      if (status !== "提示中" && status !== "失敗") {
        return conflict("やり直せるのは提示中または失敗のときだけです。");
      }
      await updatePageProps(pageId, buildReviseDiscardProps(), options);
    }
  } catch (error) {
    // 真因はサーバログへ。Notion プロパティ欠落は 500＋プロパティ名で可視化(#177)。
    const { status, body } = growthApiError("revise/apply", error, "更新中にエラーが発生しました");
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({ success: true });
}
