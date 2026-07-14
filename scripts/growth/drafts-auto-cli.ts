/**
 * 下書き自動生成の軽量 peek CLI。
 *
 *   npm run growth:drafts-auto-peek -- peek
 *
 * `growth:drafts-auto` が headless agent を起動する前に、承認済み/生成中かつ下書きID未作成の
 * 行があるかだけを Notion で読む。0 件なら agent を起動しない。
 */

import "dotenv/config";

import {
  countDraftsAutoTargets,
  draftsAutoQueryFilter,
  DRAFTS_AUTO_STATUS_PROP,
  selectDraftsAutoTarget,
} from "./draftsAuto";
import { defaultFetch } from "./http";
import { queryDataSource, updatePageSelect, type NotionApiOptions } from "./notion";

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

async function claim(options: NotionApiOptions): Promise<void> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: draftsAutoQueryFilter(), pageSize: 100 },
    options
  );
  const target = selectDraftsAutoTarget(pages);
  if (!target) {
    process.stdout.write("\n");
    return;
  }
  const status = target.properties[DRAFTS_AUTO_STATUS_PROP] as
    | { select?: { name?: string } | null }
    | undefined;
  if (status?.select?.name === "承認") {
    await updatePageSelect(target.id, DRAFTS_AUTO_STATUS_PROP, "生成中", options);
  }
  process.stdout.write(`${target.id}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "peek";
  if (command === "peek") {
    await peek(notionOptions());
    return;
  }
  if (command === "claim") {
    await claim(notionOptions());
    return;
  }
  throw new Error("使い方: drafts-auto-cli <peek|claim>");
}

main().catch((error: unknown) => {
  console.error("[drafts-auto] 失敗:", error);
  process.exit(1);
});
