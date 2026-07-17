/** 予約データ取り込みの application 層。I/Oを注入し、状態遷移をテスト可能にする。 */
import { createHash } from "node:crypto";
import { join } from "node:path";

import { decodeSjis, detectCsvType, parseCsvRows, selectLatestByType } from "./labolaCsv";
import { buildCanonical, serializeJsonl } from "./labolaNormalize";
import { parseCustomerRows, parseSalesSummaryRows, parseYoyakuRows } from "./labolaSchemas";
import { computeWeeklyPeriods, jstDateString } from "./period";
import { formatIngestDigest, formatRemarksReview } from "./reservationDigest";
import { mergeExclusionRules } from "./reservationExclusions";
import { buildSnapshot } from "./snapshotBuild";
import { parseSnapshot } from "./snapshotSchema";
import { ymdSchema } from "./dateSchemas";
import type { ExclusionRules } from "./reservationExclusions";
import type { LabolaCsvType } from "./labolaCsv";
import type { Snapshot } from "./snapshotSchema";

export interface IngestFsEntry { name: string; isFile(): boolean; }
export interface IngestFs {
  access(path: string): Promise<void>;
  mkdir(path: string, options: { recursive?: boolean }): Promise<unknown>;
  readFile(path: string, encoding?: "utf8"): Promise<string | Uint8Array>;
  readdir(path: string, options: { withFileTypes: true }): Promise<IngestFsEntry[]>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { recursive?: boolean; force?: boolean }): Promise<void>;
  stat(path: string): Promise<{ mtimeMs: number }>;
  writeFile(path: string, content: string): Promise<void>;
  chmod?(path: string, mode: number): Promise<void>;
}

export interface IngestApplicationInput {
  dataDir: string;
  dropDir: string;
  hashKey: string;
  coverageStart: string;
  rules: ExclusionRules;
  extraEmailsCsv?: string;
  isDryRun: boolean;
}

export interface IngestApplicationDeps {
  fs: IngestFs;
  now: () => Date;
  notify: (text: string, kind: "weekly") => Promise<void>;
  log?: (message: string) => void;
}

interface ParsedFile { name: string; rows: string[][]; mtimeMs: number; type: LabolaCsvType | null; }

function asBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

/** 秘密鍵は十分な長さかつ前後空白なしの値だけを受け付ける。 */
export function validateHashKey(value: string): void {
  if (value !== value.trim() || value.trim().length < 32) throw new Error("工程 env: GROWTH_ANALYTICS_HASH_KEY は前後空白なしの32文字以上にしてください");
}

async function exists(fs: IngestFs, path: string): Promise<boolean> {
  try { await fs.access(path); return true; } catch { return false; }
}

async function restoreCanonical(fs: IngestFs, dataDir: string): Promise<void> {
  const canonical = join(dataDir, "canonical");
  const old = join(dataDir, "canonical.old");
  if (!(await exists(fs, canonical)) && await exists(fs, old)) await fs.rename(old, canonical);
}

async function acquireIngestLock(fs: IngestFs, dataDir: string): Promise<string> {
  const lock = join(dataDir, ".ingest-lock");
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.mkdir(lock, { recursive: false });
  } catch {
    throw new Error("工程 lock: 別の取り込みが実行中です");
  }
  return lock;
}

async function collectFiles(fs: IngestFs, dropDir: string): Promise<{ files: Map<LabolaCsvType, ParsedFile>; warnings: string[] }> {
  const parsed: ParsedFile[] = [];
  for (const entry of await fs.readdir(dropDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".csv")) continue;
    const path = join(dropDir, entry.name);
    const rows = parseCsvRows(decodeSjis(asBytes(await fs.readFile(path))));
    parsed.push({ name: entry.name, rows, mtimeMs: (await fs.stat(path)).mtimeMs, type: detectCsvType(rows[0] ?? []) });
  }
  const selection = selectLatestByType(parsed);
  const files = new Map<LabolaCsvType, ParsedFile>();
  for (const [type, name] of Object.entries(selection.selected) as [LabolaCsvType, string][]) {
    files.set(type, parsed.find((entry) => entry.name === name && entry.type === type) as ParsedFile);
  }
  return { files, warnings: selection.warnings };
}

async function readPreviousSnapshot(fs: IngestFs, dataDir: string, todayYmd: string): Promise<Snapshot | null> {
  const directory = join(dataDir, "snapshots");
  try {
    const names = (await fs.readdir(directory, { withFileTypes: true })).map((entry) => entry.name)
      .filter((name) => /^snapshot-.*\.json$/.test(name) && name !== `snapshot-${todayYmd}.json`).sort();
    if (names.length === 0) return null;
    const latest = names[names.length - 1] as string;
    return parseSnapshot(String(await fs.readFile(join(directory, latest), "utf8")));
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw new Error("previous-snapshotの読取または検証に失敗しました");
  }
}

async function promoteOutputs(input: { fs: IngestFs; dataDir: string; todayYmd: string; canonical: ReturnType<typeof buildCanonical>; snapshot: Snapshot }): Promise<void> {
  const { fs, dataDir, todayYmd, canonical, snapshot } = input;
  const canonicalDir = join(dataDir, "canonical");
  const tempDir = join(dataDir, "canonical.tmp");
  const oldDir = join(dataDir, "canonical.old");
  const snapshotDir = join(dataDir, "snapshots");
  const snapshotName = `snapshot-${todayYmd}.json`;
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  await Promise.all([
    fs.writeFile(join(tempDir, "reservations.jsonl"), serializeJsonl(canonical.reservations)),
    fs.writeFile(join(tempDir, "customers.jsonl"), serializeJsonl(canonical.customers)),
    fs.writeFile(join(tempDir, "sales_daily.jsonl"), serializeJsonl(canonical.salesDaily)),
    fs.writeFile(join(tempDir, "meta.json"), JSON.stringify(canonical.meta, null, 2)),
    fs.writeFile(join(tempDir, snapshotName), JSON.stringify(snapshot, null, 2)),
  ]);
  await fs.rm(oldDir, { recursive: true, force: true });
  if (await exists(fs, canonicalDir)) await fs.rename(canonicalDir, oldDir);
  await fs.rename(tempDir, canonicalDir);
  await fs.mkdir(snapshotDir, { recursive: true });
  await fs.rename(join(canonicalDir, snapshotName), join(snapshotDir, snapshotName));
  await fs.rm(oldDir, { recursive: true, force: true });
}

function digestMarkerPath(dataDir: string, todayYmd: string): string { return join(dataDir, "snapshots", `.digest-sent-${todayYmd}.json`); }
function digestHash(text: string): string { return createHash("sha256").update(text).digest("hex"); }

/**
 * 通知は at-least-once。送信成功後にマーカー書込が失敗すると次回再送される可能性がある。
 */
async function notifyDigest(fs: IngestFs, dataDir: string, todayYmd: string, digest: string, notify: (text: string, kind: "weekly") => Promise<void>, log: (message: string) => void): Promise<void> {
  const marker = digestMarkerPath(dataDir, todayYmd);
  const temporaryMarker = `${marker}.tmp`;
  const hash = digestHash(digest);
  let markerContent: string;
  try {
    markerContent = String(await fs.readFile(marker, "utf8"));
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== "ENOENT") throw new Error("ダイジェスト送信記録の読取に失敗しました");
    markerContent = "";
  }
  if (markerContent) {
    try {
      const previous: unknown = JSON.parse(markerContent);
      if (!previous || typeof previous !== "object" || typeof (previous as { hash?: unknown }).hash !== "string") throw new Error("marker_invalid");
      if ((previous as { hash: string }).hash === hash) { log("[ingest] 同一ダイジェストは送信済みのためスキップします"); return; }
    } catch {
      log("[ingest] ダイジェスト送信記録が破損しているため再送します");
    }
  }
  await notify(digest, "weekly");
  await fs.writeFile(temporaryMarker, JSON.stringify({ hash }));
  await fs.rename(temporaryMarker, marker);
}

export async function runIngestApplication(input: IngestApplicationInput, deps: IngestApplicationDeps): Promise<{ snapshot: Snapshot; wasDryRun: boolean }> {
  if (!ymdSchema.safeParse(input.coverageStart).success) throw new Error("工程 env: GROWTH_RESERVATION_COVERAGE_START が不正です");
  validateHashKey(input.hashKey);
  const log = deps.log ?? (() => undefined);
  let lock: string | null = null;
  if (!input.isDryRun) lock = await acquireIngestLock(deps.fs, input.dataDir);
  try {
  if (!input.isDryRun) await restoreCanonical(deps.fs, input.dataDir);
  const { files, warnings } = await collectFiles(deps.fs, input.dropDir);
  const yoyakuFile = files.get("yoyaku");
  if (!yoyakuFile) throw new Error("予約一覧詳細CSVが見つかりません");
  const yoyaku = parseYoyakuRows(yoyakuFile.rows);
  const customerFile = files.get("customer");
  const salesFile = files.get("salesSummary");
  const customers = customerFile ? parseCustomerRows(customerFile.rows) : null;
  const salesSummary = salesFile ? parseSalesSummaryRows(salesFile.rows) : null;
  const now = deps.now();
  const todayYmd = jstDateString(now);
  const canonical = buildCanonical({ yoyaku: yoyaku.rows, customers: customers?.rows ?? null, salesSummary: salesSummary?.rows ?? null, rules: mergeExclusionRules(input.rules, input.extraEmailsCsv), hashKey: input.hashKey, coverageStart: input.coverageStart, generatedAt: now.toISOString(), sourceSyncedAt: new Date(yoyakuFile.mtimeMs).toISOString(), parseWarnings: [...warnings, ...yoyaku.warnings, ...(customers?.warnings ?? []), ...(salesSummary?.warnings ?? [])] });
  canonical.meta.reservationsDigest = digestHash(serializeJsonl(canonical.reservations));
  const { current, prior } = computeWeeklyPeriods(now);
  const snapshot = buildSnapshot({ bundle: canonical, coverage: canonical.meta.coverage, sourceSyncedAt: canonical.meta.sourceSyncedAt, current, prior, todayYmd, previousSnapshot: await readPreviousSnapshot(deps.fs, input.dataDir, todayYmd) });
  if (input.isDryRun) { log(`[ingest] DRYRUN: 予約${canonical.reservations.length}件`); return { snapshot, wasDryRun: true }; }
  await promoteOutputs({ fs: deps.fs, dataDir: input.dataDir, todayYmd, canonical, snapshot });
  if (canonical.remarks.length > 0) {
    const remarksDir = join(input.dataDir, "remarks");
    await deps.fs.mkdir(remarksDir, { recursive: true });
    const remarksPath = join(remarksDir, `remarks-review-${todayYmd}.md`);
    await deps.fs.writeFile(remarksPath, formatRemarksReview(canonical.remarks, todayYmd));
    if (deps.fs.chmod) {
      try { await deps.fs.chmod(remarksPath, 0o600); } catch { log("[ingest] 備考レビューの権限設定に失敗しました"); }
    }
  } else {
    await deps.fs.rm(join(input.dataDir, "remarks", `remarks-review-${todayYmd}.md`), { recursive: false, force: true });
  }
  await notifyDigest(deps.fs, input.dataDir, todayYmd, formatIngestDigest(snapshot), deps.notify, log);
  return { snapshot, wasDryRun: false };
  } finally {
    if (lock !== null) await deps.fs.rm(lock, { recursive: true, force: true });
  }
}
