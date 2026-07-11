/**
 * trend 用の薄い I/O ラッパ。純ロジックは trend.ts でテストする。
 */

import type { SnapshotLike } from "./trend";

export interface TrendSnapshotFs {
  readdir(dir: string): Promise<string[]>;
  readFile(path: string, encoding: "utf-8"): Promise<string>;
}

export async function readRecentSnapshots(
  fs: TrendSnapshotFs,
  dir: string,
  maxFiles = 4
): Promise<SnapshotLike[]> {
  const files = (await fs.readdir(dir))
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxFiles);

  const snapshots: SnapshotLike[] = [];
  for (const file of files) {
    const raw = await fs.readFile(`${dir}/${file}`, "utf-8");
    snapshots.push(JSON.parse(raw) as SnapshotLike);
  }
  return snapshots;
}
