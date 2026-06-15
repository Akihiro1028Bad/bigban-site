/**
 * microCMS コンテンツ書き込み API(下書き作成・更新)を直接叩く。
 *
 * 下書きモードを headless(claude -p)でも動かすため、microCMS の MCP に依存せず
 * REST(`https://{serviceDomain}.microcms.io/api/v1/{endpoint}`)を使う。
 * fetch は注入可能(テスト容易性)。API キーは content の POST/PATCH 権限が必要。
 */

import type { FetchFn } from "./http";

export interface ContentApiOptions {
  serviceDomain: string;
  apiKey: string;
  fetchFn: FetchFn;
}

function contentUrl(
  serviceDomain: string,
  endpoint: string,
  contentId?: string
): string {
  const base = `https://${serviceDomain}.microcms.io/api/v1/${endpoint}`;
  return contentId ? `${base}/${contentId}` : base;
}

async function send(
  method: "POST" | "PATCH",
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
    const text = await res.text();
    throw new Error(
      `microCMS コンテンツ API に失敗しました (HTTP ${res.status}): ${text}`
    );
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new Error("microCMS 応答に id が含まれていません。");
  }
  return json.id;
}

/** 下書き(status=draft)としてコンテンツを新規作成し、contentId を返す。 */
export function createDraft(
  endpoint: string,
  data: Record<string, unknown>,
  options: ContentApiOptions
): Promise<string> {
  const url = `${contentUrl(options.serviceDomain, endpoint)}?status=draft`;
  return send("POST", url, options.apiKey, data, options.fetchFn);
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
