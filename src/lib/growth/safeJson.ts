/**
 * fetch レスポンスの本文を「空ボディ/非 JSON でも例外を投げず」に
 * プレーンオブジェクトとして取り出すユーティリティ(#117)。
 *
 * 背景: `await res.json()` は本文が空(本文ゼロの 500 等)や非 JSON のとき
 * `Unexpected end of JSON input` を投げ、エラーハンドリングが壊れる。
 * 本ヘルパは常に API エンベロープ形のオブジェクトを返し、
 * 呼び出し側は `json.success` / `json.error` で安全に分岐できる。
 */

export interface ApiEnvelope {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function readJsonObject(res: Response): Promise<ApiEnvelope> {
  const text = await res.text();
  if (text === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ApiEnvelope;
    }
    return {};
  } catch {
    return {};
  }
}
