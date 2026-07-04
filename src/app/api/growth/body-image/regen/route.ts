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
 * 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。既定ON・フェイルセーフ(未設定=ON))。
 *
 * P2(#62): `style?`(表示値『おまかせ』/内部キー・省略時 auto)・`textSpec?`(1000 字上限)を
 * 受理し依頼キュー(Notion `本文画像スタイル`/`本文画像文字指定`)へ通す。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { growthApiError } from "@/lib/growth/apiError";
import { isNotionPageId } from "@/lib/growth/approve";
import { normalizeBodyImageStyle, type RequestedBodyImageStyle } from "@/lib/growth/bodyImage";
import {
  BODY_REGEN_BUSY_STATUSES,
  buildBodyRegenRequestProps,
  bodyRegenRowFromPage,
} from "@/lib/growth/bodyImageRegen";
import { isMicrocmsAssetUrl } from "@/lib/growth/media";
import { defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";

export const runtime = "nodejs";

/** 再生成指示(自由文)の上限長。濫用・巨大ペイロード防止。 */
const MAX_INSTRUCTION_LEN = 500;
/** 図に焼き込む文字・数値(textSpec)の上限長。巨大ペイロード防止。 */
const MAX_TEXTSPEC_LEN = 1000;
/** style として受理する表示値・内部キー(discriminated ではなく enum)。 */
const ALLOWED_STYLE_INPUTS = ["おまかせ", "auto", "mascot", "illust", "court", "flow", "infographic"] as const;

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
  const rawStyle = (body as { style?: unknown })?.style;
  let requestedStyle: RequestedBodyImageStyle = "auto";
  if (rawStyle !== undefined) {
    if (typeof rawStyle !== "string" || !(ALLOWED_STYLE_INPUTS as readonly string[]).includes(rawStyle)) {
      return badRequest("不正なスタイル指定です。");
    }
    // 表示値『おまかせ』/auto は auto、内部キーはそのまま。旧値は enum に無いため 400 で弾く。
    requestedStyle = rawStyle === "おまかせ" || rawStyle === "auto" ? "auto" : normalizeBodyImageStyle(rawStyle);
  }
  const rawTextSpec = (body as { textSpec?: unknown })?.textSpec;
  const textSpec = typeof rawTextSpec === "string" ? rawTextSpec.trim() : "";
  if (textSpec.length > MAX_TEXTSPEC_LEN) {
    return badRequest(`文字指定は${MAX_TEXTSPEC_LEN}文字以内にしてください。`);
  }

  const options = notionOptions();
  if (!options) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const page = await getPage(pageId, options);
    const blocked = articleEditGuard(page);
    if (blocked) return blocked;
    const row = bodyRegenRowFromPage(page);
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
      buildBodyRegenRequestProps(instruction, rawTargetSrc, requestedStyle, textSpec, new Date().toISOString()),
      options
    );
  } catch (error) {
    // 真因はサーバログへ。Notion プロパティ欠落は 500＋プロパティ名で可視化(#177)。
    const { status, body } = growthApiError("body-image/regen", error, "再生成依頼の登録に失敗しました");
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({ success: true });
}
