/**
 * 学習ログ(SI1)の薄い I/O 配線 CLI。
 *
 *   npm run growth:learning-log -- append <種別> <ペイロードJSONファイル>
 *   npm run growth:learning-log -- append-fail <mode> <exitCode> <detail>
 *   npm run growth:learning-log -- recent [週数]
 *
 * 純ロジック(イベント検証・差分要約・Notion props 組み立て・ページ parse)は learningLog.ts。
 * このファイルは Notion/LINE/状態ファイルの配線だけを担うためカバレッジ対象外。
 */

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { defaultFetch } from "./http";
import {
  appendLearningLog,
  buildLearningLogFailNotice,
  buildLearningLogProps,
  formatEditDiffSummary,
  LEARNING_EVENT_KINDS,
  parseLearningEvent,
  parseLearningLogPage,
  summarizeEditDiff,
} from "./learningLog";
import { pushTextMessage } from "./line";
import { createPage } from "./notion";
import { queryAllDataSource } from "./notionRepository";
import {
  failureSignature,
  shouldSendFailureNotice,
} from "./notify-throttle";

import type { LearningEvent, LearningEventKind } from "./learningLog";
import type { NotionApiOptions } from "./notion";
import type { NotifyThrottleRecord } from "./notify-throttle";

const DS = process.env.GROWTH_LEARNING_LOG_DS;
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const WINDOW_MS = 30 * 60 * 1000;
const THROTTLE_STATE_PATH = ".growth-tmp/learning-log-notify.json";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

function isLearningEventKind(value: string): value is LearningEventKind {
  return (LEARNING_EVENT_KINDS as readonly string[]).includes(value);
}

function failureSummary(event: Extract<LearningEvent, { kind: "工程失敗" }>): string {
  return `exit ${event.exitCode ?? "?"} / ${event.detail.slice(-500)}`;
}

function eventSummary(event: LearningEvent): { diffSummary: string; titleHeadline?: string; isNoChangeEdit: boolean } {
  switch (event.kind) {
    case "編集": {
      const diff = summarizeEditDiff(event.before, event.after);
      return {
        diffSummary: formatEditDiffSummary(diff),
        titleHeadline: diff.headline,
        isNoChangeEdit: diff.noChange,
      };
    }
    case "採否":
    case "不採用":
      return {
        diffSummary: formatEditDiffSummary(summarizeEditDiff(event.before, event.after)),
        isNoChangeEdit: false,
      };
    case "画像試行":
      return { diffSummary: "", isNoChangeEdit: false };
    case "工程失敗":
      return { diffSummary: failureSummary(event), isNoChangeEdit: false };
  }
}

function appendFailEvent(mode: string, exitCodeStr: string, detail: string): LearningEvent {
  const exitCode = Number(exitCodeStr);
  return {
    kind: "工程失敗",
    mode,
    exitCode: exitCodeStr === "" || Number.isNaN(exitCode) ? null : exitCode,
    detail,
  };
}

function readThrottleRecords(): NotifyThrottleRecord[] {
  if (!existsSync(THROTTLE_STATE_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(THROTTLE_STATE_PATH, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): NotifyThrottleRecord[] => {
      if (
        item &&
        typeof item === "object" &&
        "signature" in item &&
        "sentAtMs" in item &&
        typeof item.signature === "string" &&
        typeof item.sentAtMs === "number"
      ) {
        return [{ signature: item.signature, sentAtMs: item.sentAtMs }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function writeThrottleRecords(records: readonly NotifyThrottleRecord[]): void {
  mkdirSync(dirname(THROTTLE_STATE_PATH), { recursive: true });
  writeFileSync(THROTTLE_STATE_PATH, `${JSON.stringify(records)}\n`);
}

async function notifyThrottled(kind: LearningEventKind): Promise<void> {
  try {
    const signature = failureSignature("learning-log", kind);
    const decision = shouldSendFailureNotice(
      readThrottleRecords(),
      signature,
      Date.now(),
      WINDOW_MS
    );
    writeThrottleRecords(decision.records);
    if (!decision.send) return;

    const message = buildLearningLogFailNotice(kind);
    if (DRYRUN) {
      process.stdout.write(`[dry-run] LINE:\n${message}\n`);
      return;
    }
    await pushTextMessage(requireEnv("LINE_GROUP_ID"), message, {
      channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
      fetchFn: defaultFetch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`学習ログ失敗通知を送れませんでした: ${message}\n`);
  }
}

async function appendEvent(event: LearningEvent): Promise<void> {
  if (!DS) return;

  const { diffSummary, titleHeadline, isNoChangeEdit } = eventSummary(event);
  if (isNoChangeEdit) return;

  if (DRYRUN) {
    const props = buildLearningLogProps(event, new Date().toISOString(), diffSummary, titleHeadline);
    process.stdout.write(`[dry-run] CREATE ${DS}: ${JSON.stringify(props)}\n`);
    return;
  }

  const outcome = await appendLearningLog(event, {
    dataSourceId: DS,
    notionOptions: notionOptions(),
    createPageFn: createPage,
    nowIso: new Date().toISOString(),
    diffSummary,
    titleHeadline,
  });
  if (outcome.status === "failed") await notifyThrottled(event.kind);
}

async function append(kind: string, jsonPath: string): Promise<void> {
  if (!isLearningEventKind(kind)) throw new Error(`未知の種別です: ${kind}`);
  const event = parseLearningEvent(readFileSync(jsonPath, "utf-8"));
  if (!event) throw new Error("ペイロードJSONが不正です。");
  if (event.kind !== kind) throw new Error("種別が一致しません。");
  await appendEvent(event);
}

async function appendFail(mode: string, exitCodeStr: string, detail: string): Promise<void> {
  await appendEvent(appendFailEvent(mode, exitCodeStr, detail));
}

function weeksOf(value: string | undefined): number {
  const weeks = value ? Number(value) : 4;
  return Number.isFinite(weeks) && weeks > 0 ? weeks : 4;
}

async function recent(weeksStr: string | undefined): Promise<void> {
  const weeks = weeksOf(weeksStr);
  if (!DS) {
    process.stdout.write("[]\n");
    return;
  }

  const cutoffMs = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const pages = await queryAllDataSource(
    DS,
    {
      filter: {
        property: "記録時刻",
        date: { on_or_after: new Date(cutoffMs).toISOString() },
      },
      sorts: [{ property: "記録時刻", direction: "descending" }],
    },
    notionOptions()
  );
  process.stdout.write(`${JSON.stringify(pages.map(parseLearningLogPage))}\n`);
}

async function main(): Promise<void> {
  const [command, a, b, ...rest] = process.argv.slice(2);
  switch (command) {
    case "append":
      if (!a || !b) throw new Error("使い方: append <種別> <ペイロードJSONファイル>");
      return append(a, b);
    case "append-fail":
      if (!a || b === undefined) throw new Error("使い方: append-fail <mode> <exitCode> <detail>");
      return appendFail(a, b, rest.join(" "));
    case "recent":
      return recent(a);
    default:
      throw new Error(
        `使い方: learning-log-cli <append|append-fail|recent> ... (種別: ${LEARNING_EVENT_KINDS.join(", ")})`
      );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`learning-log-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
