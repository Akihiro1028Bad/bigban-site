// 6月キャンペーン (クーポンコード CAMPFIRE30) の開始境界。
// JST 2026-06-01 00:00:00 = UTC 2026-05-31 15:00:00。
// この瞬間を境に、固定バナーを6月版へ切り替え、クラファンポップアップを非表示にする。
// TODO: 6/30 でクーポンが失効した後の表示 (バナー非表示 or 別文言) は別 PR で対応する。
const JUNE_PROMO_START_UTC = Date.UTC(2026, 4, 31, 15, 0, 0);

/**
 * 指定時刻 (既定は現在) が JST で 6/1 00:00 以降かどうかを返す。
 * タイムゾーンに依存しない瞬間 (epoch) で比較するため、閲覧者のローカル TZ に左右されない。
 */
export function isJunePromoActive(now: Date = new Date()): boolean {
  return now.getTime() >= JUNE_PROMO_START_UTC;
}

// オープン記念＆千葉大会応援キャンペーンの終了境界。
// 千葉大会当日 8/9 いっぱいまで有効 → JST 2026-08-10 00:00:00 = UTC 2026-08-09 15:00:00。
// この瞬間以降はキャンペーン表示を自動的に非表示にする。
const HYROX_CAMPAIGN_END_UTC = Date.UTC(2026, 7, 9, 15, 0, 0);

/**
 * 指定時刻 (既定は現在) が HYROX キャンペーン期間内 (JST 8/9 いっぱいまで) かを返す。
 * epoch 比較のため閲覧者のローカル TZ に左右されない。
 */
export function isHyroxCampaignActive(now: Date = new Date()): boolean {
  return now.getTime() < HYROX_CAMPAIGN_END_UTC;
}
