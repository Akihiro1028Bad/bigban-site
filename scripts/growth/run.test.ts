// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// run.mjs は claude を spawn する薄い入口(カバレッジ対象外)。
// GROWTH_DRYRUN の起動引数だけを subprocess 経由で検証する(#247)。
const RUN = path.resolve("scripts/growth/run.mjs");
const SUBPROCESS_TEST_TIMEOUT_MS = 30_000;

vi.setConfig({ testTimeout: SUBPROCESS_TEST_TIMEOUT_MS });

function dryRun(mode: string, env: Record<string, string> = {}): string {
  return execFileSync("node", [RUN, mode], {
    env: {
      ...process.env,
      GROWTH_DRYRUN: "1",
      GROWTH_AGENT: "",
      GROWTH_MODEL_SETTINGS_DISABLE: "1",
      GROWTH_DRAFTS_MODEL: "",
      GROWTH_WEEKLY_MODEL: "",
      GROWTH_CODEX_MODEL: "",
      GROWTH_CODEX_REASONING_EFFORT: "",
      GROWTH_WEEKLY_CODEX_MODEL: "",
      GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "",
      ...env,
    },
    encoding: "utf-8",
  });
}

function dryRunWithSetting(
  mode: string,
  setting: { provider: "claude" | "codex"; model: string; effort: string },
  env: Record<string, string> = {},
): string {
  const binDir = mkdtempSync(path.join(tmpdir(), "growth-run-setting-bin-"));
  const npmPath = path.join(binDir, "npm");
  writeFileSync(
    npmPath,
    `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(setting)}'\n`,
    { mode: 0o755 },
  );
  return execFileSync("node", [RUN, mode], {
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      GROWTH_DRYRUN: "1",
      GROWTH_MODEL_SETTINGS_DISABLE: "",
      ...env,
    },
    encoding: "utf-8",
  });
}

function runWithStubbedCodex(mode: string, env: Record<string, string> = {}) {
  const binDir = mkdtempSync(path.join(tmpdir(), "growth-run-bin-"));
  const stubPath = path.join(binDir, "codex");
  writeFileSync(stubPath, "#!/bin/sh\ncat >/dev/null\nexit 0\n", { mode: 0o755 });
  return spawnSync("node", [RUN, mode], {
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      GROWTH_AGENT: "codex",
      GROWTH_MODEL_SETTINGS_DISABLE: "1",
      GROWTH_SKIP_PULL: "1",
      GROWTH_CODEX_MODEL: "",
      GROWTH_CODEX_REASONING_EFFORT: "",
      GROWTH_WEEKLY_CODEX_MODEL: "",
      GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "",
      ...env,
    },
    encoding: "utf-8",
  });
}

const PULL_MODES = [
  ["revise", "growth:revise"],
  ["regen", "growth:eyecatch-regen"],
  ["regen-body", "growth:body-image-regen"],
  ["advise", "growth:advise"],
  ["decorate", "growth:decorate"],
  ["apply", "growth:advise-apply"],
  ["comment-revise", "growth:comment-revise"],
] as const;

function runLockedModeWithStubs(options: {
  mode: string;
  settledExitCodes?: readonly number[];
  reapExitCode?: number;
  stateDir?: string;
  peekCount?: number;
  lockPid?: number;
  claimPageId?: string;
  orchestratorExitCode?: number;
}) {
  const mode = options.mode ?? "revise";
  const binDir = mkdtempSync(path.join(tmpdir(), "growth-run-loop-bin-"));
  const stateDir = options.stateDir ?? path.join(binDir, "state");
  const callLog = path.join(binDir, "calls.log");
  const settledCount = path.join(binDir, "settled-count");
  const promptLog = path.join(binDir, "prompt.log");
  const codexPath = path.join(binDir, "codex");
  const claudePath = path.join(binDir, "claude");
  const npmPath = path.join(binDir, "npm");
  if (options.lockPid !== undefined) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(path.join(stateDir, "revise.lock"), String(options.lockPid));
  }
  writeFileSync(codexPath, `#!/bin/sh\necho codex >> "${callLog}"\ncat > "${promptLog}"\nexit 0\n`, {
    mode: 0o755,
  });
  writeFileSync(claudePath, `#!/bin/sh\necho codex >> "${callLog}"\ncat > "${promptLog}"\nexit 0\n`, {
    mode: 0o755,
  });
  writeFileSync(
    npmPath,
    `#!/bin/sh
echo "npm $*" >> "${callLog}"
case "$*" in
  *"-- reap"*) exit ${options.reapExitCode ?? 0} ;;
  *"-- peek"*) echo ${options.peekCount ?? 1}; exit 0 ;;
  *"-- claim"*) echo ${options.claimPageId ?? "page-1"}; exit 0 ;;
  *"growth:loop-state -- assert-settled"*)
    count=$(cat "${settledCount}" 2>/dev/null || echo 0)
    count=$((count + 1))
    echo "$count" > "${settledCount}"
    case "$count" in
      1) exit ${options.settledExitCodes?.[0] ?? 0} ;;
      *) exit ${options.settledExitCodes?.[1] ?? options.settledExitCodes?.[0] ?? 0} ;;
    esac
    ;;
  *"growth:worker-log"*) echo disabled; exit 0 ;;
  *"growth:draft-orchestrator"*)
    echo "orchestrator-agent=\${GROWTH_AGENT:-}" >> "${callLog}"
    echo "orchestrator-model=\${GROWTH_CODEX_MODEL:-}" >> "${callLog}"
    exit ${options.orchestratorExitCode ?? 0}
    ;;
  *) exit 0 ;;
esac
`,
    { mode: 0o755 }
  );
  const result = spawnSync("node", [RUN, mode], {
    cwd: binDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      GROWTH_AGENT: "codex",
      GROWTH_MODEL_SETTINGS_DISABLE: "1",
      GROWTH_SKIP_PULL: "1",
      GROWTH_STATE_DIR: stateDir,
      GROWTH_REVISE_DAILY_CAP: "9999",
      GROWTH_CODEX_MODEL: mode === "drafts-auto" ? "gpt-leak" : "",
      GROWTH_CODEX_REASONING_EFFORT: "",
    },
    encoding: "utf-8",
  });
  return {
    result,
    calls: execFileSync("cat", [callLog], { encoding: "utf-8" }),
    prompt: existsSync(promptLog) ? readFileSync(promptLog, "utf-8") : "",
    stateDir,
  };
}

describe("run.mjs dry-run の --model(#247)", () => {
  it("全AI工程で旧モデル環境変数より工程別設定を優先する", () => {
    expect(
      dryRun("advise", {
        GROWTH_AGENT: "codex",
        GROWTH_CODEX_MODEL: "gpt-5.5",
      }),
    ).toContain("claude -p");
    expect(
      dryRun("weekly", {
        GROWTH_AGENT: "claude",
        GROWTH_WEEKLY_MODEL: "claude-opus-4-8",
      }),
    ).toContain("codex -a never exec");
  });

  it.each(["revise", "advise", "apply", "comment-revise"])(
    "Claude工程 %s は既定で Opus 5 / high を使う",
    (mode) => {
      const out = dryRun(mode);
      expect(out).toContain("claude -p");
      expect(out).toContain("--model claude-opus-5");
      expect(out).toContain("--effort high");
    },
  );

  it("記事アドバイスは既定で Claude Opus 5 / high を使う", () => {
    const out = dryRun("advise");
    expect(out).toContain("claude -p");
    expect(out).toContain("--model claude-opus-5");
    expect(out).toContain("--effort high");
    expect(out).toContain("--allowedTools");
    expect(out).toContain("mcp__claude_ai_Notion");
  });

  it.each(["drafts", "drafts-auto"])("%s は決定的オーケストレーターを起動する", (mode) => {
    const out = dryRun(mode);
    expect(out).toContain("npm run --silent growth:draft-orchestrator");
    expect(out).not.toContain("prompt:drafts.md");
  });

  it("weekly は既定で Codex GPT-5.6 Sol / xhigh を使う", () => {
    const out = dryRun("weekly");
    expect(out).toContain("codex -a never exec");
    expect(out).toContain("--model gpt-5.6-sol");
    expect(out).toContain('model_reasoning_effort="xhigh"');
  });

  it("旧週次モデル環境変数では工程別設定を上書きできない", () => {
    expect(dryRun("weekly", { GROWTH_WEEKLY_MODEL: "claude-opus-4-8" })).toContain(
      "--model gpt-5.6-sol"
    );
  });

  it("weekly を設定画面でClaudeにした場合も learning-log:recent を許可する", () => {
    expect(dryRunWithSetting("weekly", {
      provider: "claude",
      model: "claude-opus-4-8",
      effort: "high",
    })).toContain("growth:learning-log:recent");
  });

  it("weekly を設定画面でClaudeにした場合も Task を許可する", () => {
    expect(dryRunWithSetting("weekly", {
      provider: "claude",
      model: "claude-opus-4-8",
      effort: "high",
    })).toMatch(/--allowedTools .*\bTask\b/);
  });

  it("画像プロンプト設計は既定で Codex GPT-5.6 Sol / high を使う", () => {
    const out = dryRun("image-prompt");
    expect(out).toContain("image-prompt.md");
    expect(out).toContain("codex -a never exec");
    expect(out).toContain("--model gpt-5.6-sol");
    expect(out).toContain('model_reasoning_effort="high"');
  });

  it("regen は画像プロンプト設計と同じ GPT-5.6 Sol 設定を使う(#144)", () => {
    const out = dryRun("regen");
    expect(out).toContain("regen-eyecatch.md");
    expect(out).toContain("--model gpt-5.6-sol");
    expect(out).toContain('model_reasoning_effort="high"');
  });

  it("regen-body は画像プロンプト設計と同じ GPT-5.6 Sol 設定を使う(#156)", () => {
    const out = dryRun("regen-body");
    expect(out).toContain("regen-body-image.md");
    expect(out).toContain("--model gpt-5.6-sol");
  });

  it("advise はアドバイスプロンプトと --model を付ける(#146)", () => {
    const out = dryRun("advise");
    expect(out).toContain("advise.md");
    expect(out).toContain("--model claude-opus-5");
  });

  it("initiatives は既定で Codex GPT-5.5 / high を使う", () => {
    const out = dryRun("initiatives");
    expect(out).toContain("codex -a never exec");
    expect(out).toContain("--model gpt-5.5");
    expect(out).toContain('model_reasoning_effort="high"');
  });

  it("decorate は既定で Codex GPT-5.5 / medium を使う(#147)", () => {
    const out = dryRun("decorate");
    expect(out).toContain("decorate.md");
    expect(out).toContain("codex -a never exec");
    expect(out).toContain("--model gpt-5.5");
    expect(out).toContain('model_reasoning_effort="medium"');
  });
});

describe("run.mjs Claude のファイル生成権限", () => {
  it.each(["revise", "advise", "apply", "comment-revise"])(
    "mode=%s は Write を allowedTools に含む",
    (mode) => {
      const out = dryRun(mode);
      expect(out).toMatch(/--allowedTools .*\bWrite\b/);
    }
  );

  it("設定画面でdecorateをClaudeにした場合もWriteを許可する", () => {
    const out = dryRunWithSetting("decorate", {
      provider: "claude",
      model: "claude-opus-4-8",
      effort: "high",
    });
    expect(out).toMatch(/--allowedTools .*\bWrite\b/);
  });
});

describe("run.mjs pull 型ループの回収と完了確認", () => {
  it.each(PULL_MODES)("mode=%s は reap → 事前確認 → peek → AI → 事後確認の順で実行する", (mode, script) => {
    const { result, calls, stateDir } = runLockedModeWithStubs({ mode });

    expect(result.status).toBe(0);
    const reap = calls.indexOf(`${script} -- reap`);
    const precondition = calls.indexOf(`growth:loop-state -- assert-settled ${mode}`);
    const peek = calls.indexOf(`${script} -- peek`);
    const codex = calls.indexOf("codex");
    const postcondition = calls.lastIndexOf(`growth:loop-state -- assert-settled ${mode}`);
    expect(reap).toBeGreaterThanOrEqual(0);
    expect(reap).toBeLessThan(precondition);
    expect(precondition).toBeLessThan(peek);
    expect(peek).toBeLessThan(codex);
    expect(codex).toBeLessThan(postcondition);
    expect(existsSync(path.join(stateDir, "revise-count.json"))).toBe(true);
  });

  it("AI 終了後に処理中が残っていれば成功扱いしない", () => {
    const { result, calls } = runLockedModeWithStubs({ mode: "revise", settledExitCodes: [0, 1] });

    expect(calls).toContain("growth:loop-state -- assert-settled revise");
    expect(result.status).not.toBe(0);
  });

  it("reap 後に既存の処理中行が残っていれば AI を起動しない", () => {
    const { result, calls } = runLockedModeWithStubs({ mode: "revise", settledExitCodes: [1] });

    expect(result.status).not.toBe(0);
    expect(calls).not.toContain("growth:revise -- peek");
    expect(calls).not.toContain("codex");
  });

  it("reap が失敗すればロックを解放し、AI を起動しない", () => {
    const first = runLockedModeWithStubs({ mode: "revise", reapExitCode: 1 });
    const second = runLockedModeWithStubs({ mode: "revise", stateDir: first.stateDir });

    expect(first.result.status).not.toBe(0);
    expect(first.calls).not.toContain("codex");
    expect(second.result.status).toBe(0);
    expect(second.calls).toContain("growth:revise -- reap");
    expect(second.calls).toContain("codex");
  });

  it.each(["drafts-auto", "initiatives-auto"])(
    "reap を持たない %s には pull 型の回収・状態検証を適用しない",
    (mode) => {
      const { result, calls } = runLockedModeWithStubs({ mode });

      expect(result.status).toBe(0);
      expect(calls).not.toContain("-- reap");
      expect(calls).not.toContain("growth:loop-state");
    }
  );

  it("死亡 PID の共有 lock を即時回収し、reconcile ログ後に処理を継続する", () => {
    const { result, calls, stateDir } = runLockedModeWithStubs({
      mode: "revise",
      lockPid: 2_147_483_647,
      peekCount: 0,
    });

    expect(result.status).toBe(0);
    expect(calls.match(/growth:worker-log -- reconcile/g)).toHaveLength(1);
    expect(calls).toContain("--status reconcile --kind info");
    expect(calls).toContain("死亡 PID 2147483647");
    expect(calls).toContain("growth:revise -- peek");
    expect(calls).not.toContain("growth:notify-loop-fail");
    expect(existsSync(path.join(stateDir, "revise.lock"))).toBe(false);
  });

  it.each([
    ["drafts-auto", "growth:drafts-auto-peek"],
    ["initiatives-auto", "growth:initiatives-auto-peek"],
  ])("%s は専用peek=0なら AI を起動せずスキップする", (mode, peekScript) => {
    const { result, calls } = runLockedModeWithStubs({ mode, peekCount: 0 });

    expect(result.status).toBe(0);
    expect(calls).toContain(`${peekScript} -- peek`);
    expect(calls).not.toContain("codex");
  });

  it("drafts-auto は1件をclaimし、そのpageIdだけをオーケストレーターへ渡す", () => {
    const { result, calls } = runLockedModeWithStubs({
      mode: "drafts-auto",
      claimPageId: "page-claimed",
    });

    expect(result.status).toBe(0);
    expect(calls).toContain("growth:drafts-auto-peek -- claim");
    expect(calls.indexOf("-- claim")).toBeLessThan(calls.indexOf("growth:draft-orchestrator"));
    expect(calls).toContain("growth:draft-orchestrator -- page-claimed");
    expect(calls).toMatch(/^orchestrator-agent=$/m);
    expect(calls).toMatch(/^orchestrator-model=$/m);
  });

  it("オーケストレーターが詳細通知済みの終了コード70なら汎用失敗通知を重複送信しない", () => {
    const { result, calls } = runLockedModeWithStubs({
      mode: "drafts-auto",
      claimPageId: "page-failed",
      orchestratorExitCode: 70,
    });

    expect(result.status).toBe(70);
    expect(calls).not.toContain("growth:notify-loop-fail");
  });
});

describe("pull 型CLIの全ページ回収", () => {
  it.each(PULL_MODES)("mode=%s のCLIは queryAllDataSource で reap 対象を取得する", (_mode, script) => {
    const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    const command = packageJson.scripts[script];
    const cliPath = command?.split(" ").at(-1);

    expect(cliPath).toBeTruthy();
    const source = readFileSync(path.resolve(cliPath as string), "utf-8");
    expect(source).toContain("queryAllDataSource");
    expect(source).toContain("reapStaleRows");
  });
});

describe("run.mjs の工程別モデル設定", () => {
  const defaultCodexModes = [
    "weekly",
    "initiatives",
    "initiatives-auto",
    "image-prompt",
    "regen",
    "regen-body",
    "decorate",
  ];

  it("設定画面で選ばれたCodexをexec形式で起動する", () => {
    const out = dryRunWithSetting("advise", {
      provider: "codex",
      model: "gpt-5.5",
      effort: "high",
    });

    expect(out).toContain("codex -a never exec");
    expect(out).toContain("--sandbox danger-full-access");
    expect(out).toContain(" -C ");
    expect(out).not.toContain("--allowedTools");
    expect(out).not.toContain("mcp__claude_ai_Notion");
  });

  it("旧環境変数のプロバイダー・モデル・推論強度を無視する", () => {
    const out = dryRun("advise", {
      GROWTH_AGENT: "codex",
      GROWTH_CODEX_MODEL: "gpt-5.5",
      GROWTH_CODEX_REASONING_EFFORT: "xhigh",
    });

    expect(out).toContain("claude -p");
    expect(out).toContain("--model claude-opus-5");
    expect(out).toContain("--effort high");
  });

  it("Codexの実行制御用sandbox環境変数は維持する", () => {
    expect(dryRun("decorate", { GROWTH_CODEX_SANDBOX: "read-only" })).toContain(
      "--sandbox read-only",
    );
  });

  it("Codexの実行制御用approval環境変数は維持する", () => {
    expect(dryRun("decorate", { GROWTH_CODEX_APPROVAL: "on-request" })).toContain(
      "codex -a on-request exec",
    );
  });

  it("initiatives-auto は initiatives.md を使い既定のCodexで起動する", () => {
    const out = dryRun("initiatives-auto");

    expect(out).toContain("initiatives.md+codex-runtime");
    expect(out).toContain("codex -a never exec");
  });

  it.each(defaultCodexModes)("mode=%s は既定のCodex設定を使う", (mode) => {
    const out = dryRun(mode);

    expect(out).toContain("codex -a never exec");
    expect(out).not.toContain("--allowedTools");
    expect(out).not.toContain("mcp__claude_ai_Notion");
  });

  it("weekly の通常実行でも解決済み Codex モデルで worker-log を記録できる", () => {
    const result = runWithStubbedCodex("weekly");

    expect(result.stderr).not.toContain("ReferenceError");
    expect(result.stderr).not.toContain("CODEX_MODEL");
  });
});

describe("run.mjs 下書きオーケストレーター", () => {
  it.each(["drafts", "drafts-auto"])("mode=%s は環境変数のagent指定を評価しない", (mode) => {
    expect(dryRun(mode, { GROWTH_AGENT: "openai" })).toContain("growth:draft-orchestrator");
  });
});
