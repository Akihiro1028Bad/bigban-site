import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractReferencedPaths,
  findStaleReferences,
  findUnregisteredPrompts,
  lintPrompts,
} from "./promptLint";

describe("findUnregisteredPrompts", () => {
  it("ディスクにあるが registry に無いファイルを返す", () => {
    expect(findUnregisteredPrompts(["a.md", "b.md"], ["a.md"])).toEqual(["b.md"]);
  });

  it("全て登録済みなら空", () => {
    expect(findUnregisteredPrompts(["a.md"], ["a.md", "z.md"])).toEqual([]);
  });
});

describe("extractReferencedPaths", () => {
  it("本文中の repo パス(.md/.json/.ts)を抽出する", () => {
    const content =
      "正典は `docs/operations/growth-article-style.md`、前提は scripts/growth/facility-context.json を読む。純ロジックは scripts/growth/decorate.ts。";
    const paths = extractReferencedPaths(content);
    expect(paths).toContain("docs/operations/growth-article-style.md");
    expect(paths).toContain("scripts/growth/facility-context.json");
    expect(paths).toContain("scripts/growth/decorate.ts");
  });

  it("URL は誤検出しない", () => {
    const paths = extractReferencedPaths("詳細は https://example.com/a/b.md にある");
    expect(paths).not.toContain("example.com/a/b.md");
  });

  it("スラッシュを含まない語(例 §11)は拾わない", () => {
    expect(extractReferencedPaths("style-guide §11 を参照")).toEqual([]);
  });
});

describe("findStaleReferences", () => {
  it("存在しない参照先を stale として返す", () => {
    const issues = findStaleReferences(
      "drafts.md",
      ["docs/a.md", "docs/missing.md"],
      (p) => p === "docs/a.md"
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "stale-reference", file: "drafts.md" });
    expect(issues[0].detail).toContain("docs/missing.md");
  });
});

describe("lintPrompts", () => {
  it("未登録と古い参照をまとめて検出する", () => {
    const issues = lintPrompts({
      present: ["weekly.md", "new.md"],
      registered: ["weekly.md"],
      files: [{ name: "weekly.md", content: "参照 docs/gone.md" }],
      exists: (p) => p !== "docs/gone.md",
    });
    expect(issues.some((i) => i.kind === "unregistered" && i.file === "new.md")).toBe(true);
    expect(issues.some((i) => i.kind === "stale-reference" && i.detail.includes("docs/gone.md"))).toBe(true);
  });

  it("問題が無ければ空配列", () => {
    const issues = lintPrompts({
      present: ["weekly.md"],
      registered: ["weekly.md"],
      files: [{ name: "weekly.md", content: "参照なし" }],
      exists: () => true,
    });
    expect(issues).toEqual([]);
  });
});

describe("記事ネタ案ルールの共通化", () => {
  const promptsDir = path.join(process.cwd(), "scripts/growth/prompts");

  it("weekly と initiatives は同じ shared/article-idea.md を参照する", () => {
    const weekly = readFileSync(path.join(promptsDir, "weekly.md"), "utf-8");
    const initiatives = readFileSync(path.join(promptsDir, "initiatives.md"), "utf-8");

    expect(weekly).toContain("scripts/growth/prompts/shared/article-idea.md");
    expect(initiatives).toContain("scripts/growth/prompts/shared/article-idea.md");
  });

  it("共通記事案ルールは構成案フォーマットと記事仮説プロパティを正典化する", () => {
    const shared = readFileSync(path.join(promptsDir, "shared/article-idea.md"), "utf-8");

    expect(shared).toContain("構成案の書式");
    expect(shared).toContain("## 見出し");
    expect(shared).toContain("記事タイプ");
    expect(shared).toContain("狙う読者");
    expect(shared).toContain("検索意図");
    expect(shared).toContain("勝ち筋");
    expect(shared).toContain("成功指標");
    expect(shared).toContain("想定CTA");
  });

  it("共通記事案ルールはコールドスタート実験を識別し28日観測する", () => {
    const shared = readFileSync(path.join(promptsDir, "shared/article-idea.md"), "utf-8");

    expect(shared).toContain("コールドスタート実験");
    expect(shared).toContain("【コールドスタート実験】");
    expect(shared).toContain("公開28日");
    expect(shared).toContain("最大1件");
  });
});
