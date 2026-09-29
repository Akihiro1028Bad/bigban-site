/** 早朝リピーター集計の固定値。判定基準を変えるときはこのファイルだけを直す。 */
export const CIRCLE_ID = 36659;
export const TENNISBEAR_BASE_URL = "https://www.tennisbear.net";
/** 早朝イベントとみなす開始時刻(JST)。タイトル文言には依存しない。 */
export const EARLY_START_TIME = "06:00";
/** テニスベアへの連続リクエストの間隔。 */
export const FETCH_INTERVAL_MS = 1000;
export const FETCH_TIMEOUT_MS = 30_000;

/** 状態判定の基準(開催回単位)。 */
export const RULES = {
  recentWindow: 8,
  regularMinInWindow: 4,
  dormantMisses: 4,
  dormantMinTotal: 3,
  newMaxTotal: 2,
} as const;

/** 節目。最後の値より先は MILESTONE_STEP_AFTER_LAST ごと。 */
export const MILESTONES = [5, 10, 20, 30, 50] as const;
export const MILESTONE_STEP_AFTER_LAST = 50;
