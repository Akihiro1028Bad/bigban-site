/** ラボーラ取り込みの環境変数・Node I/O配線だけを担うCLI。 */
import "dotenv/config";

import { access, chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";

import { runIngestApplication } from "./ingestApplication";
import { analyticsSnapshotUploader } from "./analyticsUpload";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import { parseExclusionRules } from "./reservationExclusions";
import type { IngestFs } from "./ingestApplication";

const fs: IngestFs = {
  access: async (path) => access(path),
  mkdir: async (path, options) => mkdir(path, options),
  readFile: async (path, encoding) => encoding ? readFile(path, encoding) : readFile(path),
  readdir: async (path) => readdir(path, { withFileTypes: true }),
  rename: async (from, to) => rename(from, to),
  rm: async (path, options) => rm(path, options),
  stat: async (path) => stat(path),
  writeFile: async (path, content) => writeFile(path, content),
  chmod: async (path, mode) => chmod(path, mode),
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`工程 env: ${name} が未設定です`);
  return value;
}

async function notify(text: string, kind: "weekly" = "weekly"): Promise<void> {
  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) {
    console.log("[ingest] LINE未設定のため通知を標準出力へフォールバック");
    console.log(text);
    return;
  }
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch, kind });
}

async function main(): Promise<void> {
  const rules = parseExclusionRules(await readFile(new URL("./assets/reservation-exclusions.json", import.meta.url), "utf8"));
  await runIngestApplication({
    dataDir: requireEnv("GROWTH_RESERVATION_DATA_DIR"),
    dropDir: requireEnv("GROWTH_LABOLA_DROP_DIR"),
    hashKey: requireEnv("GROWTH_ANALYTICS_HASH_KEY"),
    coverageStart: process.env.GROWTH_RESERVATION_COVERAGE_START || "2026-06-01",
    rules,
    extraEmailsCsv: process.env.GROWTH_RESERVATION_EXCLUDE_EMAILS,
    allowRowDrop: process.env.GROWTH_INGEST_ALLOW_ROWDROP === "1",
    isDryRun: process.env.GROWTH_DRYRUN === "1",
  }, {
    fs,
    now: () => new Date(),
    notify,
    uploadSnapshot: analyticsSnapshotUploader(
      {
        GROWTH_ANALYTICS_UPLOAD_URL: process.env.GROWTH_ANALYTICS_UPLOAD_URL,
        GROWTH_ANALYTICS_INGEST_TOKEN: process.env.GROWTH_ANALYTICS_INGEST_TOKEN,
      },
      fetch,
      console.log
    ),
    log: console.log,
  });
}

main().catch(async (error: unknown) => {
  const message = "[ingest] 工程 ingest で失敗。再開: npm run growth:ingest";
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : "不明なエラー";
  console.error(message, detail);
  if (process.env.GROWTH_DRYRUN === "1") {
    process.exitCode = 1;
    return;
  }
  try {
    await notify(message, "weekly");
  } catch (notifyError: unknown) {
    const notifyDetail = notifyError instanceof Error ? `${notifyError.name}: ${notifyError.message}` : "不明なエラー";
    console.error("[ingest] LINE失敗通知を送れません", notifyDetail);
  }
  process.exitCode = 1;
});
