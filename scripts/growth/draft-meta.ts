/**
 * microCMS の管理API(コンテンツのメタ情報)から下書きの draftKey を取得する。
 *
 * 下書き作成API(content.ts createDraft)は contentId しか返さないため、
 * プレビューURL に必要な draftKey はこの管理API経由で引く。
 * 管理APIは `*.microcms-management.io` ドメイン・`X-MICROCMS-API-KEY` ヘッダ
 * (media.ts と同一)。公開済み/クローズ済みコンテンツでは draftKey は null。
 *
 * 参照: 管理API `GET /api/v1/contents/{endpoint}/{contentId}` の `draftKey`。
 */

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
    const text = await res.text();
    throw new Error(
      `draftKey の取得に失敗しました (HTTP ${res.status}): ${text}`
    );
  }

  const json = (await res.json()) as { draftKey?: string | null };
  return json.draftKey ?? null;
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
    // エラーボディは固定長に制限(機微情報の不用意な露出・ログ肥大を避ける)。
    const body = (await res.text()).slice(0, 200);
    throw new Error(`コンテンツ要約の取得に失敗しました (HTTP ${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    title?: string | null;
    excerpt?: string | null;
    category?: string[] | string | null;
    eyecatch?: { url?: string | null } | null;
  };
  const category = Array.isArray(json.category)
    ? json.category[0] ?? null
    : json.category ?? null;
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
