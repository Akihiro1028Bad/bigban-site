export function isCmsNewsEnabled(): boolean {
  return process.env.USE_CMS_NEWS === "true";
}

/**
 * 承認画面(/growth/approve)の合言葉認証フラグ。一旦オフ(false)にしている。
 *
 * 復元するにはこの値を `true` に戻すだけ(1行・env 設定は不要)。
 * - false: 合言葉ゲートを表示せず、承認/施策追加 API も token 検証をスキップする。
 *   URL を知る人なら誰でも承認/却下/施策追加できる一時措置(セキュリティ低下)。
 * - true : 現行どおり APPROVE_SECRET と入力合言葉の定数時間比較で保護する。
 *
 * クライアント・サーバ双方がこの定数を import するため、設定の手間ゼロで両層が一致する。
 */
export const APPROVE_AUTH_ENABLED = false;
