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
  const url = `https://${options.serviceDomain}.microcms-management.io/api/v1/contents/${endpoint}/${contentId}`;
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
