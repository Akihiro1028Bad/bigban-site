/**
 * 下書き本文画像の同期差し替え API(Epic #140 / #145・本文画像 P1)。
 *
 * POST { pageId, targetSrc, newUrl }: 承認画面の画像タブで選択/アップロードしたメディア URL(newUrl)を、
 * 本文HTML中の該当 <img src>(targetSrc)へ即時に付け替える(AI を介さない同期処理)。
 *
 * - `targetSrc`・`newUrl` はともに **microCMS アセット URL に限定**(任意 URL 拒否)。
 * - 差し替えは `replaceBodyImageBySrc`(src 一致の先頭1枚・関数形式置換)を流用する。
 * - 差し替え後 `sanitizeNewsHtml(STRICT_HTML_CONFIG)` を再適用(XSS 最終段)。
 * - 書き込みは 単一APIキーで `patchDraft`(同じ単一APIキーを使用)。status=draft のみ。公開しない。
 * - #95: Notion ミラー(下書き本文HTML)を先に更新 → microCMS 同期。同期失敗はミラーを旧本文へ戻す。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { draftBodyOf, draftLinkOf, isNotionPageId, mediaOf } from "@/lib/growth/approve";
import { replaceBodyImageBySrc } from "@/lib/growth/bodyImageRegen";
import { patchDraft } from "@/lib/growth/content";
import { growthEndpoint } from "@/lib/growth/endpoint";
import { isMicrocmsAssetUrl } from "@/lib/growth/media";
import { buildBodyMirrorProps, defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";
import { sanitizeNewsHtml, STRICT_HTML_CONFIG } from "@/lib/news/sanitize";

export const runtime = "nodejs";

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
  const apiKey = process.env.MICROCMS_API_KEY;
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
  const targetSrc = (body as { targetSrc?: unknown })?.targetSrc;
  const newUrl = (body as { newUrl?: unknown })?.newUrl;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (!isMicrocmsAssetUrl(targetSrc)) return badRequest("対象画像には microCMS のメディア URL を指定してください。");
  if (!isMicrocmsAssetUrl(newUrl)) return badRequest("差し替え先には microCMS のメディア URL を指定してください。");

  const notionOpts = notionOptions();
  const microOpts = microcmsOptions();
  if (!notionOpts || !microOpts) return serverError();

  let contentId: string;
  let previousBody = "";
  let stageBlocked: Response | null = null;
  let endpoint = growthEndpoint();
  try {
    const page = await getPage(pageId, notionOpts);
    stageBlocked = articleEditGuard(page);
    contentId = draftLinkOf(page).contentId;
    previousBody = draftBodyOf(page);
    endpoint = growthEndpoint(mediaOf(page));
  } catch {
    return NextResponse.json({ success: false, error: "更新中にエラーが発生しました" }, { status: 502 });
  }
  if (stageBlocked) return stageBlocked;
  if (!contentId || !CONTENT_ID_RE.test(contentId)) {
    return NextResponse.json(
      { success: false, error: "差し替え対象の下書きが見つかりません。" },
      { status: 404 }
    );
  }

  // 本文HTMLの該当 <img src> を newUrl へ差し替える(src 一致の先頭1枚・関数形式置換)。
  const { html: swapped, replaced } = replaceBodyImageBySrc(previousBody, targetSrc, newUrl);
  if (!replaced) {
    return NextResponse.json(
      { success: false, error: "差し替え対象の画像が本文に見つかりません。" },
      { status: 404 }
    );
  }
  // サーバ側で再サニタイズしてから書き込む(XSS 最終段)。
  const sanitized = sanitizeNewsHtml(swapped, STRICT_HTML_CONFIG);

  // #95: (1)Notion ミラーを先に更新 → (2)microCMS 下書きへ同期。同期失敗はミラーを旧本文へ戻す。
  try {
    await updatePageProps(pageId, buildBodyMirrorProps(sanitized), notionOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "プレビューへの反映(Notion)に失敗しました。やり直してください。" },
      { status: 502 }
    );
  }
  try {
    await patchDraft(endpoint, contentId, { bodyHtml: sanitized }, microOpts);
  } catch {
    try {
      await updatePageProps(pageId, buildBodyMirrorProps(previousBody), notionOpts);
    } catch {
      /* rollback 失敗。再操作で冪等に回復する。 */
    }
    return NextResponse.json(
      { success: false, error: "公開ターゲット(microCMS)への同期に失敗しました。やり直してください。" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
