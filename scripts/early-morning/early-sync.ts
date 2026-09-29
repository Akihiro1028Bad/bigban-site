/**
 * 早朝リピーター集計の実行入口。
 *
 *   npm run early:sync
 *
 * .env.local の NOTION_TOKEN を使う。標準出力は件数だけ(個人名は出さない)。
 * 終了コード: 0 = 成功 / 1 = 失敗(Notion の橋渡しページに理由を残している)。
 * 薄い配線のためテスト対象外(ロジックは sync.ts でテスト済み)。
 */
import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

import { defaultFetch } from "../growth/http";
import { createNotionClient } from "./notionClient";
import { NOTION_IDS } from "./notionIds";
import { runSync } from "./sync";

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
  const startedAt = Date.now();
  const summary = await runSync({ notion, fetchFn: defaultFetch, sleep, now: new Date(), ids: NOTION_IDS });
  process.stdout.write(
    [
      `早朝イベント ${summary.events} / 開催回 ${summary.sessions} / 人 ${summary.people} / 参加記録 ${summary.records}`,
      `書き込み 作成${summary.writes.created}・更新${summary.writes.updated}・アーカイブ${summary.writes.archived}`,
      `次回 ${summary.nextDate ?? "なし"} / 対応なし予約 ${summary.unmatchedReservations} / 未知の状態 ${summary.ignoredStatuses}`,
      `所要 ${Math.round((Date.now() - startedAt) / 1000)} 秒`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`early:sync に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
