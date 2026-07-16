/**
 * 施策自動成果物化の軽量 peek CLI。
 *
 *   npm run growth:initiatives-auto-peek -- peek
 *
 * `growth:initiatives-auto` が headless agent を起動する前に、承認済みの施策があるかだけを
 * Notion で読む。0 件なら agent を起動しない。
 */

import "dotenv/config";

import { defaultFetch } from "./http";
import {
  countInitiativesAutoTargets,
  initiativesAutoQueryFilter,
} from "./initiativesAuto";
import type { NotionApiOptions } from "./notion";
import { queryAllDataSource } from "./notionRepository";

const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460"; // 施策提案

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

async function peek(options: NotionApiOptions): Promise<void> {
  const pages = await queryAllDataSource(
    PROPOSAL_DS,
    { filter: initiativesAutoQueryFilter() },
    options
  );
  process.stdout.write(`${countInitiativesAutoTargets(pages)}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "peek";
  if (command !== "peek") {
    throw new Error("使い方: initiatives-auto-cli peek");
  }
  await peek(notionOptions());
}

main().catch((error: unknown) => {
  console.error("[initiatives-auto] 失敗:", error);
  process.exit(1);
});
