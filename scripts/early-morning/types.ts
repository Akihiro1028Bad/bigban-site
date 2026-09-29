/** テニスベアの参加ステータス。 */
export type TbUserStatus = "APPROVE" | "CANCEL";

/** テニスベアのイベント参加者。 */
export interface TbParticipant {
  userId: number;
  name: string;
  status: TbUserStatus;
  isGuest: boolean;
  appliedAt: string | null;
}

/** テニスベアのイベント概要。 */
export interface TbEventSummary {
  id: number;
  /** `+09:00` 付き ISO8601。 */
  startAt: string;
  isCallOff: boolean;
}

/** テニスベアのイベント詳細(参加者込み)。 */
export interface TbEventDetail extends TbEventSummary {
  participants: TbParticipant[];
  ignoredStatusCount: number;
}

/** LaBOLA の予約。 */
export interface LbReservation {
  reservationNo: string;
  name: string;
  /** JST の `YYYY-MM-DD`。 */
  date: string;
  timeSlot: string;
  isCancelled: boolean;
  receivedAt: string | null;
}

/** テニスベア ID と LaBOLA 表示名の紐付け。 */
export interface NameLink {
  tbId: number;
  lbName: string;
}

/** 参加経路。 */
export type Route = "テニスベア" | "LaBOLA" | "両方";

/** 出欠記録のステータス。 */
export type RecordStatus = "申込" | "キャンセル";

/** 開催回のクラス。火曜=初中級、木曜=中級以上、それ以外の曜日=その他。 */
export type SessionClass = "初中級" | "中級以上" | "その他";

/** クラス別の判定に使うクラス(その他を除く)。 */
export type ClassKey = Exclude<SessionClass, "その他">;

/** 早朝開催の1回。 */
export interface Session {
  /** JST の `YYYY-MM-DD`。 */
  date: string;
  tbEventIds: number[];
  isCallOff: boolean;
  classType: SessionClass;
}

/** 参加者(テニスベア/LaBOLA 名寄せ後)。 */
export interface Person {
  key: string;
  displayName: string;
  tbId: number | null;
  lbName: string | null;
}

/** 出欠記録。 */
export interface AttendanceRecord {
  key: string;
  /** JST の `YYYY-MM-DD`。 */
  date: string;
  personKey: string;
  route: Route;
  appliedAt: string | null;
  status: RecordStatus;
  /** `tb:{イベントID}` / `lb:{予約番号}`。 */
  sources: string[];
  /** 申込かつ欠席でない回だけ採番。それ以外は null。 */
  ordinal: number | null;
}

/** 参加者の状態区分。 */
export type PersonState = "新顔" | "常連" | "ご無沙汰" | "通常";

/** 参加者の集計結果。 */
export interface PersonStats extends Person {
  total: number;
  /** クラス別の参加回数(その他の回は含まない)。 */
  classCounts: Record<ClassKey, number>;
  streak: number;
  firstDate: string | null;
  lastDate: string | null;
  state: PersonState;
  nextMilestone: string;
  reachedMilestones: number[];
  isNextApplied: boolean;
}
