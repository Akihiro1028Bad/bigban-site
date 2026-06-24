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
  it("drafts は既定で --model claude-opus-4-8 を付ける", () => {
    expect(dryRun("drafts")).toContain("--model claude-opus-4-8");
  });

  it("GROWTH_DRAFTS_MODEL で執筆モデルを上書きできる", () => {
    expect(dryRun("drafts", { GROWTH_DRAFTS_MODEL: "claude-sonnet-4-6" })).toContain(
      "--model claude-sonnet-4-6"
    );
  });

  it("weekly には --model を付けない", () => {
    expect(dryRun("weekly")).not.toContain("--model");
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
