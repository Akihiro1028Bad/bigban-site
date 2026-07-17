import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { get as vercelGet, put as vercelPut } from "@vercel/blob";

import { ymdSchema } from "../../../scripts/growth/dateSchemas";

export const SNAPSHOT_LATEST_PATH = "growth-analytics/snapshot-latest.json";

export interface SnapshotStore {
  putLatest(json: string, ymd: string): Promise<void>;
  getLatest(): Promise<string | null>;
}

export interface BlobPutOptions {
  access: "private";
  addRandomSuffix: false;
  allowOverwrite: true;
  contentType: "application/json";
  token?: string;
}

export type BlobPutFn = (pathname: string, body: string, options: BlobPutOptions) => Promise<unknown>;

export interface BlobGetResult {
  stream: ReadableStream<Uint8Array> | null;
}

export type BlobGetFn = (pathname: string, options: { access: "private"; token: string; useCache: false }) => Promise<BlobGetResult | null>;

export function snapshotDatedPath(ymd: string): string {
  if (!ymdSchema.safeParse(ymd).success) throw new Error("スナップショット日付が不正です");
  return `growth-analytics/snapshot-${ymd}.json`;
}

export async function putSnapshot(json: string, ymd: string, put: BlobPutFn): Promise<void> {
  const options: BlobPutOptions = {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  };
  await put(SNAPSHOT_LATEST_PATH, json, options);
  await put(snapshotDatedPath(ymd), json, options);
}

function putWithToken(token: string, put: BlobPutFn): BlobPutFn {
  return (pathname, body, options) => put(pathname, body, { ...options, token });
}

/** Vercel Blobへの保存・読取ドライバ。getはPrivate Blobをサーバー側だけで読む。 */
export function blobSnapshotStore(
  token: string,
  put: BlobPutFn = vercelPut as unknown as BlobPutFn,
  get: BlobGetFn = vercelGet as unknown as BlobGetFn
): SnapshotStore {
  return {
    putLatest: (json, ymd) => putSnapshot(json, ymd, putWithToken(token, put)),
    async getLatest(): Promise<string | null> {
      const result = await get(SNAPSHOT_LATEST_PATH, { access: "private", token, useCache: false });
      if (!result?.stream) return null;
      return new Response(result.stream).text();
    },
  };
}

/** ローカル開発用のファイルドライバ。ingestのsnapshotsディレクトリも直接指定できる。 */
export function fileSnapshotStore(directory: string): SnapshotStore {
  const latestPath = join(directory, "snapshot-latest.json");
  return {
    async putLatest(json, ymd): Promise<void> {
      if (!ymdSchema.safeParse(ymd).success) throw new Error("スナップショット日付が不正です");
      await mkdir(directory, { recursive: true });
      await Promise.all([
        writeFile(latestPath, json, "utf8"),
        writeFile(join(directory, `snapshot-${ymd}.json`), json, "utf8"),
      ]);
    },
    async getLatest(): Promise<string | null> {
      try {
        return await readFile(latestPath, "utf8");
      } catch (error: unknown) {
        if ((error as { code?: string }).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

export interface SnapshotStoreEnv {
  BLOB_READ_WRITE_TOKEN?: string;
  GROWTH_ANALYTICS_FILE_DIR?: string;
  GROWTH_RESERVATION_DATA_DIR?: string;
}

export function resolveSnapshotStore(env: SnapshotStoreEnv): SnapshotStore {
  if (env.BLOB_READ_WRITE_TOKEN) return blobSnapshotStore(env.BLOB_READ_WRITE_TOKEN);
  const directory = env.GROWTH_ANALYTICS_FILE_DIR
    || (env.GROWTH_RESERVATION_DATA_DIR ? join(env.GROWTH_RESERVATION_DATA_DIR, "snapshots") : undefined);
  if (directory) return fileSnapshotStore(directory);
  throw new Error("スナップショットストアが未設定です");
}
