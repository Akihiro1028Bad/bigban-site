import type { ClassKey } from "./types";

/** 早朝リピーター集計の固定値。判定基準を変えるときはこのファイルだけを直す。 */
export const CIRCLE_ID = 36659;
export const TENNISBEAR_BASE_URL = "https://www.tennisbear.net";
/** 早朝イベントとみなす開始時刻(JST)。タイトル文言には依存しない。 */
export const EARLY_START_TIME = "06:00";
/** テニスベアへの連続リクエストの間隔。 */
export const FETCH_INTERVAL_MS = 1000;
export const FETCH_TIMEOUT_MS = 30_000;

/** 主催者以外に参加者一覧から除外するスタッフのテニスベア ID。名前は書かない。 */
export const EXCLUDED_TB_USER_IDS: readonly number[] = [];

/** 曜日番号(`getUTCDay()`、2=火、4=木)から開催回のクラスを引く。載っていない曜日は「その他」。 */
export const CLASS_BY_WEEKDAY: Readonly<Record<number, ClassKey>> = { 2: "初中級", 4: "中級以上" };

/** 全体の状態判定の基準(累計)。クラス別の基準は CLASS_RULES。 */
export const RULES = {
  newMaxTotal: 2,
} as const;

/** クラス別の判定基準(そのクラスの開催済みの回だけで数える)。 */
export const CLASS_RULES = {
  recentWindow: 4,
  regularMin: 3,
  dormantMisses: 4,
  dormantMinTotal: 3,
  perfectMin: 3,
} as const;

/** LINE の所見で「前回 M/D」を出す、最終参加からの日数。 */
export const NOTE_LONG_GAP_DAYS = 28;

/** 節目。最後の値より先は MILESTONE_STEP_AFTER_LAST ごと。 */
export const MILESTONES = [5, 10, 20, 30, 50] as const;
export const MILESTONE_STEP_AFTER_LAST = 50;
