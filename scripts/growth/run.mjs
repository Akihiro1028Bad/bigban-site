/**
 * グロース3モードの起動ランチャー(headless / claude -p)。
 * Windows / macOS 両対応(Node spawn・shell なし)。
 *
 *   npm run growth:weekly        週次モード(分析→Notionレポート+施策提案)
 *   npm run growth:drafts        下書きモード(承認記事→microCMS下書き+画像)
 *   npm run growth:initiatives   施策実行モード(承認施策→Notion本文に文案/仕様書)
 *
 * 動作確認(claude を起動せずコマンドだけ表示): GROWTH_DRYRUN=1 を付ける。
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsDir = path.join(here, "prompts");

// 共通の許可ツール。Notion は headless では mcp__claude_ai_Notion になる。
const COMMON = ["Read", "Glob", "Grep", "Task", "WebSearch", "WebFetch", "mcp__claude_ai_Notion"];

const MODES = {
  // 週次は growth:fetch のみ実行できれば足りるので Bash を絞る
  weekly: { prompt: "weekly.md", allow: [...COMMON, "Bash(npm run growth:fetch)"] },
  // 下書き/施策実行は複数スクリプト・画像生成・縮小を回すため Bash 全般を許可
  drafts: { prompt: "drafts.md", allow: [...COMMON, "Bash"] },
  initiatives: { prompt: "initiatives.md", allow: [...COMMON, "Bash"] },
};

// 無人でも誤って外部反映しないよう、危険操作は明示拒否
const DISALLOW = ["Bash(git push:*)", "Bash(git commit:*)"];

const mode = process.argv[2];
const cfg = MODES[mode];
if (!cfg) {
  process.stderr.write(
    `使い方: node scripts/growth/run.mjs <weekly|drafts|initiatives>\n`
  );
  process.exit(1);
}

const prompt = readFileSync(path.join(promptsDir, cfg.prompt), "utf-8");
const args = [
  "-p",
  prompt,
  "--permission-mode",
  "default",
  "--allowedTools",
  ...cfg.allow,
  "--disallowedTools",
  ...DISALLOW,
];

const bin = process.platform === "win32" ? "claude.cmd" : "claude";

if (process.env.GROWTH_DRYRUN) {
  process.stdout.write(
    `[dry-run] ${bin} ${args
      .map((a) => (a === prompt ? `<prompt:${cfg.prompt}>` : a))
      .join(" ")}\n`
  );
  process.exit(0);
}

const child = spawn(bin, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  process.stderr.write(`claude の起動に失敗しました: ${err.message}\n`);
  process.exit(1);
});
