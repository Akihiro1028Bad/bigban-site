export function isCmsNewsEnabled(): boolean {
  return process.env.USE_CMS_NEWS === "true";
}

/**
 * 承認画面(/growth/approve)の合言葉認証フラグ。**フェイルセーフ(既定ON)**。
 *
 * - 未設定 / "false" 以外 → 有効(true): 本番で env 未設定でも認証が外れない(C1: フェイルオープン解消)。
 * - "false" のときだけ無効: 合言葉ゲートを出さず token 検証もスキップする(ローカル開発用)。
 * - 有効時は APPROVE_SECRET と入力合言葉の定数時間比較で保護する。
 *
 * サーバ(API ルート)は env の実値で判定する。クライアント束には server 環境変数が載らない
 * (Next.js が NEXT_PUBLIC_ 以外を undefined 化)ため、ブラウザ側では常に true=ゲート表示となり
 * 安全側へ倒れる(SEC-08: フラグ値や秘密は漏れない)。本番デプロイの誤無効化は
 * prebuild ガード(scripts/check-prod-auth.mjs)で検知する。
 */
export const APPROVE_AUTH_ENABLED = process.env.APPROVE_AUTH_ENABLED !== "false";
