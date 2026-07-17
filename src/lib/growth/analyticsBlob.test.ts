// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SNAPSHOT_LATEST_PATH,
  blobSnapshotStore,
  fileSnapshotStore,
  resolveSnapshotStore,
  snapshotDatedPath,
} from "./analyticsBlob";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("analyticsBlob", () => {
  it("日付別Blobパスを作り、暦上不正な日付は拒否する", () => {
    expect(SNAPSHOT_LATEST_PATH).toBe("growth-analytics/snapshot-latest.json");
    expect(snapshotDatedPath("2026-07-17")).toBe("growth-analytics/snapshot-2026-07-17.json");
    expect(() => snapshotDatedPath("2026-02-30")).toThrow("スナップショット日付が不正です");
  });

  it("ファイルストアはlatestと日付別スナップショットを保存・読取する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "analytics-blob-"));
    directories.push(directory);
    const store = fileSnapshotStore(directory);

    await store.putLatest('{"version":1}', "2026-07-17");

    await expect(readFile(join(directory, "snapshot-latest.json"), "utf8")).resolves.toBe('{"version":1}');
    await expect(readFile(join(directory, "snapshot-2026-07-17.json"), "utf8")).resolves.toBe('{"version":1}');
    await expect(store.getLatest()).resolves.toBe('{"version":1}');
  });

  it("ファイルストアはまだlatestがない場合nullを返す", async () => {
    const directory = await mkdtemp(join(tmpdir(), "analytics-blob-"));
    directories.push(directory);
    await expect(fileSnapshotStore(directory).getLatest()).resolves.toBeNull();
  });

  it("ファイルストアは不正な日付を拒否し、ENOENT以外の読取失敗は隠さない", async () => {
    const directory = await mkdtemp(join(tmpdir(), "analytics-blob-"));
    directories.push(directory);
    const store = fileSnapshotStore(directory);
    await expect(store.putLatest("{}", "2026-02-30")).rejects.toThrow("スナップショット日付が不正です");
    await mkdir(join(directory, "snapshot-latest.json"));
    await expect(store.getLatest()).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("Blobストアは注入したput関数でlatestと日付別を非公開保存する", async () => {
    const put = vi.fn(async () => ({ url: "https://blob.example/snapshot" }));
    const store = blobSnapshotStore("blob-token", put);

    await store.putLatest('{"version":1}', "2026-07-17");

    expect(put).toHaveBeenNthCalledWith(1, SNAPSHOT_LATEST_PATH, '{"version":1}', {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: "blob-token",
    });
    expect(put).toHaveBeenNthCalledWith(2, "growth-analytics/snapshot-2026-07-17.json", '{"version":1}', {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: "blob-token",
    });
  });

  it("Blobストアは注入したget関数でlatestをPrivate Blobから読む", async () => {
    const get = vi.fn(async () => ({ stream: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"version":1}'));
        controller.close();
      },
    }) }));
    const store = blobSnapshotStore("blob-token", vi.fn(), get);

    await expect(store.getLatest()).resolves.toBe('{"version":1}');
    expect(get).toHaveBeenCalledWith(SNAPSHOT_LATEST_PATH, {
      access: "private",
      token: "blob-token",
      useCache: false,
    });
  });

  it("Blobストアはlatestが存在しない場合nullを返す", async () => {
    await expect(blobSnapshotStore("blob-token", vi.fn(), async () => null).getLatest()).resolves.toBeNull();
    await expect(blobSnapshotStore("blob-token", vi.fn(), async () => ({ stream: null })).getLatest()).resolves.toBeNull();
  });

  it("環境に応じてBlobまたはファイルストアを選び、未設定を拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "analytics-blob-"));
    directories.push(directory);
    expect(resolveSnapshotStore({ GROWTH_ANALYTICS_FILE_DIR: directory })).toHaveProperty("putLatest");
    expect(resolveSnapshotStore({ GROWTH_RESERVATION_DATA_DIR: directory })).toHaveProperty("getLatest");
    expect(resolveSnapshotStore({ BLOB_READ_WRITE_TOKEN: "blob-token" })).toHaveProperty("putLatest");
    expect(() => resolveSnapshotStore({})).toThrow("スナップショットストアが未設定です");
  });
});
