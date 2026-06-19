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
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
  openSync,
  writeSync,
  closeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsDir = path.join(here, "prompts");
const tmpDir = path.join(here, "..", "..", ".growth-tmp");

// 共通の許可ツール。Notion は headless では mcp__claude_ai_Notion になる。
const COMMON = ["Read", "Glob", "Grep", "Task", "WebSearch", "WebFetch", "mcp__claude_ai_Notion"];

// 執筆(下書きモード)は記事品質の勝負所なので既定で Opus 4.8 に固定する(#247)。
// GROWTH_DRAFTS_MODEL で上書き可能。
const DRAFTS_MODEL = process.env.GROWTH_DRAFTS_MODEL || "claude-opus-4-8";

const MODES = {
  // 週次は growth:fetch(取得)と growth:existing(既存行の読み出し)だけ許可する。
  // 既存行を確実に読めるようにし、headless が冪等性を推測して誤スキップするのを防ぐ。
  weekly: {
    prompt: "weekly.md",
    allow: [
      ...COMMON,
      "Bash(npm run growth:fetch)",
      "Bash(npm run growth:existing)",
    ],
  },
  // 下書き/施策実行は複数スクリプト・画像生成・縮小を回すため Bash 全般を許可
  drafts: { prompt: "drafts.md", allow: [...COMMON, "Bash"], model: DRAFTS_MODEL },
  initiatives: { prompt: "initiatives.md", allow: [...COMMON, "Bash"] },
  // 構成案修正(#44)。決定的処理は growth:revise CLI、claude はテキスト修正のみ。
  // 5分間隔の高頻度起動なので lockfile で多重起動を防ぎ、1日上限で暴走も止める。
  revise: {
    prompt: "revise-outline.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
};

const REVISE_LOCK = path.join(tmpDir, "revise.lock");
const REVISE_COUNT = path.join(tmpDir, "revise-count.json");
const REVISE_DAILY_CAP = Number(process.env.GROWTH_REVISE_DAILY_CAP || "50");
// lockfile は claude 実行1回ぶん(数分)を覆う。revise.ts の REVISE_TIMEOUT_MS(行の処理中=15分)
// より長くして、claude 実行中に reaper が起きても次の起動が割り込まないようにしている。
const LOCK_STALE_MS = 30 * 60 * 1000; // 30分超のロックは死んだプロセスとみなす

/** O_EXCL で排他的にロックファイルを作る。既存なら false。成功で true。 */
function createLockExclusive() {
  try {
    const fd = openSync(REVISE_LOCK, "wx"); // 既存なら EEXIST で例外
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

/** 多重起動防止のロック取得。取れなければ false。stale(>30分)なロックは奪って再取得。 */
function acquireReviseLock() {
  mkdirSync(tmpDir, { recursive: true });
  if (createLockExclusive()) return true;
  // 既存ロックあり。stale(>30分)なら奪って再取得(競合に負ければ false)。
  const ageMs = Date.now() - statSync(REVISE_LOCK).mtimeMs;
  if (ageMs < LOCK_STALE_MS) return false;
  rmSync(REVISE_LOCK, { force: true });
  return createLockExclusive();
}

function releaseReviseLock() {
  rmSync(REVISE_LOCK, { force: true });
}

/** 1日あたりの実行上限。超えていれば false。 */
function underDailyCap() {
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  if (existsSync(REVISE_COUNT)) {
    try {
      const data = JSON.parse(readFileSync(REVISE_COUNT, "utf-8"));
      if (data.date === today) count = Number(data.count) || 0;
    } catch {
      count = 0;
    }
  }
  if (count >= REVISE_DAILY_CAP) return false;
  writeFileSync(REVISE_COUNT, JSON.stringify({ date: today, count: count + 1 }));
  return true;
}

// 無人でも誤って外部反映しないよう、危険操作は明示拒否
const DISALLOW = ["Bash(git push:*)", "Bash(git commit:*)"];

const mode = process.argv[2];
const cfg = MODES[mode];
if (!cfg) {
  process.stderr.write(
    `使い方: node scripts/growth/run.mjs <weekly|drafts|initiatives|revise>\n`
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
// モデル指定があるモード(下書き)は --model を付ける
if (cfg.model) {
  args.push("--model", cfg.model);
}

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

// revise は高頻度起動。多重起動を lockfile で防ぎ、1日上限で暴走を止める(dry-run後・spawn前)。
if (cfg.lock) {
  if (!acquireReviseLock()) {
    process.stdout.write("revise: 既に実行中のためスキップします。\n");
    process.exit(0);
  }
  if (!underDailyCap()) {
    releaseReviseLock();
    process.stdout.write(`revise: 本日の実行上限(${REVISE_DAILY_CAP})に達したためスキップします。\n`);
    process.exit(0);
  }
}

// Windows では .cmd 解決のため shell:true が必要(Node の spawn 仕様)。
const child = spawn("claude", args, {
  stdio: ["pipe", "inherit", "inherit"],
  shell: isWin,
});
child.stdin.write(prompt);
child.stdin.end();
child.on("exit", async (code) => {
  if (cfg.lock) releaseReviseLock();
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
  if (cfg.lock) releaseReviseLock();
  process.stderr.write(`claude の起動に失敗しました: ${err.message}\n`);
  process.exit(1);
});
