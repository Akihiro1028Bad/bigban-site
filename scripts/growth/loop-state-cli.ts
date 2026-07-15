/** pull 型AIループ終了後の Notion postcondition 検証。 */
import "dotenv/config";

import { defaultFetch } from "./http";
import { assertNoProcessingPages, processingStatusFilter, requireLoopState } from "./loopState";
import type { NotionApiOptions } from "./notion";
import { queryAllDataSource } from "./notionRepository";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

async function assertSettled(mode: string, options: NotionApiOptions): Promise<void> {
  const loop = requireLoopState(mode);
  const pages = await queryAllDataSource(
    IDEA_DS,
    { filter: processingStatusFilter(loop) },
    options
  );
  assertNoProcessingPages(loop, pages);
  process.stdout.write(`${mode}: settled\n`);
}

async function main(): Promise<void> {
  const [command, mode] = process.argv.slice(2);
  if (command !== "assert-settled" || !mode) {
    throw new Error("使い方: loop-state-cli assert-settled <mode>");
  }
  await assertSettled(mode, { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch });
}

main().catch((error: unknown) => {
  process.stderr.write(`[loop-state] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
