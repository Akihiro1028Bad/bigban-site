/**
 * 下書き自動生成の軽量 peek CLI。
 *
 *   npm run growth:drafts-auto-peek -- peek
 *
 * `growth:drafts-auto` が headless agent を起動する前に、承認済み/生成中かつ下書きID未作成の
 * 行があるかだけを Notion で読む。0 件なら agent を起動しない。
 */

import "dotenv/config";

import { countDraftsAutoTargets, draftsAutoQueryFilter } from "./draftsAuto";
import { defaultFetch } from "./http";
import { queryDataSource, type NotionApiOptions } from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

async function peek(options: NotionApiOptions): Promise<void> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: draftsAutoQueryFilter(), pageSize: 100 },
    options
  );
  process.stdout.write(`${countDraftsAutoTargets(pages)}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "peek";
  if (command !== "peek") {
    throw new Error("使い方: drafts-auto-cli peek");
  }
  await peek(notionOptions());
}

main().catch((error: unknown) => {
  console.error("[drafts-auto] 失敗:", error);
  process.exit(1);
});
