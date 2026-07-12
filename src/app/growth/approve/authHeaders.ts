/**
 * 承認画面 API 用の認証ヘッダ(#SEC-03 / #H26)。
 *
 * トークンを **URL(クエリ)ではなく `Authorization: Bearer` ヘッダ**で送る。
 * これにより token が Vercel アクセスログ・ブラウザ履歴・Referer に載らない。
 * 既存ヘッダ(例: Content-Type)があればマージする。
 *
 * HTTP ヘッダ値は ISO-8859-1(Latin-1)のみ許容され、日本語等の合言葉をそのまま載せると
 * ブラウザの fetch が "non ISO-8859-1 code point" で送信前に失敗する。そのため token は
 * percent-encode して ASCII 化する(サーバ側 apiAuth.ts の `bearerToken` が decode する)。
 * ASCII の token は encodeURIComponent で不変なので従来挙動と互換。
 */
export function authHeaders(
  token: string,
  base: Record<string, string> = {}
): Record<string, string> {
  return { ...base, Authorization: `Bearer ${encodeURIComponent(token)}` };
}
