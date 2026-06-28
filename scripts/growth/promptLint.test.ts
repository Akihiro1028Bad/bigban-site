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
