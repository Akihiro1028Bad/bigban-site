import { toPendingItems, DRAFT_READY_STATUS } from "../../src/lib/growth/approve";
import { reconcileGrowthState } from "../../src/lib/growth/reconcile";
import { buildWorkerLogProps, workerRunFromPage } from "../../src/lib/growth/workerLog";
import { createPage, queryDataSource, type NotionApiOptions } from "./notion";
import { defaultFetch } from "./http";

const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460";
const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a";
const STATUS_PROP = "ステータス";

function notionOptions(): NotionApiOptions {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN が未設定です。");
  return { token, fetchFn: defaultFetch };
}

function statusFilter(value: string): unknown {
  return { property: STATUS_PROP, select: { equals: value } };
}

async function main(): Promise<void> {
  const options = notionOptions();
  const proposals = await queryDataSource(
    PROPOSAL_DS,
    { filter: { or: [statusFilter("未処理"), statusFilter("承認"), statusFilter("成果物化済")] }, pageSize: 100 },
    options
  );
  const ideas = await queryDataSource(
    IDEA_DS,
    {
      filter: {
        or: [
          statusFilter("提案中"),
          statusFilter("承認"),
          statusFilter("生成中"),
          statusFilter(DRAFT_READY_STATUS),
          statusFilter("公開済み"),
        ],
      },
      pageSize: 100,
    },
    options
  );

  const workerDs = process.env.GROWTH_WORKER_LOG_DS;
  const workerPages = workerDs
    ? (await queryDataSource(workerDs, { sorts: [{ property: "記録時刻", direction: "descending" }], pageSize: 50 }, options)).pages
    : [];
  const runs = workerPages.map((page) => workerRunFromPage(page));
  const findings = reconcileGrowthState(toPendingItems(proposals.pages, ideas.pages), runs);

  process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);

  if (!workerDs) return;
  const now = new Date().toISOString();
  for (const finding of findings) {
    await createPage(
      workerDs,
      buildWorkerLogProps({
        name: `reconcile ${finding.severity}`,
        kind: finding.severity,
        status: "reconcile",
        mode: "reconcile",
        workerId: process.env.GROWTH_WORKER_ID || "reconcile",
        targetPageId: finding.targetPageId,
        targetTitle: finding.targetTitle,
        targetType: finding.targetPageId ? "article" : "system",
        recordedAt: now,
        detail: finding.detail,
      }),
      options
    );
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[growth:reconcile] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
