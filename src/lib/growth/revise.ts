/**
 * 構成案修正ループ(Epic #40)の純ロジックの再エクスポート。
 *
 * 実装は scripts/growth 側に集約し(headless poller と共有)、ここでは
 * `@/lib/growth/revise` で import できるよう薄く束ねるだけにする。
 */

export * from "../../../scripts/growth/revise";
