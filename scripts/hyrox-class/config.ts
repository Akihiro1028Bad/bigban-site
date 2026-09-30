/** HYROX DAISUKE CLASS 集計の固定値。判定基準を変えるときはこのファイルだけを直す。 */
import type { ClassType } from "./types";

export const DAISUKE_PATTERN = /daisuke/iu;
/** 利用歴で HYROX 系イベントとみなすイベント名。コートでは判定しない(ピックルのコートで記帳された HYROX イベントがある)。 */
export const HYROX_EVENT_PATTERN = /hyrox|ハイロックス|ピクロックス/iu;
/** 利用歴の短縮名。上から順に、最初に含まれていた語を使う。 */
export const HYROX_SHORT_NAMES = ["体験会", "モーニングクラス", "ミニシミュレーション", "ピクロックス"] as const;
export const HYROX_EVENT_FALLBACK = "HYROXイベント";
export const HYROX_COURT = "HYROX";
export const PICKLE_COURTS: readonly string[] = ["A:アルテミス", "B:ビックバン", "C:コメット"];
/** テスト予約(2026-09-29 のイベント名の埋め戻しと 2026-09-30 の実データ確認で特定)。集計のすべてから除外する。 */
export const EXCLUDED_RESERVATION_NOS: readonly string[] = ["#2", "#3", "#14", "#16", "#86", "#87", "#103", "#104", "#105"];

export const RULES = {
  newMaxTotal: 2,
  recentDays: 28,
  regularMin: 3,
  dormantDays: 28,
  dormantMinTotal: 3,
  streakMinWeeks: 2,
} as const;

/** クラスの並び。回数が同じときの優先順にも使う。 */
export const CLASS_ORDER: readonly ClassType[] = ["ビギナー", "通常", "ダブルス"];
/** LINE の回見出しのクラス名。 */
export const CLASS_HEADINGS: Readonly<Record<ClassType, string>> = { ビギナー: "ビギナーの部", 通常: "通常", ダブルス: "ダブルス" };
/** 所見の文中のクラス名。 */
export const CLASS_NOTE_LABELS: Readonly<Record<ClassType, string>> = { ビギナー: "ビギナー", 通常: "通常回", ダブルス: "ダブルス" };
