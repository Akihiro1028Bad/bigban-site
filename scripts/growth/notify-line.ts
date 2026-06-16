/**
 * 週次サマリーを LINE グループへ通知する実行入口。
 *
 *   npm run growth:notify-line
 *
 * 最新スナップショット(data/snapshots/<実行日>.json)を読み、Notion から
 * 承認待ち件数・上位施策・最新レポートを取得して LINE push する。
 * GROWTH_DRYRUN=1 なら送信せず本文を標準出力に表示する。
 * 薄い配線のためテスト対象外(ロジックは digest / notify-build / notion 等でテスト済み)。
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildDigestMessage } from "./digest";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import { getLatestReport, queryDataSource } from "./notion";
import {
  buildApproveUrl,
  buildPublicNotionUrl,
  extractActionTitles,
  extractMetrics,
  periodLabel,
} from "./notify-build";
import { jstDateString } from "./period";

// weekly.md と同じ data source ID(承認待ちの照会先・最新レポートの取得先)
const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460"; // 施策提案
const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const REPORT_DS = "27d6794f-4133-4cd4-9407-491d95c1b82b"; // 週次グロースレポート

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function statusFilter(value: string): unknown {
  return { property: "ステータス", select: { equals: value } };
}

async function main(): Promise<void> {
  const date = jstDateString(new Date());
  const file = path.resolve(process.cwd(), "data", "snapshots", `${date}.json`);
  const snapshot = JSON.parse(await readFile(file, "utf-8"));
  const metrics = extractMetrics(snapshot);

  let topActions: string[] = [];
  let pendingCount = 0;
  let reportUrl: string | null = null;

  const notionToken = process.env.NOTION_TOKEN;
  if (notionToken) {
    const opts = { token: notionToken, fetchFn: defaultFetch };
    const proposals = await queryDataSource(
      PROPOSAL_DS,
      { filter: statusFilter("未処理"), pageSize: 100 },
      opts
    );
    const ideas = await queryDataSource(
      IDEA_DS,
      { filter: statusFilter("提案中"), pageSize: 100 },
      opts
    );
    pendingCount = proposals.pages.length + ideas.pages.length;
    topActions = extractActionTitles(proposals.pages, "施策名", 3);

    const report = await getLatestReport(REPORT_DS, opts);
    reportUrl = report
      ? buildPublicNotionUrl(process.env.NOTION_PUBLIC_DOMAIN, report.id)
      : null;
  } else {
    process.stderr.write("NOTION_TOKEN 未設定のため承認待ち・レポートURLは省略します。\n");
  }

  const approveUrl = buildApproveUrl(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APPROVE_SECRET
  );

  const message = buildDigestMessage({
    periodLabel: periodLabel(snapshot),
    metrics,
    topActions,
    pendingCount,
    reportUrl,
    approveUrl,
  });

  if (process.env.GROWTH_DRYRUN) {
    process.stdout.write(`${message}\n`);
    return;
  }

  await pushTextMessage(requireEnv("LINE_GROUP_ID"), message, {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
  });
  process.stderr.write("LINE グループへ通知しました。\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`LINE 通知に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
