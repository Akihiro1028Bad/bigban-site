import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import config from "./vitest.config";
import alternatives from "./docs/testing/growth-coverage-alternatives.json";

function staticConfig() {
  if (typeof config === "function" || config instanceof Promise) {
    throw new TypeError("静的なVitest設定を想定しています");
  }
  return config;
}

describe("vitest config", () => {
  it("ローカルのClaude worktreeをテスト探索対象から除外する", () => {
    expect(staticConfig().test?.exclude).toContain(".claude/worktrees/**");
  });

  it("Playwright E2EをVitestのテスト探索対象から除外する", () => {
    expect(staticConfig().test?.exclude).toContain("e2e/**");
  });

  it("下書きオーケストレーターCLIは薄いI/O入口としてcoverage対象外にする", () => {
    expect(staticConfig().test?.coverage?.exclude).toContain("scripts/growth/draft-orchestrator-cli.ts");
  });

  it("coverage除外と機械可読な代替保証のpath集合が完全一致する", () => {
    const excluded = staticConfig().test?.coverage?.exclude ?? [];
    expect([...excluded].sort()).toEqual(Object.keys(alternatives.exclusions).sort());
  });

  it("全除外に保証先・理由・保証種別・残存リスクがある", () => {
    for (const entry of Object.values(alternatives.exclusions)) {
      expect(entry.reason.trim()).not.toBe("");
      expect(entry.guarantees.length).toBeGreaterThan(0);
      expect(entry.guarantees.every((guarantee) => guarantee.trim() !== "")).toBe(true);
      expect(entry.kind.trim()).not.toBe("");
      expect(entry.residualRisk.trim()).not.toBe("");
    }
  });

  it("Markdown対応表に全pathを掲載する", () => {
    const markdown = readFileSync("docs/testing/growth-coverage-alternatives.md", "utf8");
    for (const path of Object.keys(alternatives.exclusions)) expect(markdown).toContain(`\`${path}\``);
  });

  it("application service と daemon smoke をcoverage除外にしない", () => {
    const excluded = staticConfig().test?.coverage?.exclude ?? [];
    expect(excluded).not.toContain("scripts/growth/draftOrchestratorApplication.ts");
    expect(excluded).not.toContain("scripts/growth/publishDueApplication.ts");
    expect(excluded).not.toContain("scripts/growth/daemonSmoke.ts");
  });
});
