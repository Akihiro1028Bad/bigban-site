/**
 * 下書きアイキャッチの差し替え API(Epic #140 / #143)。
 *
 * POST { pageId, eyecatchUrl }: 承認画面で選択/アップロードしたメディア URL を、
 * 記事の下書きのアイキャッチへ差し替える。
 *
 * - `eyecatchUrl` は **microCMS アセット(`*.microcms-assets.io`・https)に限定**(任意 URL 拒否)。
 * - 書き込みは **content API キー**(`MICROCMS_CONTENT_API_KEY`)で `patchDraft`(管理キーは使わない)。
 * - #95/#141 整合: プレビュー正本の Notion ミラー(`アイキャッチURL`)を先に更新 → microCMS 下書きへ同期。
 * - status=draft の PATCH のみ。公開はしない。認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { draftLinkOf, isNotionPageId, mediaOf } from "@/lib/growth/approve";
import { patchDraft } from "@/lib/growth/content";
import { growthEndpoint } from "@/lib/growth/endpoint";
import { isMicrocmsAssetUrl } from "@/lib/growth/media";
import {
  buildEyecatchMirrorProps,
  defaultFetch,
  getPage,
  updatePageProps,
} from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";

export const runtime = "nodejs";

// contentId は Notion 由来(攻撃者制御外)だが、異常値のフェイルセーフとして上限長も課す。
const CONTENT_ID_RE = /^[a-z0-9-]{1,64}$/;

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function serverError(): Response {
  return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function microcmsOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } | null {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_CONTENT_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
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
  const eyecatchUrl = (body as { eyecatchUrl?: unknown })?.eyecatchUrl;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (!isMicrocmsAssetUrl(eyecatchUrl)) {
    return badRequest("アイキャッチには microCMS のメディア URL を指定してください。");
  }

  const notionOpts = notionOptions();
  const microOpts = microcmsOptions();
  if (!notionOpts || !microOpts) return serverError();

  let contentId: string;
  let stageBlocked: Response | null = null;
  let endpoint = growthEndpoint();
  try {
    const page = await getPage(pageId, notionOpts);
    stageBlocked = articleEditGuard(page);
    contentId = draftLinkOf(page).contentId;
    endpoint = growthEndpoint(mediaOf(page));
  } catch {
    return NextResponse.json(
      { success: false, error: "更新中にエラーが発生しました" },
      { status: 502 }
    );
  }
  if (stageBlocked) return stageBlocked;
  if (!contentId || !CONTENT_ID_RE.test(contentId)) {
    return NextResponse.json(
      { success: false, error: "差し替え対象の下書きが見つかりません。" },
      { status: 404 }
    );
  }

  // #95/#141: (1)プレビュー正本=Notion ミラーを先に更新 → (2)公開ターゲット=microCMS 下書きへ同期。
  try {
    await updatePageProps(pageId, buildEyecatchMirrorProps(eyecatchUrl), notionOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "プレビューへの反映(Notion)に失敗しました。やり直してください。" },
      { status: 502 }
    );
  }
  try {
    await patchDraft(endpoint, contentId, { eyecatch: eyecatchUrl }, microOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "公開ターゲット(microCMS)への同期に失敗しました。やり直してください。" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
