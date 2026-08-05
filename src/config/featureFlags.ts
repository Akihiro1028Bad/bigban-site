export function isCmsNewsEnabled(): boolean {
  return process.env.USE_CMS_NEWS === "true";
}

/**
 * コラム CMS(microCMS `columns` エンドポイント)の段階公開フラグ。
 * `USE_CMS_NEWS` と同じ運用パターン(#columns AD4)。
 * 未設定 / "true" 以外は false = ルートは notFound(P4)。dev で先行検証してから
 * 本番を `true` に切り替える。draftMode 時はフラグを無視してプレビュー描画する(§5.4)。
 */
export function isCmsColumnsEnabled(): boolean {
  return process.env.USE_CMS_COLUMNS === "true";
}
