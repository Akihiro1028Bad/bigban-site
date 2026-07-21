/**
 * microCMS の管理API/コンテンツAPIから下書きの draftKey とslugを取得する。
 *
 * 下書き作成API(content.ts createDraft)は contentId しか返さないため、
 * プレビューURL に必要な draftKey はこの管理API経由で引く。
 * 管理APIは `*.microcms-management.io` ドメイン・`X-MICROCMS-API-KEY` ヘッダ
 * (media.ts と同一)。公開済み/クローズ済みコンテンツでは draftKey は null。
 *
 * 参照: 管理API `GET /api/v1/contents/{endpoint}/{contentId}` の `draftKey`。
 */

import { externalApiErrorFromResponse } from "./externalApiError";
import type { FetchFn } from "./http";

export interface DraftMetaOptions {
  serviceDomain: string;
  apiKey: string;
  fetchFn: FetchFn;
}

/**
 * 指定 contentId のメタ情報を管理APIから取得し、draftKey を返す。
 * 公開済み等で draftKey が無い場合は null。HTTP エラーは例外。
 */
export async function fetchDraftKey(
  endpoint: string,
  contentId: string,
  options: DraftMetaOptions
): Promise<string | null> {
  // contentId はパスセグメントなので必ずエンコードする(パスインジェクション防御)。
  const url = `https://${options.serviceDomain}.microcms-management.io/api/v1/contents/${endpoint}/${encodeURIComponent(
    contentId
  )}`;
  const res = await options.fetchFn(url, {
    method: "GET",
    headers: { "X-MICROCMS-API-KEY": options.apiKey },
  });

  if (!res.ok) {
    throw externalApiErrorFromResponse("microcms.draft-key.get", res);
  }

  const json = (await res.json()) as { draftKey?: string | null };
  return json.draftKey ?? null;
}

/** 再生成時に既存下書きの記事URLを維持するため、現在のslugを取得する。 */
export async function fetchContentSlug(
  endpoint: string,
  contentId: string,
  draftKey: string,
  options: DraftMetaOptions
): Promise<string> {
  const params = new URLSearchParams({ fields: "slug", draftKey });
  const url = `https://${options.serviceDomain}.microcms.io/api/v1/${endpoint}/${encodeURIComponent(
    contentId
  )}?${params.toString()}`;
  const res = await options.fetchFn(url, {
    method: "GET",
    headers: { "X-MICROCMS-API-KEY": options.apiKey },
  });

  if (!res.ok) {
    throw externalApiErrorFromResponse("microcms.content.slug.get", res);
  }

  const json = (await res.json()) as { slug?: unknown };
  if (typeof json.slug !== "string" || json.slug.trim() === "") {
    throw new Error("既存下書きから有効なslugを取得できませんでした");
  }
  return json.slug;
}

export interface ContentSummary {
  title: string | null;
  excerpt: string | null;
  /** カテゴリ名(select の先頭)。 */
  category: string | null;
  /** アイキャッチ画像 URL。 */
  eyecatchUrl: string | null;
}

/**
 * category フィールドの表示名(文字列)を1件取り出す。媒体で形が違うのを吸収する:
 * - news: select → 文字列 or 文字列配列(先頭)。
 * - columns: relation → オブジェクト `{ id, name, nameEn }` or その配列(先頭)。
 *   relation は `name`(無ければ `nameEn`)を表示名として使う。id しか無ければ null
 *   (LINE Flex の空/`[object Object]` バッジを防ぐ=沈黙させずバッジだけ省く)。
 * どの形でも表示名が取れなければ null(呼び出し側でバッジ省略)。
 */
function extractCategoryName(raw: unknown): string | null {
  const first = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  if (first === null || first === undefined) return null;
  if (typeof first === "string") {
    return first.trim() === "" ? null : first;
  }
  if (typeof first === "object") {
    const rel = first as { name?: unknown; nameEn?: unknown };
    const name =
      typeof rel.name === "string" && rel.name.trim() !== ""
        ? rel.name
        : typeof rel.nameEn === "string" && rel.nameEn.trim() !== ""
          ? rel.nameEn
          : null;
    return name;
  }
  return null;
}

/**
 * 通知カード(#35)用に、コンテンツの表示情報(title/excerpt/category/eyecatch)を
 * **コンテンツAPI**(`*.microcms.io`)から取得する。下書きは draftKey 必須。
 * draftKey 用の管理API(fetchDraftKey)とはドメインが異なる点に注意。
 */
export async function fetchContentSummary(
  endpoint: string,
  contentId: string,
  draftKey: string | null,
  options: DraftMetaOptions
): Promise<ContentSummary> {
  const params = new URLSearchParams({ fields: "title,excerpt,category,eyecatch" });
  if (draftKey) params.set("draftKey", draftKey);
  // contentId はパスセグメントなので必ずエンコードする(パスインジェクション防御)。
  const url = `https://${options.serviceDomain}.microcms.io/api/v1/${endpoint}/${encodeURIComponent(
    contentId
  )}?${params.toString()}`;
  const res = await options.fetchFn(url, {
    method: "GET",
    headers: { "X-MICROCMS-API-KEY": options.apiKey },
  });

  if (!res.ok) {
    throw externalApiErrorFromResponse("microcms.content.summary.get", res);
  }

  const json = (await res.json()) as {
    title?: string | null;
    excerpt?: string | null;
    // news: select(文字列/文字列配列)。columns: relation(オブジェクト/オブジェクト配列)。
    category?: unknown;
    eyecatch?: { url?: string | null } | null;
  };
  const category = extractCategoryName(json.category);
  // 画像は LINE Flex に渡すため HTTPS のみ許可(javascript:/data: 等の混入を防ぐ)。
  const rawEyecatch = json.eyecatch?.url ?? null;
  const eyecatchUrl = rawEyecatch && /^https:\/\//i.test(rawEyecatch) ? rawEyecatch : null;
  return {
    title: json.title ?? null,
    excerpt: json.excerpt ?? null,
    category,
    eyecatchUrl,
  };
}
