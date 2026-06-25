#!/usr/bin/env node
/**
 * prebuild ガード(C1): 本番(Vercel production)デプロイで承認画面の認証が
 * 無効化されていないか検査する。APPROVE_AUTH_ENABLED=false での本番ビルドを
 * 失敗させ、認証フェイルオープンの再発を防ぐ。
 *
 * - VERCEL_ENV==="production" かつ APPROVE_AUTH_ENABLED==="false" のときだけ失敗する。
 * - ローカル/preview/CI ビルド(VERCEL_ENV 未設定 or "preview")には影響しない。
 */

const isProduction = process.env.VERCEL_ENV === "production";
const authDisabled = process.env.APPROVE_AUTH_ENABLED === "false";

if (isProduction && authDisabled) {
  console.error(
    "[check-prod-auth] APPROVE_AUTH_ENABLED=false で本番ビルドはできません。\n" +
      "承認画面の認証(合言葉ゲート/強権限API)が無効になります。\n" +
      "値を外す(未設定=ON)か true にしてからデプロイしてください。"
  );
  process.exit(1);
}

console.log("[check-prod-auth] OK: 本番認証ゲートは無効化されていません。");
