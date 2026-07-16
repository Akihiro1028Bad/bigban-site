/**
 * Google REST API への薄い POST ヘルパー。
 * fetch を注入可能にして、テストでは決定論的なスタブを差し込めるようにする。
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchFn = (url: string, init: RequestInit) => Promise<HttpResponse>;

/** グローバル fetch を FetchFn として用いる既定実装。 */
export const defaultFetch: FetchFn = (url, init) =>
  fetch(url, init) as unknown as Promise<HttpResponse>;

export async function postJson(
  url: string,
  accessToken: string,
  body: unknown,
  fetchFn: FetchFn
): Promise<unknown> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API リクエストに失敗しました (HTTP ${res.status}): ${text}`);
  }

  return res.json();
}
