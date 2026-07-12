/**
 * 計測ループ(C4)純ロジックの再エクスポート。
 * 実体は `scripts/growth/metrics.ts`(GA4 取得・Notion 書きと共有する純ロジック)。
 * 承認画面(src 配下)からはこのモジュール経由で参照する。
 */

export * from "../../../scripts/growth/metrics";
