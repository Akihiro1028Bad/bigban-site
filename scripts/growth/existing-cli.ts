/**
 * 週次モード用「既存行(グラウンドトゥルース)」出力スクリプト。
 *
 *   npm run growth:existing
 *
 * 直近スナップショットの対象週を読み、Notion REST で 3 つの DB を実照会して、
 * 週次エージェントが重複防止・学習ループにそのまま使える Markdown を stdout に出す。
 * headless では Bash が `npm run growth:fetch` / `npm run growth:existing` のみ許可
 * のため、行を読む唯一の確実な経路になる(冪等性を推測させないための土台)。
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { summarizeExisting, weekStartEqualsFilter } from "./existing";
import { defaultFetch } from "./http";
import { queryAllDataSource } from "./notionRepository";
import { jstDateString } from "./period";

// weekly.md / notify-line.ts と同じ data source ID。
const REPORT_DS = "27d6794f-4133-4cd4-9407-491d95c1b82b"; // 週次グロースレポート
const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460"; // 施策提案
const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案

async function main(): Promise<void> {
  const date = jstDateString(new Date());
  const file = path.resolve(process.cwd(), "data", "snapshots", `${date}.json`);
  const snapshot = JSON.parse(await readFile(file, "utf-8")) as {
    period?: { start?: string; end?: string };
  };
  const period = {
    start: snapshot.period?.start ?? "",
    end: snapshot.period?.end ?? "",
  };
  if (!period.start) {
    throw new Error(`スナップショット ${file} に period.start がありません。`);
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error(
      "NOTION_TOKEN が未設定です。既存行を読めないため週次の重複判定ができません。"
    );
  }
  const opts = { token, fetchFn: defaultFetch };

  const [reportsForWeek, proposals, ideas] = await Promise.all([
    queryAllDataSource(
      REPORT_DS,
      { filter: weekStartEqualsFilter(period.start) },
      opts
    ),
    queryAllDataSource(PROPOSAL_DS, {}, opts),
    queryAllDataSource(IDEA_DS, {}, opts),
  ]);

  const markdown = summarizeExisting({
    period,
    nowMs: Date.now(),
    reportsForWeek,
    proposals,
    ideas,
  });
  process.stdout.write(`${markdown}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`既存行の取得に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
