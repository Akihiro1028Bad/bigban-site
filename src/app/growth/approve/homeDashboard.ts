import { splitPublishQueue } from "@/lib/growth/publishQueueView";

import { isActionable } from "./board";
import type { PendingItem } from "./types";

export interface DashboardView {
  proposalPending: number;
  articleAwaiting: number;
  publishReady: number;
  publishBlocked: number;
  pipeline: {
    proposals: number;
    production: number;
    publishWaiting: number;
    published: number;
  };
}

export function dashboardViewOf(
  items: readonly PendingItem[],
  decided: Record<string, string | undefined>,
): DashboardView {
  const proposals = items.filter((item) => item.kind === "proposal");
  const articles = items.filter((item) => item.kind === "idea");
  const queue = splitPublishQueue(articles);
  const publishWaiting = queue.ready.length + queue.scheduled.length + queue.blocked.length;
  return {
    proposalPending: proposals.filter((item) => item.stage === "proposed" && isActionable(item, decided)).length,
    articleAwaiting: articles.filter(
      (item) => item.stage !== "drafted" && isActionable(item, decided) && item.stage !== "published" && item.stage !== "rejected",
    ).length,
    publishReady: queue.ready.length,
    publishBlocked: queue.blocked.length,
    pipeline: {
      proposals: proposals.length,
      production: articles.filter((item) => item.stage !== "published").length,
      publishWaiting,
      published: articles.filter((item) => item.stage === "published").length,
    },
  };
}
