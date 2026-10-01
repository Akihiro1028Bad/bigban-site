/**
 * 週次ヘルスチェックの実行入口。
 *
 *   npm run analytics:weekly
 *
 * GA4 予約完了と予約台帳の週次突合・テニスベア申込・CrUX を画面に出す(どこにも書き込まない)。
 * 出力は件数だけで、個人名は出さない。.env.local の NOTION_TOKEN と GROWTH_* を使う。
 * 終了コード: 0 = 全節成功 / 1 = どれかの節が取得不可、または実行失敗。
 * 薄い配線のためテスト対象外(ロジックは runWeekly.ts でテスト済み)。
 */
import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

import { createNotionClient } from "../../early-morning/notionClient";
import { defaultFetch } from "../../growth/http";
import { runWeekly } from "./runWeekly";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const [key, value] of Object.entries(parse(readFileSync(".env.local")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  loadEnvLocal();
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN を .env.local に設定してください。");
  const notion = createNotionClient({ token, fetchFn: defaultFetch, sleep });
  const { text, hasFailure } = await runWeekly({ now: new Date(), env: process.env, notion, sleep });
  process.stdout.write(`${text}\n`);
  if (hasFailure) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`analytics:weekly に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
