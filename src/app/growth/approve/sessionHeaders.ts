/** Cookie認証API用ヘッダ。長期secretやAuthorizationは送らない。 */
export function sessionHeaders(base: Record<string, string> = {}): Record<string, string> {
  return { ...base, "X-Growth-Request": "1" };
}
