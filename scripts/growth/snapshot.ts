/**
 * 取得した週次データを日付つき JSON スナップショットとして保存する。
 *
 * 保存層はアーカイブ用途(必要なときだけ読む)。fs は注入可能にして
 * テストでは実 IO を伴わずに検証する。実行時は cli から node:fs/promises を渡す。
 */

export interface SnapshotFs {
  mkdir(dir: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, content: string, encoding: "utf-8"): Promise<unknown>;
}

export interface SaveSnapshotOptions {
  fs: SnapshotFs;
  /** 保存先ディレクトリ(例: /repo/data/snapshots)。 */
  dir: string;
  /** ファイル名に使う日付(YYYY-MM-DD)。 */
  date: string;
}

export async function saveSnapshot(
  data: unknown,
  options: SaveSnapshotOptions
): Promise<string> {
  const { fs, dir, date } = options;
  const path = `${dir}/${date}.json`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");

  return path;
}
