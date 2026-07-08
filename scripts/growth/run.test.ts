// @vitest-environment node
import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

// run.mjs は claude を spawn する薄い入口(カバレッジ対象外)。
// GROWTH_DRYRUN の起動引数だけを subprocess 経由で検証する(#247)。
const RUN = path.resolve("scripts/growth/run.mjs");

function dryRun(mode: string, env: Record<string, string> = {}): string {
  return execFileSync("node", [RUN, mode], {
    env: { ...process.env, GROWTH_DRYRUN: "1", ...env },
    encoding: "utf-8",
  });
}

describe("run.mjs dry-run の --model(#247)", () => {
  it("未指定では従来どおり Claude 引数で起動する", () => {
    const out = dryRun("advise");
    expect(out).toContain("claude -p");
    expect(out).toContain("--allowedTools");
    expect(out).toContain("mcp__claude_ai_Notion");
  });

  it("drafts は既定で --model claude-opus-4-8 を付ける", () => {
    expect(dryRun("drafts")).toContain("--model claude-opus-4-8");
  });

  it("GROWTH_DRAFTS_MODEL で執筆モデルを上書きできる", () => {
    expect(dryRun("drafts", { GROWTH_DRAFTS_MODEL: "claude-sonnet-4-6" })).toContain(
      "--model claude-sonnet-4-6"
    );
  });

  it("weekly は既定で --model claude-opus-4-8 を付ける", () => {
    expect(dryRun("weekly")).toContain("--model claude-opus-4-8");
  });

  it("GROWTH_WEEKLY_MODEL で週次モデルを上書きできる", () => {
    expect(dryRun("weekly", { GROWTH_WEEKLY_MODEL: "claude-sonnet-4-6" })).toContain(
      "--model claude-sonnet-4-6"
    );
  });

  it("weekly は learning-log:recent を allowedTools に含む", () => {
    expect(dryRun("weekly")).toContain("growth:learning-log:recent");
  });

  it("regen は再生成プロンプトと --model を付ける(#144)", () => {
    const out = dryRun("regen");
    expect(out).toContain("regen-eyecatch.md");
    expect(out).toContain("--model claude-opus-4-8");
  });

  it("regen-body は本文画像再生成プロンプトと --model を付ける(#156)", () => {
    const out = dryRun("regen-body");
    expect(out).toContain("regen-body-image.md");
    expect(out).toContain("--model claude-opus-4-8");
  });

  it("advise はアドバイスプロンプトと --model を付ける(#146)", () => {
    const out = dryRun("advise");
    expect(out).toContain("advise.md");
    expect(out).toContain("--model claude-opus-4-8");
  });

  it("decorate は装飾プロンプトと --model を付ける(#147)", () => {
    const out = dryRun("decorate");
    expect(out).toContain("decorate.md");
    expect(out).toContain("--model claude-opus-4-8");
  });
});

describe("run.mjs dry-run の GROWTH_AGENT=codex", () => {
  const codexModes = [
    "weekly",
    "drafts",
    "drafts-auto",
    "initiatives",
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
    expect(out).toContain("--sandbox workspace-write");
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

  it.each(codexModes)("mode=%s でも Codex dry-run を選べる", (mode) => {
    const out = dryRun(mode, { GROWTH_AGENT: "codex" });

    expect(out).toContain("codex -a never exec");
    expect(out).not.toContain("--allowedTools");
    expect(out).not.toContain("mcp__claude_ai_Notion");
  });
});
