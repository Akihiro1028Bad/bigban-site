/**
 * 本文画像 AI 再生成の依頼 API(Epic #140 / #156)。
 *
 * POST { pageId, targetSrc, instruction? }: 記事の下書き本文の **特定の画像**(targetSrc)を
 * AI で作り直すリクエストを Notion に記録する(`本文画像再生成指示`＋`...対象=targetSrc`＋
 * `...ステータス=依頼中`＋`...依頼時刻=stamp`)。常時稼働 PC の画像ループが `依頼中` を拾って
 * 生成 → upload → 本文HTMLの当該 `<img src>` を差し替え → patchDraft する(プル型・#144 と同方式)。
 *
 * 対象画像は **その時点の microCMS アセットURL**(targetSrc)で指定する(インデックスは本文編集で
 * 並びが変わると壊れるため)。暴走防止: 既に 依頼中/処理中 の行は 409。下書き未作成は 400。
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。現在オフ)。
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { isNotionPageId } from "@/lib/growth/approve";
import {
  BODY_REGEN_BUSY_STATUSES,
  buildBodyRegenRequestProps,
  bodyRegenRowFromPage,
} from "@/lib/growth/bodyImageRegen";
import { isMicrocmsAssetUrl } from "@/lib/growth/media";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";

export const runtime = "nodejs";

/** 再生成指示(自由文)の上限長。濫用・巨大ペイロード防止。 */
const MAX_INSTRUCTION_LEN = 500;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifyToken(url: URL): boolean {
  if (!APPROVE_AUTH_ENABLED) return true;
  const token = url.searchParams.get("token") ?? "";
  const expected = process.env.APPROVE_SECRET ?? "";
  return Boolean(expected) && safeEqual(token, expected);
}

function unauthorized(): Response {
  return NextResponse.json({ success: false, error: "認証に失敗しました" }, { status: 401 });
}

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(url)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("不正なリクエストです。");
  }
  const pageId = (body as { pageId?: unknown })?.pageId;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  const rawTargetSrc = (body as { targetSrc?: unknown })?.targetSrc;
  // 対象画像は microCMS アセットURLに限定する(任意 URL を対象にできないようにする防御)。
  if (typeof rawTargetSrc !== "string" || !isMicrocmsAssetUrl(rawTargetSrc)) {
    return badRequest("不正な対象画像です。");
  }
  const rawInstruction = (body as { instruction?: unknown })?.instruction;
  const instruction = typeof rawInstruction === "string" ? rawInstruction.trim() : "";
  if (instruction.length > MAX_INSTRUCTION_LEN) {
    return badRequest(`再生成指示は${MAX_INSTRUCTION_LEN}文字以内にしてください。`);
  }

  const options = notionOptions();
  if (!options) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const row = bodyRegenRowFromPage(await getPage(pageId, options));
    if (!row.contentId) {
      return badRequest("下書きがまだありません。下書き作成後に再生成できます。");
    }
    if (BODY_REGEN_BUSY_STATUSES.includes(row.status)) {
      return NextResponse.json(
        { success: false, error: "この記事は本文画像再生成の処理中です。完了までお待ちください。" },
        { status: 409 }
      );
    }
    await updatePageProps(
      pageId,
      buildBodyRegenRequestProps(instruction, rawTargetSrc, new Date().toISOString()),
      options
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "再生成依頼の登録に失敗しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
