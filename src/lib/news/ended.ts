/**
 * ニュースの終了判定。
 * `eventEndAt`(microCMS の日時。UTC の ISO 文字列)を過ぎていれば true。
 * - 未設定・空・読めない値は false(誤って「終了」と表示しない側へ倒す)
 * - 終了日時ちょうどは false(過ぎたら true)
 */
export function isNewsEnded(
  eventEndAt: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!eventEndAt) return false;
  const endMs = Date.parse(eventEndAt);
  if (Number.isNaN(endMs)) return false;
  return now.getTime() > endMs;
}
