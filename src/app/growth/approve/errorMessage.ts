/**
 * API エラーから表示用メッセージを取り出す共有ユーティリティ(#H7 分解で共有化)。
 * Error は message を、それ以外は fallback を返す。
 */
export function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
