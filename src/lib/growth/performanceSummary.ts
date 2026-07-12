/**
 * 公開済み記事の記事タイプ別 成績サマリ純ロジック(#221)の再エクスポート。
 * 実体は `scripts/growth/performanceSummary.ts`(headless CLI と共有)。
 * 承認画面(src)からはこのモジュール経由で参照する(純ロジック分離規約)。
 */

export * from "../../../scripts/growth/performanceSummary";
