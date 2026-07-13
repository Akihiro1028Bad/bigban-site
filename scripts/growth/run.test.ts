// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// run.mjs は claude を spawn する薄い入口(カバレッジ対象外)。
// GROWTH_DRYRUN の起動引数だけを subprocess 経由で検証する(#247)。
const RUN = path.resolve("scripts/growth/run.mjs");

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

function failedDryRun(mode: string, env: Record<string, string>) {
  return spawnSync("node", [RUN, mode], {
    env: {
      ...process.env,
      GROWTH_DRYRUN: "1",
      GROWTH_AGENT: "",
      GROWTH_MODEL_SETTINGS_DISABLE: "1",
      GROWTH_CODEX_REASONING_EFFORT: "",
      GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "",
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
}) {
  const mode = options.mode ?? "revise";
  const binDir = mkdtempSync(path.join(tmpdir(), "growth-run-loop-bin-"));
  const stateDir = options.stateDir ?? path.join(binDir, "state");
  const callLog = path.join(binDir, "calls.log");
  const settledCount = path.join(binDir, "settled-count");
  const codexPath = path.join(binDir, "codex");
  const npmPath = path.join(binDir, "npm");
  writeFileSync(codexPath, `#!/bin/sh\necho codex >> "${callLog}"\ncat >/dev/null\nexit 0\n`, {
    mode: 0o755,
  });
  writeFileSync(
    npmPath,
    `#!/bin/sh
echo "npm $*" >> "${callLog}"
case "$*" in
  *"-- reap"*) exit ${options.reapExitCode ?? 0} ;;
  *"-- peek"*) echo ${options.peekCount ?? 1}; exit 0 ;;
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
      GROWTH_CODEX_MODEL: "",
      GROWTH_CODEX_REASONING_EFFORT: "",
    },
    encoding: "utf-8",
  });
  return { result, calls: execFileSync("cat", [callLog], { encoding: "utf-8" }), stateDir };
}

describe("run.mjs dry-run の --model(#247)", () => {
  it("記事アドバイスは既定で Claude Opus 4.8 / high を使う", () => {
    const out = dryRun("advise");
    expect(out).toContain("claude -p");
    expect(out).toContain("--model claude-opus-4-8");
    expect(out).toContain("--effort high");
    expect(out).toContain("--allowedTools");
    expect(out).toContain("mcp__claude_ai_Notion");
  });

  it("drafts は既定で --model claude-opus-4-8 を付ける", () => {
    const out = dryRun("drafts");
    expect(out).toContain("--model claude-opus-4-8");
    expect(out).toContain("--effort high");
  });

  it("GROWTH_DRAFTS_MODEL で執筆モデルを上書きできる", () => {
    expect(dryRun("drafts", { GROWTH_DRAFTS_MODEL: "claude-sonnet-4-6" })).toContain(
      "--model claude-sonnet-4-6"
    );
  });

  it("weekly は既定で Codex GPT-5.6 Sol / xhigh を使う", () => {
    const out = dryRun("weekly");
    expect(out).toContain("codex -a never exec");
    expect(out).toContain("--model gpt-5.6-sol");
    expect(out).toContain('model_reasoning_effort="xhigh"');
  });

  it("GROWTH_WEEKLY_MODEL で従来どおり週次をClaudeへ上書きできる", () => {
    expect(dryRun("weekly", { GROWTH_WEEKLY_MODEL: "claude-sonnet-4-6" })).toContain(
      "--model claude-sonnet-4-6"
    );
  });

  it("weekly は learning-log:recent を allowedTools に含む", () => {
    expect(dryRun("weekly", { GROWTH_AGENT: "claude" })).toContain("growth:learning-log:recent");
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
    expect(out).toContain("--model claude-opus-4-8");
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
  it.each(["drafts", "drafts-auto", "revise", "advise", "decorate", "apply", "comment-revise"])(
    "mode=%s は Write を allowedTools に含む",
    (mode) => {
      const out = dryRun(mode, { GROWTH_AGENT: "claude" });
      expect(out).toMatch(/--allowedTools .*\bWrite\b/);
    }
  );
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

  it.each([
    ["drafts-auto", "growth:drafts-auto-peek"],
    ["initiatives-auto", "growth:initiatives-auto-peek"],
  ])("%s は専用peek=0なら AI を起動せずスキップする", (mode, peekScript) => {
    const { result, calls } = runLockedModeWithStubs({ mode, peekCount: 0 });

    expect(result.status).toBe(0);
    expect(calls).toContain(`${peekScript} -- peek`);
    expect(calls).not.toContain("codex");
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

describe("run.mjs dry-run の GROWTH_AGENT=codex", () => {
  const codexModes = [
    "weekly",
    "drafts",
    "drafts-auto",
    "initiatives",
    "initiatives-auto",
    "revise",
    "image-prompt",
    "regen",
    "regen-body",
    "advise",
    "decorate",
    "apply",
    "comment-revise",
  ];

  it("Codex CLI の exec 形式で起動する", () => {
    const out = dryRun("advise", { GROWTH_AGENT: "codex" });

    expect(out).toContain("codex -a never exec");
    expect(out).toContain("--sandbox danger-full-access");
    expect(out).toContain(" -C ");
  });

  it("Claude 専用の tool 引数を Codex へ渡さない", () => {
    const out = dryRun("decorate", { GROWTH_AGENT: "codex" });

    expect(out).not.toContain("--allowedTools");
    expect(out).not.toContain("mcp__claude_ai_Notion");
  });

  it("GROWTH_CODEX_MODEL で Codex モデルを指定できる", () => {
    expect(dryRun("advise", { GROWTH_AGENT: "codex", GROWTH_CODEX_MODEL: "gpt-5.5" })).toContain(
      "--model gpt-5.5"
    );
  });

  it("GROWTH_CODEX_REASONING_EFFORT で Codex の推論強度を指定できる", () => {
    expect(
      dryRun("advise", {
        GROWTH_AGENT: "codex",
        GROWTH_CODEX_REASONING_EFFORT: "xhigh",
      })
    ).toContain(' -c model_reasoning_effort="xhigh"');
  });

  it("weekly は週次専用のモデルと推論強度を共通設定より優先する", () => {
    const out = dryRun("weekly", {
      GROWTH_AGENT: "codex",
      GROWTH_CODEX_MODEL: "gpt-common",
      GROWTH_CODEX_REASONING_EFFORT: "medium",
      GROWTH_WEEKLY_CODEX_MODEL: "gpt-5.6-sol",
      GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "xhigh",
    });

    expect(out).toContain("--model gpt-5.6-sol");
    expect(out).toContain(' -c model_reasoning_effort="xhigh"');
    expect(out).not.toContain("--model gpt-common");
  });

  it("週次専用設定は週次以外の Codex モードへ漏れない", () => {
    const out = dryRun("advise", {
      GROWTH_AGENT: "codex",
      GROWTH_WEEKLY_CODEX_MODEL: "gpt-5.6-sol",
      GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "xhigh",
    });

    expect(out).not.toContain("--model gpt-5.6-sol");
    expect(out).toContain('model_reasoning_effort="high"');
    expect(out).not.toContain('model_reasoning_effort="xhigh"');
  });

  it("不正な Codex 推論強度は agent 起動前に拒否する", () => {
    const result = failedDryRun("weekly", {
      GROWTH_AGENT: "codex",
      GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "maximum",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Codex 推論強度が不正です: maximum");
  });

  it("GROWTH_CODEX_SANDBOX で Codex sandbox を指定できる", () => {
    expect(
      dryRun("advise", { GROWTH_AGENT: "codex", GROWTH_CODEX_SANDBOX: "read-only" })
    ).toContain("--sandbox read-only");
  });

  it("GROWTH_CODEX_APPROVAL で Codex approval を指定できる", () => {
    expect(
      dryRun("advise", { GROWTH_AGENT: "codex", GROWTH_CODEX_APPROVAL: "on-request" })
    ).toContain("codex -a on-request exec");
  });

  it("不正な GROWTH_AGENT は非0終了する", () => {
    const result = failedDryRun("advise", { GROWTH_AGENT: "openai" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("GROWTH_AGENT は claude または codex を指定してください");
  });

  it("drafts-auto は drafts.md を使い Codex でも起動できる", () => {
    const out = dryRun("drafts-auto", { GROWTH_AGENT: "codex" });

    expect(out).toContain("drafts.md+codex-runtime");
    expect(out).toContain("codex -a never exec");
  });

  it("initiatives-auto は initiatives.md を使い Codex でも起動できる", () => {
    const out = dryRun("initiatives-auto", { GROWTH_AGENT: "codex" });

    expect(out).toContain("initiatives.md+codex-runtime");
    expect(out).toContain("codex -a never exec");
  });

  it.each(codexModes)("mode=%s でも Codex dry-run を選べる", (mode) => {
    const out = dryRun(mode, { GROWTH_AGENT: "codex" });

    expect(out).toContain("codex -a never exec");
    expect(out).not.toContain("--allowedTools");
    expect(out).not.toContain("mcp__claude_ai_Notion");
  });

  it("weekly の通常実行でも解決済み Codex モデルで worker-log を記録できる", () => {
    const result = runWithStubbedCodex("weekly", {
      GROWTH_WEEKLY_CODEX_MODEL: "gpt-5.6-sol",
      GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "xhigh",
    });

    expect(result.stderr).not.toContain("ReferenceError");
    expect(result.stderr).not.toContain("CODEX_MODEL");
  });
});
