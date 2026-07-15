// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDraftAgentInvocation, draftPhaseExecutionLabel, resolveDraftPhaseSetting } from "./draftAgent";

describe("draftAgent", () => {
  it("ClaudeのリサーチはWebだけ、執筆はツールなしで別セッションにする", () => {
    const research = buildDraftAgentInvocation({
      phase: "draft-research",
      setting: { provider: "claude", model: "claude-opus-4-8", effort: "high" },
      cwd: "/tmp/clean",
      schemaPath: "/tmp/research-schema.json",
      outputPath: "/tmp/research-output.json",
    });
    expect(research.command).toBe("claude");
    expect(research.args.join(" ")).toContain("--tools WebSearch,WebFetch");
    expect(research.args.join(" ")).toContain("--allowedTools WebSearch,WebFetch");
    expect(research.args.join(" ")).not.toContain("Bash");
    expect(research.args.join(" ")).not.toContain("Task");
    expect(research.isolatedCwd).toBe("/tmp/clean");

    const writer = buildDraftAgentInvocation({
      phase: "draft-write",
      setting: { provider: "claude", model: "claude-opus-4-8", effort: "high" },
      cwd: "/tmp/write",
      schemaPath: "/tmp/writer-schema.json",
      outputPath: "/tmp/writer-output.json",
    });
    expect(writer.args).toContain("");
    expect(writer.args.join(" ")).toContain("--no-session-persistence");
    expect(writer.args.join(" ")).not.toContain("--allowedTools");
    expect(writer.args.join(" ")).not.toContain("WebSearch");
  });

  it("Codexはread-only・ephemeral・構造化出力で起動する", () => {
    const invocation = buildDraftAgentInvocation({
      phase: "draft-write",
      setting: { provider: "codex", model: "gpt-5.6-sol", effort: "medium" },
      cwd: "/tmp/write",
      schemaPath: "/tmp/writer-schema.json",
      outputPath: "/tmp/writer-output.json",
    });
    expect(invocation.command).toBe("codex");
    expect(invocation.args).toEqual(expect.arrayContaining([
      "--sandbox", "read-only", "--ephemeral", "--ignore-user-config", "--output-schema", "/tmp/writer-schema.json",
      "--output-last-message", "/tmp/writer-output.json",
    ]));
    expect(invocation.args).toEqual(expect.arrayContaining([
      "--disable", "shell_tool",
      "--disable", "unified_exec",
      "--disable", "browser_use",
      "--disable", "multi_agent",
    ]));
  });

  it("Codexリサーチはshellとサブエージェントを無効化し、Web機能は残す", () => {
    const invocation = buildDraftAgentInvocation({
      phase: "draft-research",
      setting: { provider: "codex", model: "gpt-5.6-sol", effort: "medium" },
      cwd: "/tmp/research",
      schemaPath: "/tmp/research-schema.json",
      outputPath: "/tmp/research-output.json",
    });

    expect(invocation.args).toEqual(expect.arrayContaining([
      "--disable", "shell_tool",
      "--disable", "unified_exec",
      "--disable", "multi_agent",
    ]));
    expect(invocation.args).not.toEqual(expect.arrayContaining(["--disable", "browser_use"]));
  });

  it("承認画面で保存されたCodex設定をそのまま使う", () => {
    expect(resolveDraftPhaseSetting({
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "medium",
    })).toEqual({ provider: "codex", model: "gpt-5.6-sol", effort: "medium" });
  });

  it("worker logと失敗通知へ工程と実行モデルを記録できる", () => {
    expect(draftPhaseExecutionLabel("draft-research", {
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "medium",
    })).toBe("draft-research: codex / gpt-5.6-sol / medium");
  });

  it("保存済みのClaude設定もそのまま使う", () => {
    const shared = { provider: "claude" as const, model: "claude-opus-4-8", effort: "high" as const };
    expect(resolveDraftPhaseSetting(shared)).toEqual(shared);
  });

  it("保存済み設定の不正なモデル・推論強度を拒否する", () => {
    expect(() => resolveDraftPhaseSetting({
      provider: "codex",
      model: "claude-opus-4-8",
      effort: "medium",
    })).toThrow(/組み合わせ/);
    expect(() => resolveDraftPhaseSetting({
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "max",
    })).toThrow(/推論強度/);
  });

  it("Claude呼び出しはschema省略時にも既定schemaを渡す", () => {
    const invocation = buildDraftAgentInvocation({
      phase: "draft-research",
      setting: { provider: "claude", model: "claude-opus-4-8", effort: "high" },
      cwd: "/tmp/research",
      schemaPath: "/tmp/schema.json",
      outputPath: "/tmp/output.json",
    });
    expect(invocation.args).toContain('{"type":"object"}');
    expect(invocation.outputFromStdout).toBe(true);
  });
});
