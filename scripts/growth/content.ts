/**
 * microCMS コンテンツ書き込み API(下書き作成・更新)を直接叩く。
 *
 * 下書きモードを headless(claude -p)でも動かすため、microCMS の MCP に依存せず
 * REST(`https://{serviceDomain}.microcms.io/api/v1/{endpoint}`)を使う。
 * fetch は注入可能(テスト容易性)。API キーは content の PUT/PATCH 権限が必要。
 *
 * 作成は **slug 由来の決定的 contentId で冪等化**する(#21): PUT で作成し、
 * 既存IDなら microCMS が 400「Content is already exists」を返すので PATCH で上書き。
 * これにより 504 等のリトライ・再実行でも**重複下書きを作らない**(レジューム可能)。
 */

import type { FetchFn } from "./http";

export interface ContentApiOptions {
  serviceDomain: string;
  apiKey: string;
  fetchFn: FetchFn;
}

/** microCMS API の非 2xx 応答を表す。status / body を保持し、4xx/5xx の判別に使う。 */
export class MicrocmsHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`microCMS コンテンツ API に失敗しました (HTTP ${status}): ${body}`);
    this.name = "MicrocmsHttpError";
    this.status = status;
    this.body = body;
  }
}

function contentUrl(
  serviceDomain: string,
  endpoint: string,
  contentId: string
): string {
  return `https://${serviceDomain}.microcms.io/api/v1/${endpoint}/${contentId}`;
}

/**
 * slug を microCMS の contentId 規則(英小文字・数字・ハイフン)に正規化する。
 * 同じ slug からは必ず同じ id を生成し、冪等な作成を可能にする。
 */
export function slugToContentId(slug: string): string {
  const id = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!id) {
    throw new Error(`slug から有効な contentId を生成できません: "${slug}"`);
  }
  return id;
}

async function send(
  method: "PUT" | "PATCH",
  url: string,
  apiKey: string,
  body: unknown,
  fetchFn: FetchFn
): Promise<string> {
  const res = await fetchFn(url, {
    method,
    headers: {
      "X-MICROCMS-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new MicrocmsHttpError(res.status, await res.text());
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new Error("microCMS 応答に id が含まれていません。");
  }
  return json.id;
}

function isAlreadyExists(error: MicrocmsHttpError): boolean {
  return error.status === 400 && /already exists/i.test(error.body);
}

/**
 * 下書き(status=draft)を **slug 由来の決定的 ID** で冪等に作成する。
 * 同一slugの再実行では PUT が 400(already exists)になるため PATCH で上書きする。
 * data.slug(文字列)が必須。返すのは生成した contentId。
 */
export async function createDraft(
  endpoint: string,
  data: Record<string, unknown>,
  options: ContentApiOptions
): Promise<string> {
  const slug = data.slug;
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error("冪等な作成には文字列の slug が必要です。");
  }
  const id = slugToContentId(slug);
  const url = `${contentUrl(options.serviceDomain, endpoint, id)}?status=draft`;

  try {
    return await send("PUT", url, options.apiKey, data, options.fetchFn);
  } catch (error: unknown) {
    if (error instanceof MicrocmsHttpError && isAlreadyExists(error)) {
      // 既に同一IDの下書きが存在 = 前回の作成が成功済み。上書きしてレジューム。
      return send("PATCH", url, options.apiKey, data, options.fetchFn);
    }
    throw error;
  }
}

/** 既存コンテンツの下書きを部分更新する(eyecatch 添付など)。 */
export function patchDraft(
  endpoint: string,
  contentId: string,
  data: Record<string, unknown>,
  options: ContentApiOptions
): Promise<string> {
  const url = `${contentUrl(
    options.serviceDomain,
    endpoint,
    contentId
  )}?status=draft`;
  return send("PATCH", url, options.apiKey, data, options.fetchFn);
}
