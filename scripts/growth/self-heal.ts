/**
 * セルフヒール: 同 slug の重複下書きを検出・削除して「slug汚染」から自動回復する(#26)。
 *
 * 真因は非冪等POST＋盲目的リトライ(#21で予防済み)。本モジュールは**既に汚染された
 * slug の回復**を担う。microCMS の制約上、下書きを slug で直接一覧できないため:
 *   1) 管理API(コンテンツメタ一覧)で DRAFT の {id, draftKey} を列挙
 *   2) 各下書きの slug を content API(draftKey付き)で解決
 *   3) #21 の正本ID(slug由来)以外の同slug下書きを削除
 * 列挙不能・ページ打ち切り時は**沈黙せず**フォールバック(手動確認を促す)を返す。
 * 破壊的操作のため**既定 dry-run・件数上限**。fetch は注入可能。
 */

import type { FetchFn } from "./http";

export interface SelfHealHttpOptions {
  serviceDomain: string;
  apiKey: string;
  fetchFn: FetchFn;
}

export interface DraftMeta {
  id: string;
  draftKey: string | null;
}

export interface SlugCandidate {
  id: string;
  slug: string | null;
}

/** 同 slug かつ正本(canonicalId)以外の id を返す純関数。正本は決して含めない。 */
export function selectDuplicateIds(params: {
  candidates: readonly SlugCandidate[];
  slug: string;
  canonicalId: string;
}): string[] {
  return params.candidates
    .filter((c) => c.slug === params.slug && c.id !== params.canonicalId)
    .map((c) => c.id);
}

const MGMT_LIST_LIMIT = 100;

interface MetaListResponse {
  contents?: Array<{ id?: string; status?: string[]; draftKey?: string | null }>;
  totalCount?: number;
}

/** 管理APIから DRAFT 状態の {id, draftKey} を列挙する(最大100件)。 */
export async function listDraftMetas(
  endpoint: string,
  options: SelfHealHttpOptions
): Promise<{ items: DraftMeta[]; totalCount: number }> {
  const url = `https://${options.serviceDomain}.microcms-management.io/api/v1/contents/${endpoint}?limit=${MGMT_LIST_LIMIT}`;
  const res = await options.fetchFn(url, {
    method: "GET",
    headers: { "X-MICROCMS-API-KEY": options.apiKey },
  });
  if (!res.ok) {
    throw new Error(
      `下書きメタ一覧の取得に失敗しました (HTTP ${res.status}): ${await res.text()}`
    );
  }
  const json = (await res.json()) as MetaListResponse;
  const items = (json.contents ?? [])
    .filter((c) => Array.isArray(c.status) && c.status.includes("DRAFT") && c.id)
    .map((c) => ({ id: c.id as string, draftKey: c.draftKey ?? null }));
  return { items, totalCount: json.totalCount ?? items.length };
}

/** 指定コンテンツの slug を取得する(下書きは draftKey 必須)。 */
export async function fetchContentSlug(
  endpoint: string,
  contentId: string,
  draftKey: string | null,
  options: SelfHealHttpOptions
): Promise<string | null> {
  const params = new URLSearchParams({ fields: "slug" });
  if (draftKey) params.set("draftKey", draftKey);
  const url = `https://${options.serviceDomain}.microcms.io/api/v1/${endpoint}/${encodeURIComponent(
    contentId
  )}?${params.toString()}`;
  const res = await options.fetchFn(url, {
    method: "GET",
    headers: { "X-MICROCMS-API-KEY": options.apiKey },
  });
  if (!res.ok) {
    throw new Error(
      `slug の取得に失敗しました (HTTP ${res.status}): ${await res.text()}`
    );
  }
  const json = (await res.json()) as { slug?: string | null };
  return json.slug ?? null;
}

/** コンテンツを削除する(DELETE・202 で成功)。 */
export async function deleteContent(
  endpoint: string,
  contentId: string,
  options: SelfHealHttpOptions
): Promise<void> {
  const url = `https://${options.serviceDomain}.microcms.io/api/v1/${endpoint}/${encodeURIComponent(
    contentId
  )}`;
  const res = await options.fetchFn(url, {
    method: "DELETE",
    headers: { "X-MICROCMS-API-KEY": options.apiKey },
  });
  if (!res.ok) {
    throw new Error(
      `コンテンツ削除に失敗しました (HTTP ${res.status}): ${await res.text()}`
    );
  }
}

export interface SelfHealDeps {
  listMetas: () => Promise<{ items: DraftMeta[]; totalCount: number }>;
  resolveSlug: (id: string, draftKey: string | null) => Promise<string | null>;
  del: (id: string) => Promise<void>;
}

export interface SelfHealParams {
  slug: string;
  canonicalId: string;
  dryRun: boolean;
  maxDelete: number;
}

export interface SelfHealResult {
  enumerated: boolean;
  truncated: boolean;
  duplicateIds: string[];
  deletedIds: string[];
  message: string;
}

/**
 * 同 slug の重複下書きを検出し、正本以外を削除する。
 * 列挙不能時は enumerated=false で手動確認を促す(沈黙しない)。既定は呼び出し側で dry-run。
 */
export async function selfHeal(
  params: SelfHealParams,
  deps: SelfHealDeps
): Promise<SelfHealResult> {
  let listing: { items: DraftMeta[]; totalCount: number };
  try {
    listing = await deps.listMetas();
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      enumerated: false,
      truncated: false,
      duplicateIds: [],
      deletedIds: [],
      message: `下書きを列挙できませんでした(${reason})。管理画面で slug=${params.slug} の重複下書きを手動で確認してください。`,
    };
  }

  const candidates: SlugCandidate[] = await Promise.all(
    listing.items.map(async (m) => ({
      id: m.id,
      slug: await deps.resolveSlug(m.id, m.draftKey),
    }))
  );

  const duplicateIds = selectDuplicateIds({
    candidates,
    slug: params.slug,
    canonicalId: params.canonicalId,
  });
  const toDelete = duplicateIds.slice(0, params.maxDelete);
  const truncated =
    listing.items.length < listing.totalCount ||
    toDelete.length < duplicateIds.length;

  if (params.dryRun) {
    return {
      enumerated: true,
      truncated,
      duplicateIds,
      deletedIds: [],
      message: `dry-run: slug=${params.slug} の重複下書き ${duplicateIds.length} 件(削除実行は --apply)。`,
    };
  }

  const deletedIds: string[] = [];
  for (const id of toDelete) {
    await deps.del(id);
    deletedIds.push(id);
  }
  return {
    enumerated: true,
    truncated,
    duplicateIds,
    deletedIds,
    message: `slug=${params.slug} の重複下書き ${deletedIds.length} 件を削除しました。`,
  };
}

/**
 * 「掃除(セルフヒール)を1回 → 再投入を1回」を行い、再投入の結果を返す。
 * create 失敗時の安全な自動回復(最大1回)に使う。
 */
export async function cleanThenRetry<T>(opts: {
  heal: () => Promise<SelfHealResult>;
  retry: () => Promise<T>;
}): Promise<T> {
  await opts.heal();
  return opts.retry();
}
