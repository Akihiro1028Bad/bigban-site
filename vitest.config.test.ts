import { describe, expect, it } from "vitest";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";

import config from "./vitest.config";
import alternatives from "./docs/testing/growth-coverage-alternatives.json";

function staticConfig() {
  if (typeof config === "function" || config instanceof Promise) {
    throw new TypeError("静的なVitest設定を想定しています");
  }
  return config;
}

interface CoverageAlternativeEntry {
  guarantees: string[];
  excludedFiles?: string[];
}

function expandedFiles(pattern: string): string[] {
  if (!pattern.includes("*")) return [pattern];
  return globSync(pattern).filter((file) => existsSync(file) && statSync(file).isFile()).sort();
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

  it("保証先は実在する具体的なテストファイルである", () => {
    for (const entry of Object.values(alternatives.exclusions) as CoverageAlternativeEntry[]) {
      for (const guarantee of entry.guarantees) {
        expect(guarantee).toMatch(/\.(?:test|spec)\.(?:ts|tsx|mjs)$/);
        expect(existsSync(guarantee), guarantee).toBe(true);
      }
    }
  });

  it("glob除外を含む全pathを実ファイルへ展開して追跡する", () => {
    for (const [pattern, entry] of Object.entries(alternatives.exclusions) as Array<[
      string,
      CoverageAlternativeEntry,
    ]>) {
      expect(entry.excludedFiles?.slice().sort(), pattern).toEqual(expandedFiles(pattern));
    }
  });

  it("Markdown対応表に全pathを掲載する", () => {
    const markdown = readFileSync("docs/testing/growth-coverage-alternatives.md", "utf8");
    for (const [path, entry] of Object.entries(alternatives.exclusions)) {
      expect(markdown).toContain(`\`${path}\``);
      for (const guarantee of entry.guarantees) expect(markdown).toContain(`\`${guarantee}\``);
    }
  });

  it("application service と daemon smoke をcoverage除外にしない", () => {
    const excluded = staticConfig().test?.coverage?.exclude ?? [];
    expect(excluded).not.toContain("scripts/growth/draftOrchestratorApplication.ts");
    expect(excluded).not.toContain("scripts/growth/publishDueApplication.ts");
    expect(excluded).not.toContain("scripts/growth/daemonSmoke.ts");
  });

  it("PR CIで3ブラウザのcritical journeyを必須実行する", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("Playwright critical journey (3 browsers)");
    expect(workflow).toContain("npx playwright install --with-deps\n");
    expect(workflow).toMatch(/run: npx playwright test\s*$/m);
  });

  it("ESLintもローカルのClaude worktreeを探索対象から除外する", () => {
    const eslintConfig = readFileSync("eslint.config.mjs", "utf8");
    expect(eslintConfig).toContain('".claude/worktrees/**"');
  });
});
