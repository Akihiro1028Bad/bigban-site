/**
 * 週次グロースデータ取得の実行入口。
 *
 *   npm run growth:fetch
 *
 * .env を読み、GA4 / GSC のデータを取得して、
 * data/snapshots/<実行日>.json に保存しつつ標準出力へ JSON を吐く。
 * 薄い配線のためテスト対象外(ロジックは collect / period 等でテスト済み)。
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadGrowthConfig } from "./config";
import { computeWeeklyPeriods, jstDateString } from "./period";
import { getAccessToken } from "./auth";
import { collectGrowthData } from "./collect";
import { saveSnapshot } from "./snapshot";

async function main(): Promise<void> {
  const config = loadGrowthConfig(process.env);
  const now = new Date();
  const { current, prior } = computeWeeklyPeriods(now);

  const accessToken = await getAccessToken(config);

  const snapshot = await collectGrowthData({
    config,
    accessToken,
    current,
    prior,
    generatedAt: now.toISOString(),
  });

  const dir = path.resolve(process.cwd(), "data", "snapshots");
  const savedPath = await saveSnapshot(snapshot, {
    fs: { mkdir, writeFile },
    dir,
    date: jstDateString(now),
  });

  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  process.stderr.write(`\n保存しました: ${savedPath}\n`);
  if (snapshot.errors.length > 0) {
    process.stderr.write(
      `警告: 一部の取得に失敗しました -> ${JSON.stringify(snapshot.errors)}\n`
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`グロースデータ取得に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
