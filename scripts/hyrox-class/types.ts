/** HYROX DAISUKE CLASS 参加者集計の型。 */

/** DAISUKE CLASS のクラス。イベント名から判定する。 */
export type ClassType = "ビギナー" | "通常" | "ダブルス";

/** 予約台帳の予約種別。 */
export type ReservationKind = "イベント" | "スペース";

/** 予約台帳の1行(読む9列から必要なものだけ)。 */
export interface LedgerRow {
  reservationNo: string;
  name: string;
  /** JST の YYYY-MM-DD。 */
  date: string;
  /** 開始時刻 HH:MM。 */
  startTime: string;
  isCancelled: boolean;
  court: string | null;
  kind: ReservationKind;
  /** スペース予約・記帳漏れは空文字。 */
  eventName: string;
}

/** 開催回。キーは `{開催日}_{開始時刻}`。 */
export interface Session {
  key: string;
  date: string;
  startTime: string;
  classType: ClassType;
  eventName: string;
}

export type RecordStatus = "申込" | "キャンセル";

/** 参加記録(1人×1回)。キーは `{開催日}_{開始時刻}_{人キー}`。 */
export interface ClassRecord {
  key: string;
  sessionKey: string;
  date: string;
  startTime: string;
  classType: ClassType;
  personKey: string;
  reservationNos: string[];
  status: RecordStatus;
  /** 通算の何回目か。キャンセル・欠席は null。 */
  ordinal: number | null;
}

export interface Person {
  key: string;
  displayName: string;
}

export type PersonState = "新顔" | "常連" | "ご無沙汰" | "通常";

export interface PersonStats {
  key: string;
  displayName: string;
  total: number;
  classCounts: Record<ClassType, number>;
  firstDate: string | null;
  lastDate: string | null;
  state: PersonState;
  isNextApplied: boolean;
  /** 利用歴の要約(設計書 §8)。なければ空文字。 */
  history: string;
}

/** ① 参加者の「別名」列(スタッフ入力)。 */
export interface AliasLink {
  personKey: string;
  alias: string;
}
