// @vitest-environment node
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePendingDigest, readSnapshotHistory, runIngestApplication } from "./ingestApplication";
import { snapshotSchema } from "./snapshotSchema";
import type { IngestFs } from "./ingestApplication";

const directories: string[] = [];
const fixture = new URL("./__fixtures__/labola/yoyaku_sjis.csv", import.meta.url);
const programFixture = new URL("./__fixtures__/labola/program_sjis.csv", import.meta.url);
const blockedFixture = new URL("./__fixtures__/labola/blocked_sjis.csv", import.meta.url);
const customerCsv = new Uint8Array([0x93, 0x6f, 0x98, 0x5e, 0x93, 0xfa, 0x2c, 0x8c, 0xda, 0x8b, 0x71, 0x83, 0x5e, 0x83, 0x43, 0x83, 0x76, 0x2c, 0x93, 0x6f, 0x98, 0x5e, 0x83, 0x58, 0x83, 0x65, 0x81, 0x5b, 0x83, 0x5e, 0x83, 0x58, 0x2c, 0x89, 0xef, 0x88, 0xf5, 0x94, 0xd4, 0x8d, 0x86, 0x28, 0x8e, 0xa9, 0x93, 0xae, 0x94, 0xad, 0x8d, 0x73, 0x29, 0x2c, 0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x83, 0x81, 0x81, 0x5b, 0x83, 0x8b, 0x83, 0x41, 0x83, 0x68, 0x83, 0x8c, 0x83, 0x58, 0x2c, 0x97, 0x58, 0x95, 0xd6, 0x94, 0xd4, 0x8d, 0x86, 0x2c, 0x8f, 0x5a, 0x8f, 0x8a, 0x2c, 0x90, 0xab, 0x95, 0xca, 0x2c, 0x90, 0xb6, 0x94, 0x4e, 0x8c, 0x8e, 0x93, 0xfa, 0x2c, 0x90, 0x45, 0x8b, 0xc6, 0x0a, 0x32, 0x30, 0x32, 0x36, 0x2f, 0x30, 0x37, 0x2f, 0x30, 0x31, 0x2c, 0x88, 0xea, 0x94, 0xca, 0x2c, 0x97, 0x4c, 0x8c, 0xf8, 0x2c, 0x31, 0x2c, 0x97, 0x98, 0x97, 0x70, 0x8e, 0xd2, 0x2c, 0x2c, 0x2c, 0x2c, 0x2c, 0x2c, 0x2c, 0x0a]);
// Shift_JIS: 売上日,レンタルスペース,イベント,会員費,売上合計
const salesSummaryCsv = new Uint8Array([0x94, 0x84, 0x8f, 0xe3, 0x93, 0xfa, 0x2c, 0x83, 0x8c, 0x83, 0x93, 0x83, 0x5e, 0x83, 0x8b, 0x83, 0x58, 0x83, 0x79, 0x81, 0x5b, 0x83, 0x58, 0x2c, 0x83, 0x43, 0x83, 0x78, 0x83, 0x93, 0x83, 0x67, 0x2c, 0x89, 0xef, 0x88, 0xf5, 0x94, 0xef, 0x2c, 0x94, 0x84, 0x8f, 0xe3, 0x8d, 0x87, 0x8c, 0x76, 0x0a, 0x32, 0x30, 0x32, 0x36, 0x2f, 0x30, 0x37, 0x2f, 0x30, 0x31, 0x2c, 0x30, 0x2c, 0x30, 0x2c, 0x30, 0x2c, 0x30, 0x0a]);

const fs: IngestFs = {
  access: async (path) => { await stat(path); },
  mkdir,
  readFile: async (path, encoding) => encoding ? readFile(path, encoding) : readFile(path),
  readdir: async (path) => readdir(path, { withFileTypes: true }),
  rename,
  rm,
  stat,
  writeFile,
};

async function setup(): Promise<{ root: string; drop: string; data: string }> {
  const root = await mkdtemp(join(tmpdir(), "growth-ingest-"));
  directories.push(root);
  const drop = join(root, "drop");
  const data = join(root, "data");
  await mkdir(drop);
  await copyFile(fixture, join(drop, "yoyaku.csv"));
  return { root, drop, data };
}

function input(dropDir: string, dataDir: string, isDryRun = false) {
  return { dropDir, dataDir, hashKey: "0123456789abcdef0123456789abcdef", coverageStart: "2026-06-01", rules: { emails: [], nameContains: [] }, allowRowDrop: false, isDryRun };
}

const deps = (notify: (text: string, kind: "weekly") => Promise<void> = async () => undefined) => ({ fs, now: () => new Date("2026-07-16T12:00:00+09:00"), notify, log: vi.fn() });

afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("runIngestApplication", () => {
  it("スナップショット履歴は今日を除く新しい13件を古い順に返し、破損分を通知してスキップする", async () => {
    const { data } = await setup();
    const snapshots = join(data, "snapshots");
    await mkdir(snapshots, { recursive: true });
    const valid = JSON.stringify(snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-01T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-01" }, analysis: { referenceYmd: "2026-07-01", currentWeek: { start: "2026-06-29", end: "2026-07-05" } }, meta: { sourceSyncedAt: "2026-07-01T00:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] }));
    for (let day = 1; day <= 14; day += 1) {
      const ymd = `2026-07-${String(day).padStart(2, "0")}`;
      await writeFile(join(snapshots, `snapshot-${ymd}.json`), valid.replaceAll("2026-07-01", ymd));
    }
    await writeFile(join(snapshots, "other.json"), valid);
    await mkdir(join(snapshots, "snapshot-2026-07-99.json"));
    await writeFile(join(snapshots, "snapshot-2026-07-15.json"), "{");
    const log = vi.fn();

    const history = await readSnapshotHistory(fs, data, "2026-07-14", log);

    expect(history).toHaveLength(12);
    expect(history.map((snapshot) => snapshot.generatedAt.slice(0, 10))).toEqual([
      "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06", "2026-07-07",
      "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13",
    ]);
    expect(log).toHaveBeenCalledWith("[ingest] スナップショット履歴の読取に失敗したためスキップします: snapshot-2026-07-15.json");
  });

  it("スナップショット履歴はディレクトリがなければ空配列にする", async () => {
    const { data } = await setup();
    await expect(readSnapshotHistory(fs, data, "2026-07-16", vi.fn())).resolves.toEqual([]);
  });

  it("スナップショット履歴はENOENT以外のreaddir失敗を投げ直す", async () => {
    const { data } = await setup();
    const brokenFs = { ...fs, readdir: async () => { throw Object.assign(new Error("permission denied"), { code: "EACCES" }); } };
    await expect(readSnapshotHistory(brokenFs as typeof fs, data, "2026-07-16", vi.fn())).rejects.toThrow("permission denied");
  });

  it("履歴の予約数中央値をonTheBooksへ焼き込む", async () => {
    const { drop, data } = await setup();
    await runIngestApplication(input(drop, data), deps());
    const original = JSON.parse(await readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")) as { series: { onTheBooks: { reservations: number }[] } };
    for (let day = 1; day <= 6; day += 1) {
      const snapshot = structuredClone(original);
      for (const point of snapshot.series.onTheBooks) point.reservations = day * 10;
      await writeFile(join(data, "snapshots", `snapshot-2026-07-${String(day).padStart(2, "0")}.json`), JSON.stringify(snapshot));
    }

    const result = await runIngestApplication(input(drop, data), deps());

    expect(result.snapshot.series.onTheBooks?.every((point) => point.baselineMedian === 35)).toBe(true);
  });
  it("当日スナップショットが破損していても取り込みを継続してスキップを記録する", async () => {
    const { drop, data } = await setup();
    await runIngestApplication(input(drop, data), deps());
    await writeFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "{");
    const log = vi.fn();
    const brokenDeps = { ...deps(), log };

    await expect(runIngestApplication(input(drop, data), brokenDeps)).resolves.toMatchObject({ wasDryRun: false });
    expect(log).toHaveBeenCalledWith("[ingest] スナップショット履歴の読取に失敗したためスキップします: snapshot-2026-07-16.json");
  });

  it("pendingダイジェストは本文と一致するhashだけを受け付ける", () => {
    const text = "保留中の本文";
    const hash = createHash("sha256").update(text).digest("hex");
    expect(parsePendingDigest(JSON.stringify({ text, hash }))).toEqual({ text, hash });
    expect(parsePendingDigest("{")).toBeNull();
    expect(parsePendingDigest("null")).toBeNull();
    expect(parsePendingDigest("[]")).toBeNull();
    expect(parsePendingDigest(JSON.stringify({ text, hash: "不正" }))).toBeNull();
    expect(parsePendingDigest(JSON.stringify({ text: 1, hash }))).toBeNull();
    expect(parsePendingDigest(JSON.stringify({ text: "", hash: createHash("sha256").update("").digest("hex") }))).toBeNull();
  });

  it("正準データとスナップショットをtmp世代から昇格し、既定通知を送る", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn<(text: string, kind: "weekly") => Promise<void>>(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    await expect(readFile(join(data, "canonical", "reservations.jsonl"), "utf8")).resolves.toContain("reservationId");
    const meta = JSON.parse(await readFile(join(data, "canonical", "meta.json"), "utf8")) as { reservationsDigest: string };
    expect(meta.reservationsDigest).toMatch(/^[a-f0-9]{64}$/);
    await expect(readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")).resolves.toContain("schemaVersion");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.any(String), "weekly");
    await expect(stat(join(data, "canonical.old"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("promoteとLINE通知の後に検証済みスナップショットをボードへアップロードする", async () => {
    const { drop, data } = await setup();
    const order: string[] = [];
    const uploadSnapshot = vi.fn(async (json: string) => {
      order.push("upload");
      expect(snapshotSchema.safeParse(JSON.parse(json)).success).toBe(true);
    });
    const notify = vi.fn(async () => { order.push("notify"); });

    await runIngestApplication(input(drop, data), {
      ...deps(notify),
      uploadSnapshot,
    });

    expect(uploadSnapshot).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["notify", "upload"]);
    await expect(readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")).resolves.toContain("schemaVersion");
  });

  it("ボードへのアップロードがタイムアウトしてもローカル取り込みを完了し警告する", async () => {
    const { drop, data } = await setup();
    const log = vi.fn();
    const uploadSnapshot = vi.fn(async () => { throw new DOMException("The operation timed out", "TimeoutError"); });

    await expect(runIngestApplication(input(drop, data), {
      ...deps(),
      log,
      uploadSnapshot,
    })).resolves.toMatchObject({ wasDryRun: false });

    expect(log).toHaveBeenCalledWith("[ingest] ボードへのアップロードに失敗しました(ローカル処理は完了)");
    await expect(readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")).resolves.toContain("schemaVersion");
  });

  it("アップロード依存が未設定ならP1互換でローカル取り込みだけを完了する", async () => {
    const { drop, data } = await setup();
    await expect(runIngestApplication(input(drop, data), deps())).resolves.toMatchObject({ wasDryRun: false });
    await expect(readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")).resolves.toContain("schemaVersion");
  });

  it("tmpだけが残ったクラッシュ後も再実行で正しく昇格する", async () => {
    const { drop, data } = await setup();
    await mkdir(join(data, "canonical.tmp"), { recursive: true });
    await writeFile(join(data, "canonical.tmp", "partial"), "partial");
    await runIngestApplication(input(drop, data), deps());
    await expect(readFile(join(data, "canonical", "meta.json"), "utf8")).resolves.toContain("coverage");
  });

  it("canonical消失とold残存時は復旧してから更新する", async () => {
    const { drop, data } = await setup();
    await mkdir(join(data, "canonical.old"), { recursive: true });
    await writeFile(join(data, "canonical.old", "old-only"), "old");
    await runIngestApplication(input(drop, data), deps());
    await expect(stat(join(data, "canonical", "meta.json"))).resolves.toBeDefined();
    await expect(stat(join(data, "canonical.old"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("promoteでcanonicalをoldへ移した直後に失敗しても次回起動で復旧する", async () => {
    const { drop, data } = await setup();
    await runIngestApplication(input(drop, data), deps());
    let shouldFail = true;
    const failingFs: IngestFs = {
      ...fs,
      rename: async (from, to) => {
        await fs.rename(from, to);
        if (shouldFail && from.endsWith("canonical") && to.endsWith("canonical.old")) {
          shouldFail = false;
          throw new Error("rename injected failure");
        }
      },
    };
    await expect(runIngestApplication(input(drop, data), { ...deps(), fs: failingFs })).rejects.toThrow("rename injected failure");
    await expect(stat(join(data, "canonical"))).rejects.toMatchObject({ code: "ENOENT" });
    await runIngestApplication(input(drop, data), deps());
    await expect(readFile(join(data, "canonical", "meta.json"), "utf8")).resolves.toContain("coverage");
  });

  it("取り込みlockが取得済みなら日本語エラーで停止し、hash keyの弱値も停止する", async () => {
    const { drop, data } = await setup();
    await mkdir(join(data, ".ingest-lock"), { recursive: true });
    await expect(runIngestApplication(input(drop, data), deps())).rejects.toThrow("工程 lock: 別の取り込みが実行中です");
    await rm(join(data, ".ingest-lock"), { recursive: true, force: true });
    await expect(runIngestApplication({ ...input(drop, data), hashKey: " short-key " }, deps())).rejects.toThrow("工程 env: GROWTH_ANALYTICS_HASH_KEY");
  });

  it("24時間超の残留lockは警告して破棄し、取り込みを再開する", async () => {
    const { drop, data } = await setup();
    const lock = join(data, ".ingest-lock");
    await mkdir(lock, { recursive: true });
    await utimes(lock, new Date("2026-07-15T10:00:00+09:00"), new Date("2026-07-15T10:00:00+09:00"));
    const log = vi.fn();
    await runIngestApplication(input(drop, data), { ...deps(), log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("残留lockを破棄"));
    await expect(stat(join(data, "canonical", "meta.json"))).resolves.toBeDefined();
  });

  it("残留lockの破棄に失敗した場合はlock取得エラーとして停止する", async () => {
    const { drop, data } = await setup();
    const lock = join(data, ".ingest-lock");
    await mkdir(lock, { recursive: true });
    await utimes(lock, new Date("2026-07-15T10:00:00+09:00"), new Date("2026-07-15T10:00:00+09:00"));
    const failingFs: IngestFs = {
      ...fs,
      rm: async (path, options) => {
        if (path.endsWith(".ingest-lock")) throw new Error("EACCES");
        return rm(path, options);
      },
    };
    await expect(runIngestApplication(input(drop, data), { ...deps(), fs: failingFs })).rejects.toThrow(
      "工程 lock: 別の取り込みが実行中です"
    );
  });

  it("DRYRUNでは書込みも通知も行わない", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn(async () => undefined);
    const result = await runIngestApplication(input(drop, data, true), deps(notify));
    expect(result.wasDryRun).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    await expect(stat(join(data, "canonical"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("GA4ファネル取得成功時はスナップショットにcaptureを含める", async () => {
    const { drop, data } = await setup();
    const fetchFunnel = vi.fn(async () => ({
      current: {
        intent: 12,
        rental: { input: 8, confirm: 6, pending: 5, complete: 4 },
        program: { input: 3, confirm: 2, pending: 2, complete: 1 },
      },
      prior: {
        intent: 9,
        rental: { input: 6, confirm: 5, pending: 4, complete: 3 },
        program: { input: 2, confirm: 1, pending: 1, complete: 1 },
      },
    }));

    const result = await runIngestApplication(input(drop, data), { ...deps(), fetchFunnel });

    expect(fetchFunnel).toHaveBeenCalledWith({ start: "2026-07-06", end: "2026-07-12" }, { start: "2026-06-29", end: "2026-07-05" });
    expect(result.snapshot.funnel).toMatchObject({
      current: { rental: { complete: 4 }, program: { complete: 1 } },
      capture: { ga4Complete: 5 },
    });
  });

  it("GA4ファネル取得失敗時も取り込みを継続し、警告を記録する", async () => {
    const { drop, data } = await setup();
    const log = vi.fn();

    const result = await runIngestApplication(input(drop, data), {
      ...deps(),
      log,
      fetchFunnel: async () => { throw new Error("GA4失敗"); },
    });

    expect(result.snapshot.funnel).toBeUndefined();
    expect(result.snapshot.meta.warnings).toContain("GA4ファネル取得失敗");
    expect(log).toHaveBeenCalledWith("[ingest] GA4ファネル取得に失敗しました(スナップショットはファネルなしで継続)");
  });

  it("GA4ファネルにNaNが含まれる場合も取り込みを継続し、警告を記録する", async () => {
    const { drop, data } = await setup();
    const log = vi.fn();

    const result = await runIngestApplication(input(drop, data), {
      ...deps(),
      log,
      fetchFunnel: async () => ({
        current: { intent: Number.NaN, rental: { input: 0, confirm: 0, pending: 0, complete: 0 }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } },
        prior: { intent: 0, rental: { input: 0, confirm: 0, pending: 0, complete: 0 }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } },
      }),
    });

    expect(result.snapshot.funnel).toBeUndefined();
    expect(result.snapshot.meta.warnings).toContain("GA4ファネル取得失敗");
    expect(log).toHaveBeenCalledWith("[ingest] GA4ファネル取得に失敗しました(スナップショットはファネルなしで継続)");
  });

  it("GA4ファネル取得がnullなら警告なしでファネルを省略する", async () => {
    const { drop, data } = await setup();

    const result = await runIngestApplication(input(drop, data), {
      ...deps(),
      fetchFunnel: async () => null,
    });

    expect(result.snapshot.funnel).toBeUndefined();
    expect(result.snapshot.meta.warnings).not.toContain("GA4ファネル取得失敗");
  });

  it("DRYRUNでもGA4ファネルを読み取る", async () => {
    const { drop, data } = await setup();
    const fetchFunnel = vi.fn(async () => null);

    await runIngestApplication(input(drop, data, true), { ...deps(), fetchFunnel });

    expect(fetchFunnel).toHaveBeenCalledTimes(1);
  });

  it("DRYRUNで予約CSV不足に失敗しても通知しない", async () => {
    const { drop, data } = await setup();
    await rm(join(drop, "yoyaku.csv"));
    const notify = vi.fn(async () => undefined);
    await expect(runIngestApplication(input(drop, data, true), deps(notify))).rejects.toThrow("予約一覧詳細CSVが見つかりません");
    expect(notify).not.toHaveBeenCalled();
  });

  it("8日前mtimeのCSVを今日取り込んでもsourceSyncedAtと収録終了日はCSV時点のまま", async () => {
    const { drop, data } = await setup();
    await utimes(join(drop, "yoyaku.csv"), new Date("2026-07-08T15:30:00Z"), new Date("2026-07-08T15:30:00Z"));
    await runIngestApplication(input(drop, data), deps());
    const meta = JSON.parse(await readFile(join(data, "canonical", "meta.json"), "utf8")) as { sourceSyncedAt: string; coverage: { end: string } };
    expect(meta.sourceSyncedAt).toBe("2026-07-08T15:30:00.000Z");
    expect(meta.coverage.end).toBe("2026-07-09");
  });

  it("log未指定のDRYRUNでは通知せず結果を返す", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn(async () => undefined);
    await expect(runIngestApplication(input(drop, data, true), { fs, now: () => new Date("2026-07-16T12:00:00+09:00"), notify })).resolves.toMatchObject({ wasDryRun: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it("予約一覧詳細CSVがなければ任意CSVを処理せず停止する", async () => {
    const { drop, data } = await setup();
    await rm(join(drop, "yoyaku.csv"));
    await expect(runIngestApplication(input(drop, data), deps())).rejects.toThrow("予約一覧詳細CSVが見つかりません");
  });

  it("顧客・売上CSVと備考を正準出力へ含める", async () => {
    const { drop, data } = await setup();
    await writeFile(join(drop, "customer.csv"), customerCsv);
    await writeFile(join(drop, "sales.csv"), salesSummaryCsv);
    await runIngestApplication(input(drop, data), deps());
    await expect(readFile(join(data, "canonical", "customers.jsonl"), "utf8")).resolves.toContain('"pseudoId":');
    await expect(readFile(join(data, "canonical", "sales_daily.jsonl"), "utf8")).resolves.toContain('"total":0');
    await expect(readFile(join(data, "remarks", "remarks-review-2026-07-16.md"), "utf8")).resolves.toContain("備考");
  });

  it("同型のプログラムCSVを連結し、重複プログラムは正準出力で一件にする", async () => {
    const { drop, data } = await setup();
    await copyFile(programFixture, join(drop, "school.csv"));
    await copyFile(programFixture, join(drop, "event.csv"));
    await runIngestApplication(input(drop, data), deps());
    const programs = (await readFile(join(data, "canonical", "programs.jsonl"), "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as { name: string; start: string })
      .map(({ name, start }) => ({ name, start }));
    expect(programs).toEqual([
      { name: "はじめてクラス", start: "10:00" },
      { name: "交流イベント", start: "18:00" },
    ]);
  });

  it("備考がなければ当日既存のレビューを削除する", async () => {
    const { drop, data } = await setup();
    const contents = await readFile(fixture);
    const firstDataRowEnd = contents.indexOf(0x0a, contents.indexOf(0x0a) + 1);
    await writeFile(join(drop, "yoyaku.csv"), contents.subarray(0, firstDataRowEnd + 1));
    await mkdir(join(data, "remarks"), { recursive: true });
    await writeFile(join(data, "remarks", "remarks-review-2026-07-16.md"), "古い備考");
    await runIngestApplication(input(drop, data), deps());
    await expect(stat(join(data, "remarks", "remarks-review-2026-07-16.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("未知CSV・重複CSVの警告をmetaへ統合し、不正なcoverage環境値を停止する", async () => {
    const { drop, data } = await setup();
    const duplicate = join(drop, "yoyaku-copy.csv");
    await copyFile(fixture, duplicate);
    await utimes(duplicate, new Date(0), new Date(0));
    await writeFile(join(drop, "unknown.csv"), "foo,bar\n1,2\n");
    await runIngestApplication(input(drop, data), deps());
    const snapshot = JSON.parse(await readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")) as { meta: { warnings: string[] } };
    expect(snapshot.meta.warnings).toEqual(expect.arrayContaining([expect.stringContaining("未知種別のCSV"), expect.stringContaining("yoyaku CSVが複数")]));
    await expect(runIngestApplication({ ...input(drop, data), coverageStart: "2026-02-30" }, deps())).rejects.toThrow("工程 env");
  });

  it("文字列CSVを復号し、ディレクトリと非CSVファイルを無視する", async () => {
    const { drop, data } = await setup();
    await mkdir(join(drop, "ignored-directory"));
    await writeFile(join(drop, "ignored.txt"), new Uint8Array([0x80]));
    await writeFile(join(drop, "unknown.csv"), "placeholder");
    await writeFile(join(drop, "empty.csv"), "");
    const stringFs: IngestFs = {
      ...fs,
      readFile: async (path, encoding) => path.endsWith("unknown.csv") ? "foo,bar\n1,2\n" : fs.readFile(path, encoding),
    };
    await runIngestApplication(input(drop, data), { ...deps(), fs: stringFs });
    const snapshot = JSON.parse(await readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")) as { meta: { warnings: string[] } };
    expect(snapshot.meta.warnings).toEqual(expect.arrayContaining(["未知種別のCSVを2件無視"]));
  });

  it("前回スナップショットの破損をログしてスキップし、取り込みを継続する", async () => {
    const { drop, data } = await setup();
    await mkdir(join(data, "snapshots"), { recursive: true });
    await writeFile(join(data, "snapshots", "snapshot-2026-07-15.json"), "{");
    const log = vi.fn();
    await expect(runIngestApplication(input(drop, data), { ...deps(), log })).resolves.toMatchObject({ wasDryRun: false });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("snapshot-2026-07-15.json"));
  });

  it("予約CSVの行数急減時は昇格もダイジェスト送信もせず、allowRowDropなら警告して続行する", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn<(text: string, kind: "weekly") => Promise<void>>(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    const canonicalBefore = await readFile(join(data, "canonical", "reservations.jsonl"), "utf8");
    const currentSnapshot = snapshotSchema.parse(JSON.parse(await readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")));
    await writeFile(join(data, "snapshots", "snapshot-2026-07-15.json"), JSON.stringify({ ...currentSnapshot, meta: { ...currentSnapshot.meta, inputs: [{ type: "yoyaku", rows: 100 }] } }));
    await rm(join(data, "snapshots", "snapshot-2026-07-16.json"));
    await expect(runIngestApplication(input(drop, data), deps(notify))).rejects.toThrow("工程 anomaly: 予約CSVの行数が前回から急減しています(絞り込みエクスポートの可能性)。入力を確認し、意図的な場合は GROWTH_INGEST_ALLOW_ROWDROP=1 で再実行してください");
    await expect(readFile(join(data, "canonical", "reservations.jsonl"), "utf8")).resolves.toBe(canonicalBefore);
    expect(notify).toHaveBeenCalledTimes(1);
    const log = vi.fn();
    await expect(runIngestApplication({ ...input(drop, data), allowRowDrop: true }, { ...deps(notify), log })).resolves.toMatchObject({ wasDryRun: false });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("行数急減を許可"));
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("プログラムCSVの行数急減は警告しても取り込みを停止しない", async () => {
    const { drop, data } = await setup();
    await copyFile(programFixture, join(drop, "program.csv"));
    await runIngestApplication(input(drop, data), deps());
    const snapshotPath = join(data, "snapshots", "snapshot-2026-07-16.json");
    const firstSnapshot = snapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
    await writeFile(snapshotPath, JSON.stringify({ ...firstSnapshot, meta: { ...firstSnapshot.meta, inputs: [{ type: "yoyaku", rows: 1 }, { type: "program", rows: 10 }] } }));
    await rm(join(drop, "program.csv"));

    await expect(runIngestApplication(input(drop, data), deps())).resolves.toMatchObject({ wasDryRun: false });
    const snapshot = snapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
    expect(snapshot.insights).toEqual(expect.arrayContaining([expect.objectContaining({ id: "d11:rowdrop:program" })]));
  });

  it("同日再実行で行数が急減した場合も昇格せず旧canonicalを残す", async () => {
    const { drop, data } = await setup();
    await runIngestApplication(input(drop, data), deps());
    const canonicalBefore = await readFile(join(data, "canonical", "reservations.jsonl"), "utf8");
    const snapshotPath = join(data, "snapshots", "snapshot-2026-07-16.json");
    const firstSnapshot = snapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
    await writeFile(snapshotPath, JSON.stringify({ ...firstSnapshot, meta: { ...firstSnapshot.meta, inputs: [{ type: "yoyaku", rows: 100 }] } }));

    await expect(runIngestApplication(input(drop, data), deps())).rejects.toThrow("工程 anomaly: 予約CSVの行数が前回から急減しています");
    await expect(readFile(join(data, "canonical", "reservations.jsonl"), "utf8")).resolves.toBe(canonicalBefore);
  });

  it("同日同一ダイジェストは再送せず、送信失敗ならpendingを原子的に残す", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    await runIngestApplication(input(drop, data), deps(notify));
    expect(notify).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => { throw new Error("LINE失敗"); });
    const second = await setup();
    await expect(runIngestApplication(input(second.drop, second.data), deps(failing))).rejects.toThrow("LINE失敗");
    await expect(stat(join(second.data, "snapshots", ".digest-sent-2026-07-16.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(second.data, "snapshots", ".digest-pending.json"), "utf8")).resolves.toMatch(/"text"/);
    await expect(stat(join(second.data, "snapshots", ".digest-pending.json.tmp"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("翌日はpendingを先に再送してから今回分を送り、成功時にpendingを削除する", async () => {
    const { drop, data } = await setup();
    const firstFailure = vi.fn(async () => { throw new Error("LINE失敗"); });
    await expect(runIngestApplication(input(drop, data), deps(firstFailure))).rejects.toThrow("LINE失敗");
    const pending = JSON.parse(await readFile(join(data, "snapshots", ".digest-pending.json"), "utf8")) as { text: string };
    const notify = vi.fn<(text: string, kind: "weekly") => Promise<void>>(async () => undefined);
    await runIngestApplication(input(drop, data), {
      ...deps(notify),
      now: () => new Date("2026-07-17T12:00:00+09:00"),
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenNthCalledWith(1, pending.text, "weekly");
    expect(notify.mock.calls[1]?.[0]).not.toBe(pending.text);
    await expect(stat(join(data, "snapshots", ".digest-pending.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("破損したpendingは警告して破棄し、今回分だけを送る", async () => {
    const { drop, data } = await setup();
    await mkdir(join(data, "snapshots"), { recursive: true });
    await writeFile(join(data, "snapshots", ".digest-pending.json"), "{");
    const notify = vi.fn(async () => undefined);
    const log = vi.fn();
    await runIngestApplication(input(drop, data), { ...deps(notify), log });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("pending"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("破損"));
    await expect(stat(join(data, "snapshots", ".digest-pending.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("pendingと今回のhashが同一なら一度だけ送る", async () => {
    const { drop, data } = await setup();
    const firstFailure = vi.fn(async () => { throw new Error("LINE失敗"); });
    await expect(runIngestApplication(input(drop, data), deps(firstFailure))).rejects.toThrow("LINE失敗");
    const notify = vi.fn(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    expect(notify).toHaveBeenCalledTimes(1);
    await expect(stat(join(data, "snapshots", ".digest-pending.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("送信済みマーカーと同じpendingは再送せずに掃除する", async () => {
    const { drop, data } = await setup();
    const firstFailure = vi.fn(async () => { throw new Error("LINE失敗"); });
    await expect(runIngestApplication(input(drop, data), deps(firstFailure))).rejects.toThrow("LINE失敗");
    const pending = JSON.parse(await readFile(join(data, "snapshots", ".digest-pending.json"), "utf8")) as { hash: string };
    await writeFile(join(data, "snapshots", ".digest-sent-2026-07-16.json"), JSON.stringify({ hash: pending.hash }));
    const notify = vi.fn(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    expect(notify).not.toHaveBeenCalled();
    await expect(stat(join(data, "snapshots", ".digest-pending.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("pendingの再送失敗時はpendingを保持して今回分を送らず停止する", async () => {
    const { drop, data } = await setup();
    const firstFailure = vi.fn(async () => { throw new Error("LINE失敗"); });
    await expect(runIngestApplication(input(drop, data), deps(firstFailure))).rejects.toThrow("LINE失敗");
    const pendingBefore = await readFile(join(data, "snapshots", ".digest-pending.json"), "utf8");
    const retryFailure = vi.fn(async () => { throw new Error("再送失敗"); });
    await expect(runIngestApplication(input(drop, data), deps(retryFailure))).rejects.toThrow("再送失敗");
    expect(retryFailure).toHaveBeenCalledTimes(1);
    await expect(readFile(join(data, "snapshots", ".digest-pending.json"), "utf8")).resolves.toBe(pendingBefore);
  });

  it("異なる送信済みハッシュなら再通知し、マーカー読取の権限エラーは停止する", async () => {
    const { drop, data } = await setup();
    const marker = join(data, "snapshots", ".digest-sent-2026-07-16.json");
    await mkdir(join(data, "snapshots"), { recursive: true });
    await writeFile(marker, JSON.stringify({ hash: "old-hash" }));
    const notify = vi.fn(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    expect(notify).toHaveBeenCalledWith(expect.any(String), "weekly");

    const blockedFs: IngestFs = {
      ...fs,
      readFile: async (path, encoding) => {
        if (path.endsWith(".digest-sent-2026-07-16.json")) throw Object.assign(new Error("denied"), { code: "EACCES" });
        return fs.readFile(path, encoding);
      },
    };
    const second = await setup();
    await expect(runIngestApplication(input(second.drop, second.data), { ...deps(), fs: blockedFs })).rejects.toThrow("ダイジェスト送信記録の読取に失敗しました");
  });

  it("pendingの読取権限エラーは日本語エラーで停止する", async () => {
    const { drop, data } = await setup();
    const blockedFs: IngestFs = {
      ...fs,
      readFile: async (path, encoding) => {
        if (path.endsWith(".digest-pending.json")) throw Object.assign(new Error("denied"), { code: "EACCES" });
        return fs.readFile(path, encoding);
      },
    };
    await expect(runIngestApplication(input(drop, data), { ...deps(), fs: blockedFs })).rejects.toThrow("保留ダイジェストの読取に失敗しました");
  });

  it("破損した送信済みマーカーは警告して再送し、原子的に置換する", async () => {
    const { drop, data } = await setup();
    const marker = join(data, "snapshots", ".digest-sent-2026-07-16.json");
    await mkdir(join(data, "snapshots"), { recursive: true });
    await writeFile(marker, "{");
    const notify = vi.fn(async () => undefined);
    const log = vi.fn();
    await runIngestApplication(input(drop, data), { ...deps(notify), log });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("破損"));
    await expect(readFile(marker, "utf8")).resolves.toContain("hash");
    await expect(stat(`${marker}.tmp`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("chmod成功と失敗の両方を沈黙させない", async () => {
    const okChmod = vi.fn(async () => undefined);
    const first = await setup();
    await runIngestApplication(input(first.drop, first.data), { ...deps(), fs: { ...fs, chmod: okChmod } });
    expect(okChmod).toHaveBeenCalledWith(expect.stringContaining("remarks-review-"), 0o600);
    const second = await setup();
    const log = vi.fn();
    await runIngestApplication(input(second.drop, second.data), {
      ...deps(),
      fs: { ...fs, chmod: async () => { throw new Error("EPERM"); } },
      log,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("権限設定に失敗"));
  });

  it.each(["null", "123", '{"hash":123}'])(
    "マーカーがJSONとして有効でも形式不正(%s)なら警告して再送する",
    async (content) => {
      const { drop, data } = await setup();
      const marker = join(data, "snapshots", ".digest-sent-2026-07-16.json");
      await mkdir(join(data, "snapshots"), { recursive: true });
      await writeFile(marker, content);
      const notify = vi.fn(async () => undefined);
      const log = vi.fn();
      await runIngestApplication(input(drop, data), { ...deps(notify), log });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("破損"));
    }
  );
});

  it("予約不可CSVを正準出力へ含める", async () => {
    const { drop, data } = await setup();
    await copyFile(blockedFixture, join(drop, "blocked.csv"));
    await runIngestApplication(input(drop, data), deps());
    const blocked = await readFile(join(data, "canonical", "blocked_slots.jsonl"), "utf8");
    expect(blocked).toContain('"space":"Court A"');
    expect(blocked).not.toContain('"label"');
  });
