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

export interface PublishDueApplicationPorts {
  fetchCandidates: (nowMs: number) => Promise<PublishDueCandidate[]>;
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
export async function runPublishDueApplication(
  ports: PublishDueApplicationPorts,
  options: PublishDueApplicationOptions,
): Promise<PublishDueApplicationResult> {
  const candidates = await ports.fetchCandidates(options.nowMs);
  const partial: PublishDuePartial[] = [];
  let published = 0;

  if (!options.isDryRun) {
    for (const candidate of candidates) {
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
    if (published > 0) {
      await ports.notifyLine(`⏰ 予約公開: ${published}件 (対象 ${candidates.length}件)`);
    }
  }

  return { due: candidates.length, published, partial };
}
