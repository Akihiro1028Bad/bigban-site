/**
 * スタイリング・アドバイスの採用→本文反映(#165)の純ロジックを Web 層へ再エクスポートする。
 * 実体は scripts/growth/advise-apply.ts(PC・Web 双方が同じロジックを使う)。
 */
export * from "../../../scripts/growth/advise-apply";
