// 6月キャンペーン (クーポンコード CAMPFIRE30) の開始境界。
// JST 2026-06-01 00:00:00 = UTC 2026-05-31 15:00:00。
// この瞬間を境に、固定バナーを6月版へ切り替え、クラファンポップアップを非表示にする。
const JUNE_PROMO_START_UTC = Date.UTC(2026, 4, 31, 15, 0, 0);

/**
 * 指定時刻 (既定は現在) が JST で 6/1 00:00 以降かどうかを返す。
 * タイムゾーンに依存しない瞬間 (epoch) で比較するため、閲覧者のローカル TZ に左右されない。
 */
export function isJunePromoActive(now: Date = new Date()): boolean {
  return now.getTime() >= JUNE_PROMO_START_UTC;
}
