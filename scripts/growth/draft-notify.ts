/**
 * 下書き作成完了を LINE 通知するためのメッセージ・プレビューURL組み立て(純関数)。
 *
 * プレビューURLは既存のプレビュー入口(`/api/draft/enable`, Pattern A)を使う。
 * 将来、管理画面で下書きを閲覧できるようになったら、ここの URL 組み立てだけを
 * 差し替えれば通知側は変更不要(URL生成を1箇所に集約している)。
 */

export interface DraftPreviewParams {
  /** 例: https://www.thepicklebang.com (末尾スラッシュは正規化する) */
  siteUrl: string;
  secret: string;
  contentId: string;
  draftKey: string;
}

/** プレビュー入口(Pattern A: contentId + draftKey)の URL を組み立てる。 */
export function buildPreviewUrl(params: DraftPreviewParams): string {
  const base = params.siteUrl.replace(/\/+$/, "");
  const query = new URLSearchParams({
    secret: params.secret,
    draftKey: params.draftKey,
    contentId: params.contentId,
  });
  return `${base}/api/draft/enable?${query.toString()}`;
}

export interface DraftNotifyItem {
  title: string;
  contentId: string;
  /** プレビューURL。draftKey が取れなかった場合は null。 */
  previewUrl: string | null;
}

/** 1記事分の行(タイトル + プレビュー or 下書きID)を作る。 */
function renderItem(item: DraftNotifyItem, index: number): string {
  const head = `${index + 1}. ${item.title}`;
  const detail = item.previewUrl
    ? `プレビュー: ${item.previewUrl}`
    : `下書きID: ${item.contentId}（プレビューURLは取得できませんでした）`;
  return `${head}\n${detail}`;
}

/** LINE へ送る下書き完了通知の本文を組み立てる。 */
export function buildDraftNotifyMessage(
  items: readonly DraftNotifyItem[]
): string {
  if (items.length === 0) {
    return "下書きは作成されませんでした。";
  }
  const header = `下書きを${items.length}件作成しました。`;
  const body = items.map(renderItem).join("\n\n");
  return `${header}\n\n${body}`;
}
