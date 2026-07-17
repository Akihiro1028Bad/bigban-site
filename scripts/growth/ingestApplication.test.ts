// @vitest-environment node
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";
import { runIngestApplication } from "./ingestApplication";
import type { IngestFs } from "./ingestApplication";

const directories: string[] = [];
const fixture = new URL("./__fixtures__/labola/yoyaku_sjis.csv", import.meta.url);
const customerCsv = new Uint8Array([0x93, 0x6f, 0x98, 0x5e, 0x93, 0xfa, 0x2c, 0x8c, 0xda, 0x8b, 0x71, 0x83, 0x5e, 0x83, 0x43, 0x83, 0x76, 0x2c, 0x93, 0x6f, 0x98, 0x5e, 0x83, 0x58, 0x83, 0x65, 0x81, 0x5b, 0x83, 0x5e, 0x83, 0x58, 0x2c, 0x89, 0xef, 0x88, 0xf5, 0x94, 0xd4, 0x8d, 0x86, 0x28, 0x8e, 0xa9, 0x93, 0xae, 0x94, 0xad, 0x8d, 0x73, 0x29, 0x2c, 0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x83, 0x81, 0x81, 0x5b, 0x83, 0x8b, 0x83, 0x41, 0x83, 0x68, 0x83, 0x8c, 0x83, 0x58, 0x2c, 0x97, 0x58, 0x95, 0xd6, 0x94, 0xd4, 0x8d, 0x86, 0x2c, 0x8f, 0x5a, 0x8f, 0x8a, 0x2c, 0x90, 0xab, 0x95, 0xca, 0x2c, 0x90, 0xb6, 0x94, 0x4e, 0x8c, 0x8e, 0x93, 0xfa, 0x2c, 0x90, 0x45, 0x8b, 0xc6, 0x0a, 0x32, 0x30, 0x32, 0x36, 0x2f, 0x30, 0x37, 0x2f, 0x30, 0x31, 0x2c, 0x88, 0xea, 0x94, 0xca, 0x2c, 0x97, 0x4c, 0x8c, 0xf8, 0x2c, 0x31, 0x2c, 0x97, 0x98, 0x97, 0x70, 0x8e, 0xd2, 0x2c, 0x2c, 0x2c, 0x2c, 0x2c, 0x2c, 0x2c, 0x0a]);
const salesSummaryCsv = new Uint8Array([0x94, 0x84, 0x8f, 0xe3, 0x93, 0xfa, 0x2c, 0x83, 0x8c, 0x83, 0x93, 0x83, 0x5e, 0x83, 0x8b, 0x83, 0x58, 0x83, 0x79, 0x81, 0x5b, 0x83, 0x58, 0x2c, 0x83, 0x43, 0x83, 0x78, 0x83, 0x93, 0x83, 0x67, 0x2c, 0x95, 0xa8, 0x94, 0xcc, 0x2c, 0x94, 0x84, 0x8f, 0xe3, 0x8d, 0x87, 0x8c, 0x76, 0x0a, 0x32, 0x30, 0x32, 0x36, 0x2f, 0x30, 0x37, 0x2f, 0x30, 0x31, 0x2c, 0x30, 0x2c, 0x30, 0x2c, 0x30, 0x2c, 0x30, 0x0a]);

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
  return { dropDir, dataDir, hashKey: "test-key", coverageStart: "2026-06-01", rules: { emails: [], nameContains: [] }, isDryRun };
}

const deps = (notify: (text: string, kind: "weekly") => Promise<void> = async () => undefined) => ({ fs, now: () => new Date("2026-07-16T12:00:00+09:00"), notify, log: vi.fn() });

afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("runIngestApplication", () => {
  it("正準データとスナップショットをtmp世代から昇格し、既定通知を送る", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn<(text: string, kind: "weekly") => Promise<void>>(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    await expect(readFile(join(data, "canonical", "reservations.jsonl"), "utf8")).resolves.toContain("reservationId");
    await expect(readFile(join(data, "snapshots", "snapshot-2026-07-16.json"), "utf8")).resolves.toContain("schemaVersion");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.any(String), "weekly");
    await expect(stat(join(data, "canonical.old"))).rejects.toMatchObject({ code: "ENOENT" });
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

  it("DRYRUNでは書込みも通知も行わない", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn(async () => undefined);
    const result = await runIngestApplication(input(drop, data, true), deps(notify));
    expect(result.wasDryRun).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    await expect(stat(join(data, "canonical"))).rejects.toMatchObject({ code: "ENOENT" });
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
    expect(snapshot.meta.warnings).toEqual(expect.arrayContaining([expect.stringContaining("未知CSV"), expect.stringContaining("yoyaku CSVが複数")]));
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
    expect(snapshot.meta.warnings).toEqual(expect.arrayContaining(["未知CSVを無視: unknown.csv", "未知CSVを無視: empty.csv"]));
  });

  it("前回スナップショットの破損は沈黙させない", async () => {
    const { drop, data } = await setup();
    await mkdir(join(data, "snapshots"), { recursive: true });
    await writeFile(join(data, "snapshots", "snapshot-2026-07-15.json"), "{");
    await expect(runIngestApplication(input(drop, data), deps())).rejects.toThrow("previous-snapshot");
    await rm(join(data, "snapshots"), { recursive: true, force: true });
    await runIngestApplication(input(drop, data), deps());
  });

  it("同日同一ダイジェストは再送せず、送信失敗ならマーカーを残さない", async () => {
    const { drop, data } = await setup();
    const notify = vi.fn(async () => undefined);
    await runIngestApplication(input(drop, data), deps(notify));
    await runIngestApplication(input(drop, data), deps(notify));
    expect(notify).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => { throw new Error("LINE失敗"); });
    const second = await setup();
    await expect(runIngestApplication(input(second.drop, second.data), deps(failing))).rejects.toThrow("LINE失敗");
    await expect(stat(join(second.data, "snapshots", ".digest-sent-2026-07-16.json"))).rejects.toMatchObject({ code: "ENOENT" });
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
