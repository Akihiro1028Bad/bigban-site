/**
 * スタイリング・アドバイスの「採用 → 本文反映」依頼 API(#165)。
 *
 * POST { pageId, adoptedIndexes: number[] }: 承認画面で採用された fix(index)を受け取り、
 * **サーバ側で実際の採用候補(quote 必須・反映可能カテゴリ・一意アンカー)と照合**してから
 * Notion に反映依頼を記録する(`アドバイス反映指示`＋`...ステータス=依頼中`＋`...依頼時刻`)。
 * 常時稼働 PC の advise-apply ループが拾って該当 passage を書き換え、before/after 案を提示する。
 * 反映(保存)は別途、決定的な applyAdviceItems＋既存 /api/growth/draft/edit が担う(本ルートは依頼のみ)。
 *
 * 暴走防止: 既に 依頼中/処理中/提示中 の行は 409。アドバイス未提示は 400。採用が空/不適格も 400。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。強権キーは使わない。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { adviceViewOf } from "@/lib/growth/advise";
import { draftBodyOf, isNotionPageId } from "@/lib/growth/approve";
import {
  ADVISE_APPLY_BUSY_STATUSES,
  applyStatusOf,
  buildApplyRequestProps,
  selectApplicableFixes,
} from "@/lib/growth/adviseApply";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";

export const runtime = "nodejs";

/** 一度に採用できる fix の上限(濫用・巨大ペイロード防止)。 */
const MAX_ADOPTED = 20;

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

/** body から採用 index 配列を取り出す(整数・0以上・上限内のみ)。 */
function parseAdoptedIndexes(body: unknown): number[] | null {
  const raw = (body as { adoptedIndexes?: unknown })?.adoptedIndexes;
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null;
    out.push(v);
  }
  if (out.length === 0 || out.length > MAX_ADOPTED) return null;
  return out;
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
  const adoptedIndexes = parseAdoptedIndexes(body);
  if (!adoptedIndexes) return badRequest("採用する修正案を選んでください。");

  const options = notionOptions();
  if (!options) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const page = await getPage(pageId, options);
    if (ADVISE_APPLY_BUSY_STATUSES.includes(applyStatusOf(page))) {
      return NextResponse.json(
        { success: false, error: "この記事は既に反映を処理中/提示中です。" },
        { status: 409 }
      );
    }
    const advice = adviceViewOf(page).advice;
    if (!advice) {
      return badRequest("先にスタイリング・アドバイスを取得してください。");
    }
    // サーバ側で採用候補(quote 必須・反映可能カテゴリ・一意アンカー)を再導出し、採用 index と突き合わせる。
    const applicable = selectApplicableFixes(advice.fixes, draftBodyOf(page));
    const adopted = applicable.filter((f) => adoptedIndexes.includes(f.index));
    if (adopted.length === 0) {
      return badRequest("反映できる採用がありません(quote 必須・文体/読みやすさ/構成のみ)。");
    }
    await updatePageProps(pageId, buildApplyRequestProps(adopted, new Date().toISOString()), options);
  } catch (error) {
    // 真因はサーバログへ。Notion プロパティ欠落は 500＋プロパティ名で可視化(#177)。
    const { status, body } = growthApiError("advise/apply", error, "反映依頼の登録に失敗しました");
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({ success: true });
}
