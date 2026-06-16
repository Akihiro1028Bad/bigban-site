/**
 * グロース3モードの起動ランチャー(headless / claude -p)。
 * Windows / macOS 両対応。
 *
 *   npm run growth:weekly        週次モード(分析→Notionレポート+施策提案)
 *   npm run growth:drafts        下書きモード(承認記事→microCMS下書き+画像)
 *   npm run growth:initiatives   施策実行モード(承認施策→Notion本文に文案/仕様書)
 *
 * 動作確認(claude を起動せずコマンドだけ表示): GROWTH_DRYRUN=1 を付ける。
 *
 * プロンプトは引数ではなく**標準入力**で渡す(巨大引数の引用符問題を回避し、
 * Windows の claude.cmd 起動でも安定させるため)。
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
// プロンプトは stdin で渡すので引数には含めない
const args = [
  "-p",
  "--permission-mode",
  "default",
  "--allowedTools",
  ...cfg.allow,
  "--disallowedTools",
  ...DISALLOW,
];

const isWin = process.platform === "win32";

if (process.env.GROWTH_DRYRUN) {
  process.stdout.write(
    `[dry-run] (stdin=<prompt:${cfg.prompt}>) claude ${args.join(" ")}\n`
  );
  if (mode === "weekly") {
    process.stdout.write(
      `[dry-run] then: npm run growth:notify-line (異常終了時は GROWTH_NOTIFY_ERROR=1 でエラー通知)\n`
    );
  }
  process.exit(0);
}

/** npm スクリプトを実行し、終了コードを resolve する。env で追加の環境変数を渡せる。 */
function runNpm(scriptName, env = {}) {
  return new Promise((resolve) => {
    const npm = isWin ? "npm.cmd" : "npm";
    const proc = spawn(npm, ["run", scriptName], {
      stdio: ["ignore", "inherit", "inherit"],
      shell: isWin,
      env: { ...process.env, ...env },
    });
    proc.on("exit", (code) => resolve(code ?? 0));
    proc.on("error", (err) => {
      process.stderr.write(`${scriptName} の起動に失敗しました: ${err.message}\n`);
      resolve(1);
    });
  });
}

// Windows では .cmd 解決のため shell:true が必要(Node の spawn 仕様)。
const child = spawn("claude", args, {
  stdio: ["pipe", "inherit", "inherit"],
  shell: isWin,
});
child.stdin.write(prompt);
child.stdin.end();
child.on("exit", async (code) => {
  const exitCode = code ?? 0;
  // 週次モードは分析(Notion書き込み)完了後に LINE 通知を実行する。
  // claude の出力には依存せず、スナップショット + Notion から通知を組み立てる。
  // 異常終了(exit≠0)でも、失敗を**沈黙させない**ためにエラー通知を送る。
  if (mode === "weekly") {
    const env =
      exitCode === 0
        ? {}
        : { GROWTH_NOTIFY_ERROR: "1", GROWTH_WEEKLY_EXIT_CODE: String(exitCode) };
    const notifyCode = await runNpm("growth:notify-line", env);
    // 異常終了時は元の失敗を握り潰さないよう、weekly の終了コードを優先する。
    process.exit(exitCode !== 0 ? exitCode : notifyCode);
  }
  process.exit(exitCode);
});
child.on("error", (err) => {
  process.stderr.write(`claude の起動に失敗しました: ${err.message}\n`);
  process.exit(1);
});
