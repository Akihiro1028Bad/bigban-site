import os from "node:os";

import "dotenv/config";

import {
  buildWorkerLogProps,
  type WorkerRunStatus,
  type WorkerTargetType,
} from "../../src/lib/growth/workerLog";
import { createPage, updatePageProps, type NotionApiOptions } from "./notion";
import { defaultFetch } from "./http";

const DS_ENV = "GROWTH_WORKER_LOG_DS";

function notionOptions(): NotionApiOptions {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN が未設定です。");
  return { token, fetchFn: defaultFetch };
}

function workerId(): string {
  return process.env.GROWTH_WORKER_ID || os.hostname();
}

function dataSourceId(): string | null {
  return process.env[DS_ENV] || null;
}

function arg(name: string): string | null {
  const key = `--${name}`;
  const i = process.argv.indexOf(key);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

function targetType(value: string | null): WorkerTargetType {
  return value === "article" || value === "proposal" || value === "system" ? value : "system";
}

function status(value: string | null): WorkerRunStatus {
  const statuses: WorkerRunStatus[] = ["running", "failed", "success", "skipped", "heartbeat", "reconcile"];
  return statuses.includes(value as WorkerRunStatus) ? (value as WorkerRunStatus) : "running";
}

async function createLog(command: string): Promise<void> {
  const ds = dataSourceId();
  if (!ds) {
    process.stdout.write("disabled\n");
    return;
  }
  const now = new Date().toISOString();
  const mode = arg("mode") ?? command;
  const runStatus = command === "heartbeat" ? "heartbeat" : status(arg("status"));
  const props = buildWorkerLogProps({
    name: arg("name") ?? `${mode} ${runStatus}`,
    kind: arg("kind") ?? (command === "heartbeat" ? "heartbeat" : "job"),
    status: runStatus,
    mode,
    workerId: workerId(),
    targetPageId: arg("target-page-id"),
    targetTitle: arg("target-title"),
    targetType: targetType(arg("target-type")),
    startedAt: arg("started-at") ?? now,
    finishedAt: arg("finished-at"),
    recordedAt: arg("recorded-at") ?? now,
    exitCode: arg("exit-code") ? Number(arg("exit-code")) : null,
    resumeCommand: arg("resume"),
    detail: arg("detail"),
    evidenceKey: arg("evidence-key"),
  });
  const id = await createPage(ds, props, notionOptions());
  process.stdout.write(`${id}\n`);
}

async function finish(): Promise<void> {
  const pageId = arg("page-id");
  if (!pageId || pageId === "disabled") return;
  const now = new Date().toISOString();
  await updatePageProps(
    pageId,
    buildWorkerLogProps({
      name: arg("name") ?? `${arg("mode") ?? "job"} ${status(arg("status"))}`,
      kind: arg("kind") ?? "job",
      status: status(arg("status")),
      mode: arg("mode") ?? "",
      workerId: workerId(),
      targetPageId: arg("target-page-id"),
      targetTitle: arg("target-title"),
      targetType: targetType(arg("target-type")),
      startedAt: arg("started-at"),
      finishedAt: arg("finished-at") ?? now,
      recordedAt: arg("recorded-at") ?? now,
      exitCode: arg("exit-code") ? Number(arg("exit-code")) : null,
      resumeCommand: arg("resume"),
      detail: arg("detail"),
      evidenceKey: arg("evidence-key"),
    }),
    notionOptions()
  );
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "";
  if (command === "start" || command === "heartbeat" || command === "reconcile") {
    await createLog(command);
    return;
  }
  if (command === "finish") {
    await finish();
    return;
  }
  throw new Error("使い方: worker-log-cli <start|finish|heartbeat|reconcile> --mode <mode> ...");
}

main().catch((error: unknown) => {
  process.stderr.write(`[growth:worker-log] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
