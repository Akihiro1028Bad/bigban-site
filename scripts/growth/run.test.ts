// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
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

  it("regen は再生成プロンプトと --model を付ける(#144)", () => {
    const out = dryRun("regen");
    expect(out).toContain("regen-eyecatch.md");
    expect(out).toContain("--model claude-sonnet-5");
    expect(out).toContain("--effort medium");
  });

  it("regen-body は本文画像再生成プロンプトと --model を付ける(#156)", () => {
    const out = dryRun("regen-body");
    expect(out).toContain("regen-body-image.md");
    expect(out).toContain("--model claude-sonnet-5");
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

describe("run.mjs dry-run の GROWTH_AGENT=codex", () => {
  const codexModes = [
    "weekly",
    "drafts",
    "drafts-auto",
    "initiatives",
    "initiatives-auto",
    "revise",
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
    expect(() =>
      dryRun("weekly", {
        GROWTH_AGENT: "codex",
        GROWTH_WEEKLY_CODEX_REASONING_EFFORT: "maximum",
      })
    ).toThrow();
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
    expect(() => dryRun("advise", { GROWTH_AGENT: "openai" })).toThrow();
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
