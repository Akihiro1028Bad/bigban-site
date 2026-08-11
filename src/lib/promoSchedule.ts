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
