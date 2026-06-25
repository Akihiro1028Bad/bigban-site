/**
 * 承認画面 API 用の認証ヘッダ(#SEC-03 / #H26)。
 *
 * トークンを **URL(クエリ)ではなく `Authorization: Bearer` ヘッダ**で送る。
 * これにより token が Vercel アクセスログ・ブラウザ履歴・Referer に載らない。
 * 既存ヘッダ(例: Content-Type)があればマージする。
 */
export function authHeaders(
  token: string,
  base: Record<string, string> = {}
): Record<string, string> {
  return { ...base, Authorization: `Bearer ${token}` };
}
