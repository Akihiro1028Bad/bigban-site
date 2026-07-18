/** 予約データ取り込みの application 層。I/Oを注入し、状態遷移をテスト可能にする。 */
import { createHash } from "node:crypto";
import { join } from "node:path";

import { decodeSjis, detectCsvType, parseCsvRows, selectLatestByType } from "./labolaCsv";
import { buildCanonical, serializeJsonl } from "./labolaNormalize";
import { parseBlockedSlotRows, parseCustomerRows, parseProgramRows, parseSalesSummaryRows, parseYoyakuRows } from "./labolaSchemas";
import { computeWeeklyPeriods, jstDateString } from "./period";
import { formatIngestDigest, formatRemarksReview } from "./reservationDigest";
import { mergeExclusionRules } from "./reservationExclusions";
import { buildSnapshot } from "./snapshotBuild";
import { parseSnapshot } from "./snapshotSchema";
import { ymdSchema } from "./dateSchemas";
import { funnelCountsResultSchema } from "./labolaFunnel";
import type { ExclusionRules } from "./reservationExclusions";
import type { FunnelCounts } from "./labolaFunnel";
import type { LabolaCsvType } from "./labolaCsv";
import type { DateRange } from "./period";
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
  allowRowDrop: boolean;
  isDryRun: boolean;
}

export interface IngestApplicationDeps {
  fs: IngestFs;
  now: () => Date;
  notify: (text: string, kind: "weekly") => Promise<void>;
  uploadSnapshot?: (json: string) => Promise<void>;
  fetchFunnel?: (current: DateRange, prior: DateRange) => Promise<{ current: FunnelCounts; prior: FunnelCounts } | null>;
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

const LOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function acquireIngestLock(fs: IngestFs, dataDir: string, now: () => Date, log: (message: string) => void): Promise<string> {
  const lock = join(dataDir, ".ingest-lock");
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.mkdir(lock, { recursive: false });
  } catch {
    try {
      const ageMs = now().getTime() - (await fs.stat(lock)).mtimeMs;
      if (ageMs > LOCK_MAX_AGE_MS) {
        log("[ingest] 24時間超の残留lockを破棄して取り込みを再開します");
        await fs.rm(lock, { recursive: true, force: true });
        await fs.mkdir(lock, { recursive: false });
      } else {
        throw new Error("工程 lock: 別の取り込みが実行中です");
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "工程 lock: 別の取り込みが実行中です") throw error;
      throw new Error("工程 lock: 別の取り込みが実行中です");
    }
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
  // programだけはschool/event/individualの同型CSVを全採用する。他種別の最新選択規則は維持する。
  const programFiles = parsed.filter((entry) => entry.type === "program");
  const selection = selectLatestByType(parsed.filter((entry) => entry.type !== "program"));
  const files = new Map<LabolaCsvType, ParsedFile>();
  for (const [type, name] of Object.entries(selection.selected) as [LabolaCsvType, string][]) {
    files.set(type, parsed.find((entry) => entry.name === name && entry.type === type) as ParsedFile);
  }
  if (programFiles.length > 0) {
    const [first] = programFiles;
    const rows = [first.rows[0] as string[], ...programFiles.flatMap((file) => file.rows.slice(1))];
    files.set("program", { name: programFiles.map((file) => file.name).join(","), rows, mtimeMs: Math.max(...programFiles.map((file) => file.mtimeMs)), type: "program" });
  }
  return { files, warnings: selection.warnings };
}

/** 当日分を除いた直近の履歴を、集計に使いやすい古い順で読む。 */
export async function readSnapshotHistory(fs: IngestFs, dataDir: string, todayYmd: string, log: (message: string) => void): Promise<Snapshot[]> {
  const directory = join(dataDir, "snapshots");
  let names: string[];
  try {
    names = (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^snapshot-.*\.json$/.test(entry.name) && entry.name !== `snapshot-${todayYmd}.json`)
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left))
      .slice(0, 13);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const history: Snapshot[] = [];
  for (const name of names) {
    try {
      history.push(parseSnapshot(String(await fs.readFile(join(directory, name), "utf8"))));
    } catch {
      log(`[ingest] スナップショット履歴の読取に失敗したためスキップします: ${name}`);
    }
  }
  return history.reverse();
}

/** 当日分は履歴に含めず、基準入力だけに使う。破損しても取り込みを継続する。 */
async function readTodaySnapshot(fs: IngestFs, dataDir: string, todayYmd: string, log: (message: string) => void): Promise<Snapshot | null> {
  const name = `snapshot-${todayYmd}.json`;
  try {
    return parseSnapshot(String(await fs.readFile(join(dataDir, "snapshots", name), "utf8")));
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    log(`[ingest] スナップショット履歴の読取に失敗したためスキップします: ${name}`);
    return null;
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
    fs.writeFile(join(tempDir, "programs.jsonl"), serializeJsonl(canonical.programs)),
    fs.writeFile(join(tempDir, "blocked_slots.jsonl"), serializeJsonl(canonical.blockedSlots)),
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
function digestPendingPath(dataDir: string): string { return join(dataDir, "snapshots", ".digest-pending.json"); }
function digestHash(text: string): string { return createHash("sha256").update(text).digest("hex"); }

interface PendingDigest { text: string; hash: string; }

/** pendingファイルの内容を安全に検証する。I/Oを含めずテスト可能に保つ。 */
export function parsePendingDigest(value: string): PendingDigest | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const { text, hash } = parsed as { text?: unknown; hash?: unknown };
    return typeof text === "string" && text.length > 0 && typeof hash === "string" && hash === digestHash(text)
      ? { text, hash }
      : null;
  } catch {
    return null;
  }
}

async function readPendingDigest(fs: IngestFs, dataDir: string, log: (message: string) => void): Promise<PendingDigest | null> {
  const pendingPath = digestPendingPath(dataDir);
  let content: string;
  try {
    content = String(await fs.readFile(pendingPath, "utf8"));
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw new Error("保留ダイジェストの読取に失敗しました");
  }
  const pending = parsePendingDigest(content);
  if (pending !== null) return pending;
  log("[ingest] pendingダイジェストが破損しているため破棄します");
  await fs.rm(pendingPath, { force: true });
  return null;
}

async function writePendingDigest(fs: IngestFs, dataDir: string, digest: string): Promise<void> {
  const pendingPath = digestPendingPath(dataDir);
  const temporaryPath = `${pendingPath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify({ text: digest, hash: digestHash(digest) }));
  await fs.rename(temporaryPath, pendingPath);
}

async function hasSentDigest(fs: IngestFs, marker: string, hash: string, log: (message: string) => void): Promise<boolean> {
  let markerContent: string;
  try {
    markerContent = String(await fs.readFile(marker, "utf8"));
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== "ENOENT") throw new Error("ダイジェスト送信記録の読取に失敗しました");
    return false;
  }
  try {
    const previous: unknown = JSON.parse(markerContent);
    if (!previous || typeof previous !== "object" || typeof (previous as { hash?: unknown }).hash !== "string") throw new Error("marker_invalid");
    return (previous as { hash: string }).hash === hash;
  } catch {
    log("[ingest] ダイジェスト送信記録が破損しているため再送します");
    return false;
  }
}

async function writeDigestMarker(fs: IngestFs, marker: string, hash: string): Promise<void> {
  const temporaryMarker = `${marker}.tmp`;
  await fs.writeFile(temporaryMarker, JSON.stringify({ hash }));
  await fs.rename(temporaryMarker, marker);
}

/**
 * 通知は at-least-once。送信成功後にマーカー書込が失敗すると翌日を含む次回再送される可能性がある。
 */
async function notifyDigest(fs: IngestFs, dataDir: string, todayYmd: string, digest: string, notify: (text: string, kind: "weekly") => Promise<void>, log: (message: string) => void): Promise<void> {
  const marker = digestMarkerPath(dataDir, todayYmd);
  const hash = digestHash(digest);
  const pendingPath = digestPendingPath(dataDir);
  const pending = await readPendingDigest(fs, dataDir, log);
  const wasCurrentSent = await hasSentDigest(fs, marker, hash, log);

  if (pending !== null) {
    if (pending.hash === hash && wasCurrentSent) {
      await fs.rm(pendingPath, { force: true });
      log("[ingest] 送信済みのpendingダイジェストを破棄します");
      return;
    }
    await notify(pending.text, "weekly");
    await fs.rm(pendingPath, { force: true });
    if (pending.hash === hash) {
      await writeDigestMarker(fs, marker, hash);
      log("[ingest] pendingダイジェストが今回分と同一のため送信を完了しました");
      return;
    }
  }
  if (wasCurrentSent) { log("[ingest] 同一ダイジェストは送信済みのためスキップします"); return; }
  try {
    await notify(digest, "weekly");
  } catch (error: unknown) {
    await writePendingDigest(fs, dataDir, digest);
    throw error;
  }
  await writeDigestMarker(fs, marker, hash);
}

export async function runIngestApplication(input: IngestApplicationInput, deps: IngestApplicationDeps): Promise<{ snapshot: Snapshot; wasDryRun: boolean }> {
  if (!ymdSchema.safeParse(input.coverageStart).success) throw new Error("工程 env: GROWTH_RESERVATION_COVERAGE_START が不正です");
  validateHashKey(input.hashKey);
  const log = deps.log ?? (() => undefined);
  let lock: string | null = null;
  if (!input.isDryRun) lock = await acquireIngestLock(deps.fs, input.dataDir, deps.now, log);
  try {
  if (!input.isDryRun) await restoreCanonical(deps.fs, input.dataDir);
  const { files, warnings } = await collectFiles(deps.fs, input.dropDir);
  const yoyakuFile = files.get("yoyaku");
  if (!yoyakuFile) throw new Error("予約一覧詳細CSVが見つかりません");
  const yoyaku = parseYoyakuRows(yoyakuFile.rows);
  const customerFile = files.get("customer");
  const salesFile = files.get("salesSummary");
  const programFile = files.get("program");
  const blockedFile = files.get("blocked");
  const customers = customerFile ? parseCustomerRows(customerFile.rows) : null;
  const salesSummary = salesFile ? parseSalesSummaryRows(salesFile.rows) : null;
  const parsedPrograms = programFile ? parseProgramRows(programFile.rows) : null;
  const programs = parsedPrograms === null ? null : [...new Map(parsedPrograms.rows.map((program) => [`${program.name}\u0000${program.heldOn}\u0000${program.start}`, program])).values()];
  const blockedSlots = blockedFile ? parseBlockedSlotRows(blockedFile.rows) : null;
  const now = deps.now();
  const todayYmd = jstDateString(now);
  const canonical = buildCanonical({ yoyaku: yoyaku.rows, customers: customers?.rows ?? null, salesSummary: salesSummary?.rows ?? null, programs, blockedSlots: blockedSlots?.rows ?? null, rules: mergeExclusionRules(input.rules, input.extraEmailsCsv), hashKey: input.hashKey, coverageStart: input.coverageStart, generatedAt: now.toISOString(), sourceSyncedAt: new Date(yoyakuFile.mtimeMs).toISOString(), parseWarnings: [...warnings, ...yoyaku.warnings, ...(customers?.warnings ?? []), ...(salesSummary?.warnings ?? []), ...(parsedPrograms?.warnings ?? []), ...(blockedSlots?.warnings ?? [])] });
  canonical.meta.reservationsDigest = digestHash(serializeJsonl(canonical.reservations));
  const { current, prior } = computeWeeklyPeriods(now);
  let funnelCounts: { current: FunnelCounts; prior: FunnelCounts } | null = null;
  if (deps.fetchFunnel) {
    try {
      funnelCounts = funnelCountsResultSchema.nullable().parse(await deps.fetchFunnel(current, prior));
    } catch {
      log("[ingest] GA4ファネル取得に失敗しました(スナップショットはファネルなしで継続)");
      canonical.meta.warnings.push("GA4ファネル取得失敗");
    }
  }
  const [history, todaySnapshot] = await Promise.all([
    readSnapshotHistory(deps.fs, input.dataDir, todayYmd, log),
    readTodaySnapshot(deps.fs, input.dataDir, todayYmd, log),
  ]);
  const previousSnapshot = history.at(-1) ?? null;
  // 破損履歴を飛ばすとD11の行数急減比較が弱まるため、必ずスキップログを残して運用で追跡する。
  const baselineInputs = (todaySnapshot ?? previousSnapshot)?.meta.inputs ?? null;
  const snapshot = buildSnapshot({ bundle: canonical, coverage: canonical.meta.coverage, sourceSyncedAt: canonical.meta.sourceSyncedAt, current, prior, todayYmd, previousSnapshot, baselineInputs, funnelCounts, history });
  const hasRowDrop = snapshot.insights.some((insight) => insight.id === "d11:rowdrop:yoyaku");
  if (hasRowDrop && !input.allowRowDrop) throw new Error("工程 anomaly: 予約CSVの行数が前回から急減しています(絞り込みエクスポートの可能性)。入力を確認し、意図的な場合は GROWTH_INGEST_ALLOW_ROWDROP=1 で再実行してください");
  if (hasRowDrop) log("[ingest] 予約CSVの行数急減を許可して取り込みを続行します");
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
  await notifyDigest(deps.fs, input.dataDir, todayYmd, formatIngestDigest(snapshot, todayYmd), deps.notify, log);
  if (deps.uploadSnapshot) {
    try {
      await deps.uploadSnapshot(JSON.stringify(snapshot));
    } catch {
      // ローカルの正準データ・snapshot昇格を成功扱いに保ち、次回のlatest上書きで自然回復する。
      log("[ingest] ボードへのアップロードに失敗しました(ローカル処理は完了)");
    }
  }
  return { snapshot, wasDryRun: false };
  } finally {
    if (lock !== null) await deps.fs.rm(lock, { recursive: true, force: true });
  }
}
