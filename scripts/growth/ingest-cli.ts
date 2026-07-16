/** ラボーラCSV取り込みの薄いI/O入口。純ロジックは各モジュールへ委譲する。 */
import "dotenv/config";

import { access, readFile, readdir, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { detectCsvType, decodeSjis, parseCsvRows, type LabolaCsvType } from "./labolaCsv";
import { buildCanonical, serializeJsonl } from "./labolaNormalize";
import { parseCustomerRows, parseSalesSummaryRows, parseYoyakuRows } from "./labolaSchemas";
import { formatIngestDigest, formatRemarksReview } from "./reservationDigest";
import { mergeExclusionRules, parseExclusionRules } from "./reservationExclusions";
import { buildSnapshot } from "./snapshotBuild";
import { parseSnapshot } from "./snapshotSchema";
import { computeWeeklyPeriods, jstDateString } from "./period";
import { pushTextMessage } from "./line";
import { defaultFetch } from "./http";

interface CsvFile { path: string; modifiedAt: number; rows: string[][]; }
let stage = "初期化";
let selectionWarnings: string[] = [];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`工程 ingest: ${name} が未設定です`);
  return value;
}

async function latestCsvFiles(dropDir: string): Promise<Map<LabolaCsvType, CsvFile>> {
  const selected = new Map<LabolaCsvType, CsvFile>();
  for (const entry of await readdir(dropDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".csv")) continue;
    const path = join(dropDir, entry.name);
    const rows = parseCsvRows(decodeSjis(await readFile(path)));
    const type = detectCsvType(rows[0] ?? []);
    if (type === null) { const warning = `未知CSVを無視: ${entry.name}`; selectionWarnings.push(warning); console.warn(`[ingest] ${warning}`); continue; }
    const file = { path, modifiedAt: (await stat(path)).mtimeMs, rows };
    const previous = selected.get(type);
    if (previous && previous.modifiedAt >= file.modifiedAt) { const warning = `${type} CSVが複数のため古い方を無視`; selectionWarnings.push(warning); console.warn(`[ingest] ${warning}`); continue; }
    if (previous) { const warning = `${type} CSVが複数のため古い方を無視`; selectionWarnings.push(warning); console.warn(`[ingest] ${warning}`); }
    selected.set(type, file);
  }
  return selected;
}

async function previousSnapshot(dataDir: string, todayYmd: string) {
  try {
    const files = (await readdir(join(dataDir, "snapshots"))).filter((name) => /^snapshot-.*\.json$/.test(name) && name !== `snapshot-${todayYmd}.json`).sort();
    if (files.length === 0) return null;
    return parseSnapshot(await readFile(join(dataDir, "snapshots", files.at(-1) ?? ""), "utf8"));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("previous-snapshotの読取または検証に失敗しました"); }
}

async function writeOutputs(dataDir: string, todayYmd: string, bundle: ReturnType<typeof buildCanonical>, snapshot: ReturnType<typeof buildSnapshot>): Promise<void> {
  const canonicalDir = join(dataDir, "canonical");
  const tempDir = join(dataDir, "canonical.tmp");
  const oldDir = join(dataDir, "canonical.old");
  const snapshotDir = join(dataDir, "snapshots");
  const remarksDir = join(dataDir, "remarks");
  await rm(tempDir, { recursive: true, force: true });
  await rm(oldDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  await mkdir(snapshotDir, { recursive: true });
  await Promise.all([
    writeFile(join(tempDir, "reservations.jsonl"), serializeJsonl(bundle.reservations)), writeFile(join(tempDir, "customers.jsonl"), serializeJsonl(bundle.customers)), writeFile(join(tempDir, "sales_daily.jsonl"), serializeJsonl(bundle.salesDaily)), writeFile(join(tempDir, "meta.json"), JSON.stringify(bundle.meta, null, 2)),
    writeFile(join(snapshotDir, `snapshot-${todayYmd}.json`), JSON.stringify(snapshot, null, 2)),
  ]);
  try {
    await access(canonicalDir);
    await rename(canonicalDir, oldDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(tempDir, canonicalDir);
  await rm(oldDir, { recursive: true, force: true });
  if (bundle.remarks.length > 0) {
    await mkdir(remarksDir, { recursive: true });
    await writeFile(join(remarksDir, `remarks-review-${todayYmd}.md`), formatRemarksReview(bundle.remarks, todayYmd));
  }
}

async function notify(text: string): Promise<void> {
  const to = process.env.LINE_GROUP_ID; const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) { console.log("[ingest] LINE未設定のため通知を標準出力へフォールバック"); console.log(text); return; }
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch });
}

async function main(): Promise<void> {
  stage = "環境変数"; const dropDir = requireEnv("GROWTH_LABOLA_DROP_DIR"); const dataDir = requireEnv("GROWTH_RESERVATION_DATA_DIR"); const hashKey = requireEnv("GROWTH_ANALYTICS_HASH_KEY");
  console.log("[ingest] CSVを収集します");
  stage = "CSV収集"; const files = await latestCsvFiles(dropDir); const yoyakuFile = files.get("yoyaku");
  if (!yoyakuFile) throw new Error(`工程 ingest: 予約一覧詳細CSVが見つかりません。ラボーラからエクスポートして ${dropDir} に置き、npm run growth:ingest を再実行してください`);
  const yoyaku = parseYoyakuRows(yoyakuFile.rows);
  const customers = files.get("customer") ? parseCustomerRows(files.get("customer")!.rows) : null;
  const salesSummary = files.get("salesSummary") ? parseSalesSummaryRows(files.get("salesSummary")!.rows) : null;
  stage = "除外規則"; const rules = mergeExclusionRules(parseExclusionRules(await readFile(new URL("./assets/reservation-exclusions.json", import.meta.url), "utf8")), process.env.GROWTH_RESERVATION_EXCLUDE_EMAILS);
  const now = new Date(); const todayYmd = jstDateString(now);
  const bundle = buildCanonical({ yoyaku: yoyaku.rows, customers: customers?.rows ?? null, salesSummary: salesSummary?.rows ?? null, rules, hashKey, coverageStart: process.env.GROWTH_RESERVATION_COVERAGE_START || "2026-06-01", generatedAt: now.toISOString(), parseWarnings: [...selectionWarnings, ...yoyaku.warnings, ...(customers?.warnings ?? []), ...(salesSummary?.warnings ?? [])] });
  const { current, prior } = computeWeeklyPeriods(now);
  stage = "previous-snapshot"; const snapshot = buildSnapshot({ bundle, current, prior, todayYmd, previousSnapshot: await previousSnapshot(dataDir, todayYmd) });
  if (process.env.GROWTH_DRYRUN === "1") { console.log(`[ingest] DRYRUN: 予約${bundle.reservations.length}件(除外${bundle.meta.excludedCount})・気づき${snapshot.insights.length}件・missingSections=${bundle.meta.missingSections.join(",")}`); return; }
  console.log("[ingest] 正準データセットとスナップショットを書き込みます");
  stage = "書き込み"; await writeOutputs(dataDir, todayYmd, bundle, snapshot); stage = "LINE送信"; await notify(formatIngestDigest(snapshot));
}

main().catch(async (error: unknown) => {
  const message = `[ingest] 工程 ${stage} で失敗。再開: npm run growth:ingest`;
  console.error(message, error);
  try {
    await notify(message);
  } catch (notifyError) {
    console.error("[ingest] LINE失敗通知を送れません", notifyError);
  }
  process.exitCode = 1;
});
