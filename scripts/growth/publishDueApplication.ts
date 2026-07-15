export interface PublishDueCandidate {
  pageId: string;
  contentId: string;
  title: string;
  endpoint: string;
  patch: Readonly<Record<string, unknown>> | null;
}

export interface PublishDuePartial {
  title: string;
  contentId: string;
}

export interface PublishDueApplicationResult {
  due: number;
  published: number;
  partial: PublishDuePartial[];
}

export interface PublishDueItems<TDueItem> {
  items: TDueItem[];
  /** 到来予約総数。準備・ゲートで除外される記事も含む。 */
  total: number;
}

export interface PublishDueApplicationPorts<TDueItem = PublishDueCandidate> {
  fetchDueItems: (nowMs: number) => Promise<PublishDueItems<TDueItem>>;
  /** 公開直前同期・既知パス取得・公開ゲート評価を記事ごとに行う。null は公開対象外。 */
  prepareCandidate: (
    item: TDueItem,
    nowMs: number,
  ) => Promise<PublishDueCandidate | null>;
  patchDraft: (candidate: PublishDueCandidate) => Promise<void>;
  publishContent: (candidate: PublishDueCandidate) => Promise<void>;
  updatePublishedStatus: (candidate: PublishDueCandidate) => Promise<void>;
  clearSchedule: (candidate: PublishDueCandidate) => Promise<void>;
  notifyLine: (message: string) => Promise<void>;
  warn: (message: string) => void;
}

export interface PublishDueApplicationOptions {
  isDryRun: boolean;
  nowMs: number;
}

/** 予約公開の破壊的 I/O 順序と partial の境界を一箇所で保証する。 */
export async function runPublishDueApplication<TDueItem>(
  ports: PublishDueApplicationPorts<TDueItem>,
  options: PublishDueApplicationOptions,
): Promise<PublishDueApplicationResult> {
  const due = await ports.fetchDueItems(options.nowMs);
  const partial: PublishDuePartial[] = [];
  let published = 0;

  for (const item of due.items) {
    const candidate = await ports.prepareCandidate(item, options.nowMs);
    if (candidate === null || options.isDryRun) continue;
    if (candidate.patch !== null) await ports.patchDraft(candidate);
    await ports.publishContent(candidate);
    try {
      await ports.updatePublishedStatus(candidate);
    } catch {
      partial.push({ title: candidate.title, contentId: candidate.contentId });
      ports.warn(`Notion ステータス更新に失敗(公開は完了): ${candidate.title || candidate.pageId}`);
      published += 1;
      continue;
    }
    try {
      await ports.clearSchedule(candidate);
    } catch {
      ports.warn(`予約消去に失敗(公開は完了): ${candidate.title || candidate.pageId}`);
    }
    published += 1;
  }
  if (!options.isDryRun && published > 0) {
    await ports.notifyLine(`⏰ 予約公開: ${published}件 (対象 ${due.total}件)`);
  }

  return { due: due.total, published, partial };
}
