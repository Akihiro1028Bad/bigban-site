/**
 * グロース3モードの起動ランチャー(headless agent)。
 * Windows / macOS 両対応。
 *
 *   npm run growth:weekly        週次モード(分析→Notionレポート+施策提案)
 *   npm run growth:drafts        下書きモード(承認記事→microCMS下書き+画像)
 *   npm run growth:initiatives   施策実行モード(承認施策→Notion本文に文案/仕様書)
 *   npm run growth:initiatives-auto   施策自動成果物化(承認施策がある時だけ initiatives)
 *
 * 動作確認(agent を起動せずコマンドだけ表示): GROWTH_DRYRUN=1 を付ける。
 *
 * プロンプトは引数ではなく**標準入力**で渡す(巨大引数の引用符問題を回避し、
 * Windows の claude.cmd 起動でも安定させるため)。
 */

import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
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
const FAILURE_LOG_PATH = "data/growth-failures.log";

// 共通の許可ツール。Claude headless では Notion が mcp__claude_ai_Notion になる。
const COMMON = ["Read", "Glob", "Grep", "Task", "WebSearch", "WebFetch", "mcp__claude_ai_Notion"];

// 執筆(下書きモード)は記事品質の勝負所なので既定で Opus 4.8 に固定する(#247)。
// GROWTH_DRAFTS_MODEL で上書き可能。
const DRAFTS_MODEL = process.env.GROWTH_DRAFTS_MODEL || "claude-opus-4-8";
// 週次(ネタ出し)は下流(記事品質)全体の上限を決めるため既定で Opus 4.8 に固定する。
// GROWTH_WEEKLY_MODEL で上書き可能。
const WEEKLY_MODEL = process.env.GROWTH_WEEKLY_MODEL || "claude-opus-4-8";

const AGENT = process.env.GROWTH_AGENT || "claude";
const CODEX_APPROVAL = process.env.GROWTH_CODEX_APPROVAL || "never";
const CODEX_SANDBOX = process.env.GROWTH_CODEX_SANDBOX || "workspace-write";
const CODEX_MODEL = process.env.GROWTH_CODEX_MODEL || "";

const CODEX_RUNTIME_PREAMBLE = `
<runtime>
You are running under Codex CLI, not Claude Code.
Do not assume Claude-only tools such as mcp__claude_ai_Notion are available.
Use the available Notion tool or connector configured in this Codex environment.
For npm scripts, stdout/stderr from the script is the source of truth.
Do not run git commit, git push, or production publish operations.
</runtime>
`.trim();

const MODES = {
  // 週次は取得・既存行読み出し・学習ログ読み出しだけ許可する。
  // 既存行を確実に読めるようにし、headless が冪等性を推測して誤スキップするのを防ぐ。
  weekly: {
    prompt: "weekly.md",
    allow: [
      ...COMMON,
      "Bash(npm run growth:fetch)",
      "Bash(npm run growth:existing)",
      "Bash(npm run growth:learning-log:recent)",
    ],
    model: WEEKLY_MODEL,
  },
  // 下書き/施策実行は複数スクリプト・画像生成・縮小を回すため Bash 全般を許可
  drafts: { prompt: "drafts.md", allow: [...COMMON, "Bash"], model: DRAFTS_MODEL },
  // 下書き自動生成。承認済み/生成中かつ下書きID未作成の行がある時だけ drafts.md を起動する。
  "drafts-auto": {
    prompt: "drafts.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
  initiatives: { prompt: "initiatives.md", allow: [...COMMON, "Bash"] },
  // 施策自動成果物化。承認済みの施策提案がある時だけ initiatives.md を起動する。
  "initiatives-auto": {
    prompt: "initiatives.md",
    allow: [...COMMON, "Bash"],
    lock: true,
  },
  // 構成案修正(#44)。決定的処理は growth:revise CLI、claude はテキスト修正のみ。
  // 5分間隔の高頻度起動なので lockfile で多重起動を防ぎ、1日上限で暴走も止める。
  revise: {
    prompt: "revise-outline.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
  // アイキャッチ AI 再生成(#144)。決定的処理は growth:eyecatch-regen CLI、claude は
  // 指示→英語の行為に翻案して画像生成・アップロードを回す。revise と同じ lock/上限を共有。
  regen: {
    prompt: "regen-eyecatch.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
  // 本文画像 AI 再生成(#156)。決定的処理は growth:body-image-regen CLI、claude は
  // 指示→スタイル/説明を決めて画像生成・アップロードを回す。revise/regen と lock/上限を共有。
  "regen-body": {
    prompt: "regen-body-image.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
  // 記事スタイリング・アドバイザー(#146)。決定的処理は growth:advise CLI、claude は
  // 本文を style-guide に照らして分析しアドバイスJSONを作る(read-only)。lock/上限を共有。
  advise: {
    prompt: "advise.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
  // 記事装飾アシスタント(#147)。決定的処理は growth:decorate CLI、claude は本文をトップレベル
  // 要素に分割し装飾提案(メタのみ・生HTML無し)を作る。反映は承認画面側。lock/上限を共有。
  decorate: {
    prompt: "decorate.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
  // アドバイス採用→本文反映(#165)。決定的処理は growth:advise-apply CLI、claude は採用された
  // fix の passage だけを書き換え before/after 案(メタ)を作る。反映は承認画面側。lock/上限を共有。
  apply: {
    prompt: "advise-apply.md",
    allow: [...COMMON, "Bash"],
    model: DRAFTS_MODEL,
    lock: true,
  },
  // 本文インラインコメント→AI修正(#182)。決定的処理は growth:comment-revise CLI、claude は
  // コメントされた文を含むブロックだけを書き換え before/after 案(メタ)を作る。反映は承認画面側。lock/上限を共有。
  "comment-revise": {
    prompt: "comment-revise.md",
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
    `使い方: node scripts/growth/run.mjs <weekly|drafts|drafts-auto|initiatives|initiatives-auto|revise|regen|regen-body|advise|decorate|apply|comment-revise>\n`
  );
  process.exit(1);
}

if (AGENT !== "claude" && AGENT !== "codex") {
  process.stderr.write(`GROWTH_AGENT は claude または codex を指定してください: ${AGENT}\n`);
  process.exit(1);
}

const promptBody = readFileSync(path.join(promptsDir, cfg.prompt), "utf-8");
const prompt = AGENT === "codex" ? `${CODEX_RUNTIME_PREAMBLE}\n\n${promptBody}` : promptBody;

const isWin = process.platform === "win32";

function buildClaudeArgs() {
  // プロンプトは stdin で渡すので引数には含めない
  const claudeArgs = [
    "-p",
    "--permission-mode",
    "default",
    "--allowedTools",
    ...cfg.allow,
    "--disallowedTools",
    ...DISALLOW,
  ];
  // モデル指定があるモードは --model を付ける
  if (cfg.model) {
    claudeArgs.push("--model", cfg.model);
  }
  return claudeArgs;
}

function buildCodexArgs() {
  const codexArgs = ["-a", CODEX_APPROVAL, "exec", "--sandbox", CODEX_SANDBOX, "-C", process.cwd()];
  if (CODEX_MODEL) {
    codexArgs.push("--model", CODEX_MODEL);
  }
  codexArgs.push("-");
  return codexArgs;
}

const agentCommand = AGENT === "codex" ? "codex" : "claude";
const args = AGENT === "codex" ? buildCodexArgs() : buildClaudeArgs();

if (process.env.GROWTH_DRYRUN) {
  const promptLabel = AGENT === "codex" ? `${cfg.prompt}+codex-runtime` : cfg.prompt;
  process.stdout.write(
    `[dry-run] (stdin=<prompt:${promptLabel}>) ${agentCommand} ${args.join(" ")}\n`
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

/** 現在の HEAD 短縮 SHA。取得失敗時は空文字(通知側で「取得できませんでした」を出す)。 */
function currentShortSha() {
  const res = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf-8" });
  return res.status === 0 ? (res.stdout || "").trim() : "";
}

/** 現在のブランチ名。detached など取得できない場合は "HEAD"。 */
function currentBranch() {
  const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf-8" });
  const name = res.status === 0 ? (res.stdout || "").trim() : "";
  return name || "HEAD";
}

/** この工程を再開するためのコマンド(mode → npm script)。loop 系は *-loop に対応付ける。 */
const RESUME_COMMANDS = {
  weekly: "npm run growth:weekly",
  drafts: "npm run growth:drafts",
  "drafts-auto": "npm run growth:drafts-auto",
  initiatives: "npm run growth:initiatives",
  "initiatives-auto": "npm run growth:initiatives-auto",
  revise: "npm run growth:revise-loop",
  regen: "npm run growth:regen-loop",
  "regen-body": "npm run growth:regen-body-loop",
  advise: "npm run growth:advise-loop",
  decorate: "npm run growth:decorate-loop",
  apply: "npm run growth:advise-apply-loop",
  "comment-revise": "npm run growth:comment-revise-loop",
};

/** mode → 読み取り専用 peek を持つ npm script。next の候補集合と一致させる。 */
const PEEK_COMMANDS = {
  "drafts-auto": "growth:drafts-auto-peek",
  "initiatives-auto": "growth:initiatives-auto-peek",
  revise: "growth:revise",
  regen: "growth:eyecatch-regen",
  "regen-body": "growth:body-image-regen",
  advise: "growth:advise",
  decorate: "growth:decorate",
  apply: "growth:advise-apply",
  "comment-revise": "growth:comment-revise",
};

function cleanFailureField(value) {
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
}

// Keep this format mirrored with scripts/growth/notifyGate.ts (formatFailureLogEntry).
function formatFailureLogEntry({ nowIso, source, exitCode, resume, detail }) {
  const parts = [`source=${cleanFailureField(source)}`];
  if (exitCode !== undefined) parts.push(`exit=${cleanFailureField(exitCode)}`);
  if (resume) parts.push(`resume=${cleanFailureField(resume)}`);
  if (detail) parts.push(`detail=${cleanFailureField(detail)}`);
  return [nowIso, ...parts].join("\t");
}

function appendGrowthFailureLog({ source, exitCode, resume, detail }) {
  const filePath = path.join(process.cwd(), FAILURE_LOG_PATH);
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(
    filePath,
    `${formatFailureLogEntry({
      nowIso: new Date().toISOString(),
      source,
      exitCode,
      resume,
      detail,
    })}\n`,
    "utf-8"
  );
}

/**
 * weekly モードの実行前に最新を取り込む(#219 / P1⑤): git fetch → git pull --ff-only(現在ブランチ)。
 * 失敗(非 ff・conflict・ネットワーク断)は工程を中断し、工程名・再開コマンド・原因を
 * LINE 通知して exit≠0 で抜ける(旧版のまま走り続けるのを防ぐ・沈黙させない)。
 * weekly 以外、または GROWTH_DRYRUN / GROWTH_SKIP_PULL 指定時は no-op(動作確認を壊さない)。
 * push/commit の DISALLOW は不変。
 */
function pullLatestOrAbort() {
  // ⚠️ この mode 判定、skip 判定、exit-code 成否判定は gitPull.ts(shouldPullForMode /
  // PULL_SKIP_ENV_VARS / shouldSkipPull / classifyPullResult)のミラー実装(run.mjs は .ts を import 不可)。
  // env 名や判定を変更する時は gitPull.ts と両方を必ず同時に更新すること。
  if (mode !== "weekly") return;
  if (process.env.GROWTH_DRYRUN || process.env.GROWTH_SKIP_PULL) return;
  const branch = currentBranch();
  // fetch は best-effort(オフラインでも pull --ff-only 側で確実に失敗を拾う)。
  spawnSync("git", ["fetch", "--quiet"], { stdio: ["ignore", "inherit", "inherit"] });
  const pull = spawnSync("git", ["pull", "--ff-only"], { encoding: "utf-8" });
  const detail = `${pull.stdout ?? ""}${pull.stderr ?? ""}`.trim().split("\n").slice(-3).join(" ");
  if ((pull.status ?? 1) !== 0) {
    const resumeCommand = RESUME_COMMANDS[mode] || `npm run growth:${mode}`;
    process.stderr.write(
      `git pull --ff-only に失敗しました(${mode})。工程を中断します。再開: ${resumeCommand}\n`
    );
    appendGrowthFailureLog({
      source: "pull",
      exitCode: pull.status ?? 1,
      resume: resumeCommand,
      detail,
    });
    // 失敗を沈黙させない: LINE へ通知する(本文は gitPull.ts、送信は notify-pull-fail CLI)。
    spawnSync(isWin ? "npm.cmd" : "npm", ["run", "growth:notify-pull-fail"], {
      stdio: ["ignore", "inherit", "inherit"],
      shell: isWin,
      env: {
        ...process.env,
        GROWTH_PULL_MODE: mode,
        GROWTH_PULL_BRANCH: branch,
        GROWTH_PULL_RESUME: resumeCommand,
        GROWTH_PULL_DETAIL: detail,
      },
    });
    spawnSync(isWin ? "npm.cmd" : "npm",
      ["run", "growth:learning-log", "--", "append-fail", "pull", String(pull.status ?? 1), detail],
      { stdio: ["ignore", "inherit", "inherit"], shell: isWin, env: { ...process.env } });
    process.exit(1);
  }
}

// weekly は最新を取り込んでから起動する(dry-run/skip/weekly 以外は no-op・失敗時はここで中断)。
pullLatestOrAbort();

// pull 後の実行 SHA(週次通知に載せてデプロイ側とのスキュー確認を可能にする=#219)。
const runSha = currentShortSha();

// scripts/growth/peekGate.ts (shouldRunLoop) とミラー。run.mjs は .ts を import しない。
// きれいに数値0を返した時だけ「依頼なし」とみなし、それ以外は実依頼取りこぼし防止で走らせる。
// ⚠️ この判定は scripts/growth/peekGate.ts(shouldRunLoop)のミラー。両方同時に更新すること。
// `npm run` はバナーを stdout に前置するため、最後の非空行を件数として解釈する。
function shouldRunLoopFromPeek(peekStdout, peekExitCode) {
  if (peekExitCode !== 0) return true;
  const lines = String(peekStdout)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines[lines.length - 1];
  if (last === undefined || !/^\d+$/.test(last)) return true;
  return Number(last) > 0;
}

function peekShouldRunLoop() {
  const scriptName = PEEK_COMMANDS[mode];
  if (!scriptName) return true;
  const npm = isWin ? "npm.cmd" : "npm";
  // --silent で npm バナーを抑制(残っても shouldRunLoopFromPeek が最後の行で吸収)。
  const res = spawnSync(npm, ["run", "--silent", scriptName, "--", "peek"], {
    encoding: "utf-8",
    shell: isWin,
    env: { ...process.env },
  });
  return shouldRunLoopFromPeek(res.stdout ?? "", res.status);
}

// lock 系ループは高頻度起動。多重起動を lockfile で防ぎ、依頼ありの実作業だけ1日上限に数える。
if (cfg.lock) {
  if (!acquireReviseLock()) {
    process.stdout.write(`${mode}: 既に実行中のためスキップします。\n`);
    process.exit(0);
  }
  if (!peekShouldRunLoop()) {
    releaseReviseLock();
    process.stdout.write(`${mode}: 依頼なし(スキップ)\n`);
    process.exit(0);
  }
  if (!underDailyCap()) {
    releaseReviseLock();
    process.stdout.write(`${mode}: 本日の実行上限(${REVISE_DAILY_CAP})に達したためスキップします。\n`);
    process.exit(0);
  }
}

/**
 * loop/実行モードの失敗を LINE 通知する(#220 / P1⑥)。weekly は独自の notify-line 経路を持つため対象外。
 * 送信は notify-loop-fail CLI(本文は loopFailure.ts)。spawnSync で確実に完了させてから exit する。
 */
function notifyLoopFail(kind, { exitCode, detail } = {}) {
  const resumeCommand = RESUME_COMMANDS[mode] || `npm run growth:${mode}`;
  appendGrowthFailureLog({
    source: mode,
    exitCode,
    resume: resumeCommand,
    detail: detail || kind,
  });
  if (mode === "weekly") return; // weekly は notify-line 側で kind=weekly の通知を送る
  spawnSync(isWin ? "npm.cmd" : "npm", ["run", "growth:notify-loop-fail"], {
    stdio: ["ignore", "inherit", "inherit"],
    shell: isWin,
    env: {
      ...process.env,
      GROWTH_LOOP_MODE: mode,
      GROWTH_LOOP_RESUME: resumeCommand,
      GROWTH_LOOP_KIND: kind,
      ...(exitCode !== undefined ? { GROWTH_LOOP_EXIT: String(exitCode) } : {}),
      ...(detail ? { GROWTH_LOOP_DETAIL: detail } : {}),
    },
  });
  // #SI1(d): 工程失敗を学習ログ台帳へ best-effort 追記(LINE 通知の後・exit は変えない)。
  spawnSync(isWin ? "npm.cmd" : "npm",
    ["run", "growth:learning-log", "--", "append-fail", mode, String(exitCode ?? ""), detail ?? ""],
    { stdio: ["ignore", "inherit", "inherit"], shell: isWin, env: { ...process.env } });
}

// Windows では .cmd 解決のため shell:true が必要(Node の spawn 仕様)。
const child = spawn(agentCommand, args, {
  stdio: ["pipe", "inherit", "inherit"],
  shell: isWin,
});
child.stdin.write(prompt);
child.stdin.end();
child.on("exit", async (code) => {
  if (cfg.lock) releaseReviseLock();
  const exitCode = code ?? 0;
  // 週次モードは分析(Notion書き込み)完了後に LINE 通知を実行する。
  // agent の出力には依存せず、スナップショット + Notion から通知を組み立てる。
  // 異常終了(exit≠0)でも、失敗を**沈黙させない**ためにエラー通知を送る。
  if (mode === "weekly") {
    if (exitCode !== 0) {
      notifyLoopFail("nonzero-exit", { exitCode });
    }
    const env =
      exitCode === 0
        ? { GROWTH_RUN_SHA: runSha }
        : { GROWTH_NOTIFY_ERROR: "1", GROWTH_WEEKLY_EXIT_CODE: String(exitCode) };
    const notifyCode = await runNpm("growth:notify-line", env);
    if (exitCode !== 0) {
      spawnSync(isWin ? "npm.cmd" : "npm",
        ["run", "growth:learning-log", "--", "append-fail", "weekly", String(exitCode), ""],
        { stdio: ["ignore", "inherit", "inherit"], shell: isWin, env: { ...process.env } });
    }
    // 異常終了時は元の失敗を握り潰さないよう、weekly の終了コードを優先する。
    process.exit(exitCode !== 0 ? exitCode : notifyCode);
  }
  // loop/実行モードの非0 exit も沈黙させない(#220): reap/next が回らない障害を LINE 通知。
  if (exitCode !== 0) {
    notifyLoopFail("nonzero-exit", { exitCode });
  }
  process.exit(exitCode);
});
child.on("error", (err) => {
  if (cfg.lock) releaseReviseLock();
  process.stderr.write(`${agentCommand} の起動に失敗しました: ${err.message}\n`);
  // agent 未起動(PATH 崩れ・サブスク切れ)を沈黙させない(#220)。weekly は notify-line 側で通知。
  if (mode === "weekly") {
    notifyLoopFail("spawn-error", { exitCode: 1, detail: err.message });
    runNpm("growth:notify-line", {
      GROWTH_NOTIFY_ERROR: "1",
      GROWTH_WEEKLY_EXIT_CODE: "1",
    }).finally(() => process.exit(1));
    return;
  }
  notifyLoopFail("spawn-error", { detail: err.message });
  process.exit(1);
});
