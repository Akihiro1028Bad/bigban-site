// 6月キャンペーン (クーポンコード CAMPFIRE30) の開始境界。
// JST 2026-06-01 00:00:00 = UTC 2026-05-31 15:00:00。
// この瞬間を境に、固定バナーを6月版へ切り替え、クラファンポップアップを非表示にする。
const JUNE_PROMO_START_UTC = Date.UTC(2026, 4, 31, 15, 0, 0);

// PBT CLUB 会員制度の開始境界 = 6月キャンペーン (CAMPFIRE30・7/31 まで有効) の終了境界。
// JST 2026-08-01 00:00:00 = UTC 2026-07-31 15:00:00。
const PBT_CLUB_START_UTC = Date.UTC(2026, 6, 31, 15, 0, 0);

/**
 * 指定時刻 (既定は現在) が JST で 6/1 00:00 以降かどうかを返す。
 * タイムゾーンに依存しない瞬間 (epoch) で比較するため、閲覧者のローカル TZ に左右されない。
 *
 * 注意: これは「クラウドファンディングが終了したか」の判定であり、終了境界を持たない。
 * バナーの文言切替には使わないこと (終了境界を足すとクラファンポップアップが復活する)。
 * @see getPromoBannerPhase
 */
export function isJunePromoActive(now: Date = new Date()): boolean {
  return now.getTime() >= JUNE_PROMO_START_UTC;
}

/** 固定プロモバナーの表示フェーズ。 */
export type PromoBannerPhase = "may" | "june" | "pbtClub";

/**
 * 指定時刻 (既定は現在) の固定プロモバナー表示フェーズを返す。
 * - may: 〜JST 5/31 いっぱい (PBTOPEN30)
 * - june: JST 6/1 〜 7/31 いっぱい (CAMPFIRE30)
 * - pbtClub: JST 8/1 以降 (PBT CLUB 会員制度)
 *
 * epoch 比較のため閲覧者のローカル TZ に左右されない。
 */
export function getPromoBannerPhase(now: Date = new Date()): PromoBannerPhase {
  const time = now.getTime();
  if (time >= PBT_CLUB_START_UTC) return "pbtClub";
  if (time >= JUNE_PROMO_START_UTC) return "june";
  return "may";
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
