/**
 * HYROX DAISUKE CLASS 参加者集計の実行入口。
 *
 *   npm run hyrox:sync
 *
 * .env.local の NOTION_TOKEN を使う。標準出力は件数だけ(個人名は出さない)。
 * HYROX_SYNC_TODAY=YYYY-MM-DD を付けると、その日の 08:30 JST として実行する(LINE の試し送り専用。
 * Notion の集計値もその日時点になるので、試し送りのあとは付けずにもう一度実行して戻す)。
 * 終了コード: 0 = 成功 / 1 = 失敗(Notion の橋渡しページに理由を残している)。
 * 薄い配線のためテスト対象外(ロジックは sync.ts でテスト済み)。
 */
import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

import { createNotionClient } from "../early-morning/notionClient";
import { defaultFetch } from "../growth/http";
import { NOTION_IDS } from "./notionIds";
import { runSync } from "./sync";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const [key, value] of Object.entries(parse(readFileSync(".env.local")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveNow(): Date {
  const override = process.env.HYROX_SYNC_TODAY;
  if (!override) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(override)) throw new Error("HYROX_SYNC_TODAY は YYYY-MM-DD で指定してください。");
  return new Date(`${override}T08:30:00+09:00`);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  loadEnvLocal();
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN を .env.local に設定してください。");
  const notion = createNotionClient({ token, fetchFn: defaultFetch, sleep });
  const startedAt = Date.now();
  const summary = await runSync({ notion, now: resolveNow(), ids: NOTION_IDS });
  process.stdout.write(
    [
      `開催回 ${summary.sessions} / 人 ${summary.people} / 参加記録 ${summary.records} / 次回 ${summary.nextDate ?? "なし"} の回 ${summary.nextSessions}`,
      `書き込み 作成${summary.writes.created}・更新${summary.writes.updated}・アーカイブ${summary.writes.archived}`,
      `読めない台帳行 ${summary.skippedRows} / イベント名が空 ${summary.missingEventName}`,
      `所要 ${Math.round((Date.now() - startedAt) / 1000)} 秒`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`hyrox:sync に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
