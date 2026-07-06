/**
 * 記事の本番公開 API(#167)。
 *
 * POST { pageId }: 下書き(microCMS)を **本番公開**し、Notion ステータスを「公開済み」に更新する。
 * 公開は取り消しづらい外向き操作のため最強権限:
 *  - **認証必須＋ APPROVE_AUTH_ENABLED ゲート**: 認証が無効(オフ)なら常に拒否する(本番で ON にする)。
 *  - 公開前検証: 下書きID・アイキャッチ必須・本文非空。未充足は 400 で弾く。
 *  - 公開(ステータス変更)は **Management API**(MICROCMS_MANAGEMENT_API_KEY・公開ステータス変更権限)で行う。
 *    Content API の `?status=publish` では公開できない(#167 不具合の修正)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import {
  draftBodyOf,
  draftLinkOf,
  eyecatchUrlOf,
  ideaTitleOf,
  isNotionPageId,
  mediaOf,
  STATUS_PROP,
} from "@/lib/growth/approve";
import { removeAiDisclaimer } from "@/lib/growth/aiDisclaimer";
import { hasPendingBodyImage } from "@/lib/growth/bodyImageInsert";
import { BODY_REGEN_BUSY_STATUSES, bodyRegenRowFromPage } from "@/lib/growth/bodyImageRegen";
import { patchDraft, publishContent } from "@/lib/growth/content";
import { growthEndpoint } from "@/lib/growth/endpoint";
import { REGEN_BUSY_STATUSES, regenRowFromPage } from "@/lib/growth/eyecatchRegen";
import { knownArticlePathsForMedia } from "@/lib/growth/knownArticlePaths";
import { defaultFetch, getPage, type NotionPage, updatePageSelect } from "@/lib/growth/notion";
import { publishGateReason, resolveGateArticleType } from "@/lib/growth/publishGate";
import { getColumnSlugs } from "@/lib/microcms/columnsQueries";
import { getNewsSlugs } from "@/lib/microcms/queries";

export const runtime = "nodejs";

const PUBLISHED_STATUS = "公開済み";
const CONTENT_ID_RE = /^[a-z0-9-]+$/;
const IMAGE_GENERATION_PENDING_MESSAGE = "画像生成の完了を待ってから公開してください。";

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function microcmsOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } | null {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  // 公開ステータス変更は Management API キー(公開ステータス変更権限が必要)。
  const apiKey = process.env.MICROCMS_MANAGEMENT_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
}

// #176: 公開直前のタイトル最終同期(本文書き込み)は content API キーで行う(管理キーは使わない=#76)。
function contentMicrocmsOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } | null {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_CONTENT_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
}

/** Notion ページの「ステータス」select 名を読む(未設定は空)。 */
function articleStatusOf(page: NotionPage): string {
  const value = page.properties[STATUS_PROP] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function hasUnfinishedImageGeneration(page: NotionPage): boolean {
  const bodyHtml = draftBodyOf(page);
  return (
    hasPendingBodyImage(bodyHtml) ||
    BODY_REGEN_BUSY_STATUSES.includes(bodyRegenRowFromPage(page).status) ||
    REGEN_BUSY_STATUSES.includes(regenRowFromPage(page).status)
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request, true)) return unauthorized("公開には認証が必要です(APPROVE_AUTH_ENABLED を有効化してください)。");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("不正なリクエストです。");
  }
  const pageId = (body as { pageId?: unknown })?.pageId;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");

  const notionOpts = notionOptions();
  const microOpts = microcmsOptions();
  const contentOpts = contentMicrocmsOptions();
  if (!notionOpts || !microOpts || !contentOpts) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const page = await getPage(pageId, notionOpts);
    // #SPEC-14: 既に公開済みなら冪等に 409。二重公開や、手直しした公開タイトルの再上書きを防ぐ。
    if (articleStatusOf(page) === PUBLISHED_STATUS) {
      return NextResponse.json(
        { success: false, error: "この記事は既に公開済みです。" },
        { status: 409 }
      );
    }
    const contentId = draftLinkOf(page).contentId;
    if (!contentId || !CONTENT_ID_RE.test(contentId)) {
      return badRequest("下書きがまだありません。下書き作成後に公開できます。");
    }
    // 公開前検証: アイキャッチ必須・本文非空(中途半端な記事を公開しない)。
    if (!eyecatchUrlOf(page)) {
      return badRequest("アイキャッチがありません。設定してから公開してください。");
    }
    if (!draftBodyOf(page).trim()) {
      return badRequest("本文が空です。");
    }
    if (hasUnfinishedImageGeneration(page)) {
      return NextResponse.json(
        { success: false, error: IMAGE_GENERATION_PENDING_MESSAGE },
        { status: 409 }
      );
    }
    // #media: 記事ごとの媒体(`媒体` select)から公開先を解決する。
    // ニュース → 常に news / コラム(既定・欠落)→ env(GROWTH_MICROCMS_ENDPOINT)従属。
    // draft ルート(growthArticleSegment)と一貫させ、env=columns でもニュース告知が壊れないようにする。
    const endpoint = growthEndpoint(mediaOf(page));
    // #176: 公開直前に承認画面の正タイトル(Notion タイトル案)を microCMS 下書きへ最終同期する。
    // これで承認・編集したタイトルが公開記事に確実に反映される(AI 生成時のタイトルで公開しない)。
    // AI 免責注記は公開する microCMS 本文だけから除去する。Notion ミラーは下書き記録として残す。
    const rawBody = draftBodyOf(page);
    let knownNewsPaths: ReadonlySet<string> | undefined;
    try {
      const paths = await knownArticlePathsForMedia(mediaOf(page), {
        getColumnSlugs,
        getNewsSlugs,
      });
      knownNewsPaths = new Set(paths);
    } catch {
      knownNewsPaths = undefined;
    }
    const gateReason = publishGateReason(
      rawBody,
      ideaTitleOf(page).trim(),
      resolveGateArticleType({}),
      knownNewsPaths
    );
    if (gateReason) {
      return NextResponse.json(
        { success: false, error: `公開前チェックで公開できません: ${gateReason}` },
        { status: 409 }
      );
    }
    const { body: cleanBody, removed } = removeAiDisclaimer(rawBody);
    const patch: Record<string, unknown> = {};
    const title = ideaTitleOf(page).trim();
    if (title) {
      patch.title = title;
    }
    if (removed) {
      patch.bodyHtml = cleanBody;
    }
    if (Object.keys(patch).length > 0) {
      await patchDraft(endpoint, contentId, patch, contentOpts);
    }
    await publishContent(endpoint, contentId, microOpts);
    await updatePageSelect(pageId, STATUS_PROP, PUBLISHED_STATUS, notionOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "公開中にエラーが発生しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
