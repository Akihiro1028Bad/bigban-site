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

import { buildDigestMessage, buildFailureMessage, clampAltText, extractReportSummary } from "./digest";
import { buildDigestFlex } from "./digest-flex";
import { defaultFetch } from "./http";
import { pushFlexMessage, pushTextMessage } from "./line";
import { listBlockChildren } from "./notion";
import { getLatestReport, queryAllDataSource } from "./notionRepository";
import {
  FAILURE_LOG_PATH,
  FAILURE_WINDOW_MS,
  buildFailureSummaryLine,
  countRecentFailures,
} from "./notifyGate";
import {
  buildApproveUrl,
  buildPublicNotionUrl,
  extractActionTitles,
  extractMetrics,
  periodLabel,
} from "./notify-build";
import { jstDateString } from "./period";
import { buildTokenExpiryWarning, parseExpiresAt } from "./token-expiry";
import type { ReportSummary } from "./digest";

const DEFAULT_WEEKLY_LOG = "data/weekly-cron.log";

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

/** トークン失効間近の警告行を組み立てる(設定が無ければ空配列)。 */
function tokenWarnings(): string[] {
  const expiresAt = parseExpiresAt(process.env.GROWTH_GOOGLE_TOKEN_EXPIRES_AT);
  const warning = buildTokenExpiryWarning({ expiresAt, now: Date.now() });
  return warning ? [warning] : [];
}

async function failureSummaryLine(): Promise<string> {
  let logText = "";
  try {
    logText = await readFile(path.resolve(process.cwd(), FAILURE_LOG_PATH), "utf-8");
  } catch {
    logText = "";
  }
  const count = countRecentFailures(logText, FAILURE_WINDOW_MS, Date.now());
  return buildFailureSummaryLine(count, FAILURE_LOG_PATH);
}

/** 週次実行が異常終了した場合のエラー通知。スナップショット等は読まない。 */
async function notifyFailure(): Promise<void> {
  const logPath = process.env.GROWTH_WEEKLY_LOG ?? DEFAULT_WEEKLY_LOG;
  const message = buildFailureMessage(logPath);

  if (process.env.GROWTH_DRYRUN) {
    process.stdout.write(`${message}\n`);
    return;
  }

  await pushTextMessage(requireEnv("LINE_GROUP_ID"), message, {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
    kind: "weekly",
  });
  process.stderr.write("LINE グループへ失敗を通知しました。\n");
}

async function main(): Promise<void> {
  if (process.env.GROWTH_NOTIFY_ERROR) {
    await notifyFailure();
    return;
  }

  const date = jstDateString(new Date());
  const file = path.resolve(process.cwd(), "data", "snapshots", `${date}.json`);
  const snapshot = JSON.parse(await readFile(file, "utf-8"));
  const metrics = extractMetrics(snapshot);

  let topActions: string[] = [];
  let pendingCount = 0;
  let reportUrl: string | null = null;
  let reportSummary: ReportSummary | undefined;

  const notionToken = process.env.NOTION_TOKEN;
  if (notionToken) {
    const opts = { token: notionToken, fetchFn: defaultFetch };
    const proposals = await queryAllDataSource(
      PROPOSAL_DS,
      { filter: statusFilter("未処理") },
      opts
    );
    const ideas = await queryAllDataSource(
      IDEA_DS,
      { filter: statusFilter("提案中") },
      opts
    );
    pendingCount = proposals.length + ideas.length;
    topActions = extractActionTitles(proposals, "施策名", 3);

    const report = await getLatestReport(REPORT_DS, opts);
    reportUrl = report
      ? buildPublicNotionUrl(process.env.NOTION_PUBLIC_DOMAIN, report.id)
      : null;
    if (report) {
      try {
        const children = await listBlockChildren(report.id, opts);
        reportSummary = extractReportSummary(children.blocks);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`週次レポート本文の要約取得を省略します: ${message}\n`);
      }
    }
  } else {
    process.stderr.write("NOTION_TOKEN 未設定のため承認待ち・レポートURLは省略します。\n");
  }

  const approveUrl = buildApproveUrl(process.env.NEXT_PUBLIC_SITE_URL);

  const digestInput = {
    periodLabel: periodLabel(snapshot),
    metrics,
    topActions,
    pendingCount,
    reportUrl,
    approveUrl,
    warnings: tokenWarnings(),
    reportSummary,
    // 実行時 SHA(#219): run.mjs が pull 後に渡す。デプロイ側 SHA とのスキュー確認用。
    sha: process.env.GROWTH_RUN_SHA,
  };
  // テキストは Flex 非対応環境向けの altText(フォールバック)として活用する。
  const summaryLine = await failureSummaryLine();
  const baseAltText = buildDigestMessage(digestInput);
  // Flex の altText は LINE の 400 字上限に収める(全文は Flex 本文側にある)。
  const altText = clampAltText(summaryLine ? `${baseAltText}\n\n${summaryLine}` : baseAltText);
  const flex = buildDigestFlex(digestInput);
  if (summaryLine) {
    flex.body?.contents.push({
      type: "text",
      text: summaryLine,
      size: "sm",
      weight: "bold",
      color: "#d97706",
      wrap: true,
    });
  }

  if (process.env.GROWTH_DRYRUN) {
    process.stdout.write(`${altText}\n`);
    return;
  }

  await pushFlexMessage(requireEnv("LINE_GROUP_ID"), altText, flex, {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
    kind: "weekly",
  });
  process.stderr.write("LINE グループへ通知しました。\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`LINE 通知に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
