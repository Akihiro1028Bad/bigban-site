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

export interface PreviewUrlInput {
  siteUrl: string | null | undefined;
  secret: string | null | undefined;
  contentId: string;
  draftKey: string | null | undefined;
}

/**
 * プレビューURLを組み立てる。siteUrl / secret / draftKey のいずれかが欠けていれば null。
 * (env や draftKey が無くても通知自体は続行させるため、ここで例外を投げない。)
 */
export function previewUrlOrNull(input: PreviewUrlInput): string | null {
  if (!input.siteUrl || !input.secret || !input.draftKey) {
    return null;
  }
  return buildPreviewUrl({
    siteUrl: input.siteUrl,
    secret: input.secret,
    contentId: input.contentId,
    draftKey: input.draftKey,
  });
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

export interface DraftFailureInput {
  failedStage: string;
  error: string;
  specPath: string;
}

/**
 * 下書き投入が失敗したときの LINE 通知本文(沈黙させない=#24)。
 * 外部障害の可能性と、冪等(#21)に再開できる手順を伝える。
 */
export function buildDraftFailureMessage(input: DraftFailureInput): string {
  return [
    "下書きの投入に失敗しました(外部障害の可能性があります)。",
    `失敗した工程: ${input.failedStage}`,
    `理由: ${input.error}`,
    `本文・設定はステージ済み: ${input.specPath}`,
    "復旧後、同じ内容で再実行すれば重複なく再開できます:",
    `  npm run growth:publish-draft -- ${input.specPath}`,
    "  (または下書きモード全体の再実行: npm run growth:drafts)",
  ].join("\n");
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
