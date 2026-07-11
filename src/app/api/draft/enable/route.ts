import { timingSafeEqual } from "node:crypto";

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import {
  getColumnByContentId,
  getColumnDetail,
} from "@/lib/microcms/columnsQueries";
import { getNewsByContentId, getNewsDetail } from "@/lib/microcms/queries";

export const runtime = "nodejs";

type Locale = "ja" | "en";

/** プレビュー対象の CMS エンドポイント。既定は news (後方互換・§5.4)。 */
type Endpoint = "news" | "columns";

const SLUG_RE = /^[a-z0-9-]+$/;
const CONTENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

function isLocale(v: string | null): v is Locale {
  return v === "ja" || v === "en";
}

function isEndpoint(v: string | null): v is Endpoint {
  return v === "news" || v === "columns";
}

/** endpoint に応じた「取得 & プレビュー」関数の束。 */
interface EndpointQueries {
  detail: (args: {
    locale: Locale;
    slug: string;
  }) => Promise<{ id: string } | null>;
  byContentId: (args: {
    id: string;
    draftKey?: string;
  }) => Promise<{ slug: string; locale: Locale } | null>;
}

function queriesFor(endpoint: Endpoint): EndpointQueries {
  if (endpoint === "columns") {
    return {
      detail: getColumnDetail,
      byContentId: getColumnByContentId,
    };
  }
  return { detail: getNewsDetail, byContentId: getNewsByContentId };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function unauthorized(): Response {
  return NextResponse.json({ ok: false }, { status: 401 });
}

function checkOrigin(request: Request): boolean {
  const allowed = process.env.MICROCMS_DRAFT_ALLOWED_ORIGINS;
  if (!allowed) return true;
  const list = allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  /* istanbul ignore next -- @preserve env がカンマだけで構成される edge ケースの防御 */
  if (list.length === 0) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return list.includes(origin);
}

/**
 * プレビュー用 URL クエリ付きで詳細ページにリダイレクトする。
 * Cookie / Next.js draftMode は使わず、microCMS 仕様準拠で
 * `?draftKey=` `?contentId=` を URL に持たせる。
 */
function previewRedirect(
  endpoint: Endpoint,
  locale: Locale,
  slug: string,
  contentId: string,
  draftKey: string,
): never {
  const prefix = locale === "ja" ? "" : "/en";
  const base = `${prefix}/${endpoint}/${slug}`;
  const params = new URLSearchParams({
    draftKey,
    contentId,
  });
  redirect(`${base}?${params.toString()}`);
}

export async function GET(request: Request): Promise<Response> {
  if (!checkOrigin(request)) return unauthorized();

  const url = new URL(request.url);
  /* istanbul ignore next -- @preserve URLSearchParams.get は string|null のみ返す (defensive ?? "") */
  const secret = url.searchParams.get("secret") ?? "";
  /* istanbul ignore next -- @preserve URLSearchParams.get は string|null のみ返す (defensive ?? "") */
  const draftKey = url.searchParams.get("draftKey") ?? "";

  // 共通: secret + draftKey 検証
  /* istanbul ignore next -- @preserve env 未設定時の防御フォールバック (?? "") */
  const expected = process.env.MICROCMS_DRAFT_SECRET ?? "";
  if (!expected || !safeEqual(secret, expected)) {
    return unauthorized();
  }
  if (!draftKey) return unauthorized();

  // endpoint 出し分け (news | columns・既定 news)。許可リスト外は 401。
  const endpointParam = url.searchParams.get("endpoint");
  if (endpointParam !== null && !isEndpoint(endpointParam)) {
    return unauthorized();
  }
  const endpoint: Endpoint = isEndpoint(endpointParam)
    ? endpointParam
    : "news";
  const queries = queriesFor(endpoint);

  // パターンA: contentId 経由 (microCMS 画面プレビュー推奨)
  // microCMS が変数置換するのは {CONTENT_ID} と {DRAFT_KEY} のみのため、
  // ID から slug/locale を逆引きしてリダイレクトする。
  const contentId = url.searchParams.get("contentId");
  if (contentId) {
    if (!CONTENT_ID_RE.test(contentId)) return unauthorized();
    const item = await queries.byContentId({ id: contentId, draftKey });
    if (!item) return unauthorized();
    return previewRedirect(
      endpoint,
      item.locale,
      item.slug,
      contentId,
      draftKey,
    );
  }

  // パターンB: slug + locale 直接指定 (後方互換 / 手動プレビュー用)
  /* istanbul ignore next -- @preserve URLSearchParams.get は string|null のみ返す (defensive ?? "") */
  const slug = url.searchParams.get("slug") ?? "";
  const localeParam = url.searchParams.get("locale");

  if (!slug) return unauthorized();
  if (!SLUG_RE.test(slug)) return unauthorized();
  if (localeParam !== null && !isLocale(localeParam)) {
    return unauthorized();
  }
  const locale: Locale = isLocale(localeParam) ? localeParam : "ja";

  const item = await queries.detail({ locale, slug });
  if (!item) return unauthorized();
  return previewRedirect(endpoint, locale, slug, item.id, draftKey);
}
