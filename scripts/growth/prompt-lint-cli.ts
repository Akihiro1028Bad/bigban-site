/**
 * プロンプト静的検査の実行入口(運用評価・中期2)。
 *
 *   npm run growth:prompt-lint
 *
 * `scripts/growth/prompts/` の .md を読み、promptRegistry 未登録・古いパス参照を検出する。
 * 問題があれば一覧を出力して終了コード 1。薄い配線のためカバレッジ除外(純ロジックは promptLint.ts)。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lintPrompts } from "./promptLint";
import { PROMPT_REGISTRY } from "./promptRegistry";

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsDir = path.join(here, "prompts");
const sharedPromptsDir = path.join(promptsDir, "shared");
const repoRoot = path.join(here, "..", "..");

function readPromptFiles(dir: string, optional: boolean): { name: string; content: string }[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    if (optional) return [];
    throw error;
  }

  return entries
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(path.join(dir, name), "utf-8"),
    }));
}

function main(): void {
  const files = [
    ...readPromptFiles(promptsDir, false),
    ...readPromptFiles(sharedPromptsDir, true),
  ];
  const present = files.map((file) => file.name);
  const registered = PROMPT_REGISTRY.map((m) => m.filename);

  const issues = lintPrompts({
    present,
    registered,
    files,
    exists: (p) => existsSync(path.join(repoRoot, p)),
  });

  if (issues.length === 0) {
    process.stdout.write("prompt-lint: 問題なし\n");
    return;
  }

  process.stderr.write(`prompt-lint: ${issues.length} 件の問題\n`);
  for (const issue of issues) {
    process.stderr.write(`  [${issue.kind}] ${issue.file}: ${issue.detail}\n`);
  }
  process.exitCode = 1;
}

main();
