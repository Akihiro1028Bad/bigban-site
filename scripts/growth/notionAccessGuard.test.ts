// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(target);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [target] : [];
  });
}

const files = [
  ...productionTypeScriptFiles(path.resolve("scripts/growth")),
  ...productionTypeScriptFiles(path.resolve("src")),
];

describe("Notion Data Sourceアクセス境界", () => {
  it("旧queryDataSourceをproductionコードに残さない", () => {
    const offenders = files.filter((file) => /\bqueryDataSource\b/.test(readFileSync(file, "utf-8")));
    expect(offenders).toEqual([]);
  });

  it("queryDataSourcePageの直接利用をrepositoryだけに限定する", () => {
    const users = files
      .filter((file) => /\bqueryDataSourcePage\b/.test(readFileSync(file, "utf-8")))
      .map((file) => path.relative(process.cwd(), file));
    expect(users).toEqual([
      "scripts/growth/notion.ts",
      "scripts/growth/notionRepository.ts",
    ]);
  });

  it("全件APIをnotion.tsからimportしない", () => {
    const offenders = files.filter((file) => {
      const imports = readFileSync(file, "utf-8").match(/import[\s\S]*?from\s+["'][^"']+["'];/g) ?? [];
      return imports.some((statement) =>
        statement.includes("queryAllDataSource") && /from\s+["'][^"']*\/notion["']/.test(statement),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("既知の全件consumerがrepositoryから全件APIを使う", () => {
    const consumers = [
      "existing-cli.ts", "metrics-cli.ts", "publish-due-cli.ts", "review-due-cli.ts",
      "reconcile-cli.ts", "proposal-review-due-cli.ts", "notify-line.ts", "learning-log-cli.ts",
      "eyecatch-regen-cli.ts", "body-image-regen-cli.ts", "initiatives-auto-cli.ts",
      "drafts-auto-cli.ts", "draft-orchestrator-cli.ts", "model-settings-cli.ts", "worker-log-cli.ts",
    ];
    const offenders = consumers.filter((name) => {
      const source = readFileSync(path.resolve("scripts/growth", name), "utf-8");
      return !source.includes("queryAllDataSource") || !source.includes('from "./notionRepository"');
    });
    expect(offenders).toEqual([]);

    for (const route of ["approve/route.ts", "ops/route.ts", "model-settings/route.ts"]) {
      expect(readFileSync(path.resolve("src/app/api/growth", route), "utf-8")).toContain(
        'from "@/lib/growth/notionRepository"',
      );
    }
  });

  it("先頭1件APIはrepositoryとモデル設定PUT・最新レポート用途だけに限定する", () => {
    const users = files
      .filter((file) => /\b(queryFirstDataSource|getLatestReport)\b/.test(readFileSync(file, "utf-8")))
      .map((file) => path.relative(process.cwd(), file))
      .sort();
    expect(users).toEqual([
      "scripts/growth/notify-line.ts",
      "scripts/growth/notionRepository.ts",
      "src/app/api/growth/model-settings/route.ts",
    ]);
  });
});
