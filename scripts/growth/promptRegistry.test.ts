import { describe, expect, it } from "vitest";

import {
  assemblePromptGroups,
  PROMPT_GROUP_ORDER,
  PROMPT_REGISTRY,
  type PromptFile,
} from "./promptRegistry";

function file(repoPath: string, content = "本文"): PromptFile {
  const value = { path: repoPath, filename: repoPath.split("/").pop() ?? repoPath, content };
  return value;
}

describe("PROMPT_REGISTRY", () => {
  it("全エントリの group は PROMPT_GROUP_ORDER に含まれる(その他は除く)", () => {
    for (const meta of PROMPT_REGISTRY) {
      expect(PROMPT_GROUP_ORDER).toContain(meta.group);
      expect(meta.group).not.toBe("その他");
    }
  });

  it("repo相対path は重複せず、表示キーとして使える", () => {
    const paths = PROMPT_REGISTRY.map((m) => m.path);
    expect(paths.every((p) => typeof p === "string" && !p.startsWith("/"))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("情報設計は大分類に再編されている", () => {
    expect(PROMPT_GROUP_ORDER).toEqual([
      "実行プロンプト",
      "正典・共通ルール",
      "運用ガイド",
      "計測・学習",
      "文体例",
      "その他",
    ]);
  });

  it("「その他」は順序表の最後に置く", () => {
    expect(PROMPT_GROUP_ORDER[PROMPT_GROUP_ORDER.length - 1]).toBe("その他");
  });
});

describe("assemblePromptGroups", () => {
  it("ファイル内容を該当フェーズに載せ、グループにまとめる", () => {
    const groups = assemblePromptGroups([
      file("scripts/growth/prompts/weekly.md", "週次の指示"),
    ]);
    const analysis = groups.find((g) => g.group === "実行プロンプト");
    expect(analysis).toBeDefined();
    expect(analysis?.phases).toHaveLength(1);
    expect(analysis?.phases[0]).toMatchObject({
      path: "scripts/growth/prompts/weekly.md",
      filename: "weekly.md",
      content: "週次の指示",
      group: "実行プロンプト",
    });
    expect(analysis?.phases[0].label.length).toBeGreaterThan(0);
    expect(analysis?.phases[0].whenItRuns.length).toBeGreaterThan(0);
  });

  it("グループは PROMPT_GROUP_ORDER の順に並ぶ", () => {
    // 実行プロンプト→正典 を逆順で渡しても順序表どおりに並ぶ
    const groups = assemblePromptGroups([
      file("docs/operations/growth-article-style.md"),
      file("scripts/growth/prompts/draft-write.md"),
    ]);
    const order = groups.map((g) => g.group);
    expect(order.indexOf("実行プロンプト")).toBeLessThan(order.indexOf("正典・共通ルール"));
  });

  it("同一グループ内は order 昇順で並ぶ", () => {
    const groups = assemblePromptGroups([
      file("scripts/growth/prompts/decorate.md"),
      file("scripts/growth/prompts/revise-outline.md"),
    ]);
    const refine = groups.find((g) => g.group === "実行プロンプト");
    const names = refine?.phases.map((p) => p.filename);
    expect(names).toEqual(["revise-outline.md", "decorate.md"]);
  });

  it("同 order(未登録同士)はファイル名昇順で並ぶ", () => {
    const groups = assemblePromptGroups([
      file("scripts/growth/prompts/zzz.md"),
      file("scripts/growth/prompts/aaa.md"),
    ]);
    const other = groups.find((g) => g.group === "その他");
    expect(other?.phases.map((p) => p.filename)).toEqual(["aaa.md", "zzz.md"]);
  });

  it("未登録の .md は「その他」グループへ自動追加し、ラベルはファイル名にする", () => {
    const groups = assemblePromptGroups([file("scripts/growth/prompts/brand-new.md", "新規")]);
    const other = groups.find((g) => g.group === "その他");
    expect(other).toBeDefined();
    expect(other?.phases[0]).toMatchObject({
      path: "scripts/growth/prompts/brand-new.md",
      filename: "brand-new.md",
      content: "新規",
      group: "その他",
      label: "brand-new.md",
    });
    expect(other?.phases[0].whenItRuns.length).toBeGreaterThan(0);
  });

  it("「その他」は常に最後のグループになる", () => {
    const groups = assemblePromptGroups([
      file("scripts/growth/prompts/zzz-unknown.md"),
      file("scripts/growth/prompts/weekly.md"),
    ]);
    expect(groups[groups.length - 1].group).toBe("その他");
  });

  it("参考ドキュメント・文体の例も該当グループに整形する", () => {
    const groups = assemblePromptGroups([
      file("scripts/growth/prompts/examples/example-trend.md"),
      file("docs/operations/growth-article-style.md"),
      file("docs/operations/ai-news-prompt.md"),
      file("scripts/growth/prompts/shared/article-idea.md"),
    ]);
    const ref = groups.find((g) => g.group === "正典・共通ルール");
    const ex = groups.find((g) => g.group === "文体例");
    expect(ref?.phases.map((p) => p.filename)).toEqual([
      "growth-article-style.md",
      "ai-news-prompt.md",
      "article-idea.md",
    ]);
    expect(ex?.phases.map((p) => p.filename)).toEqual(["example-trend.md"]);
    // フェーズより後、その他より前に並ぶ
    const order = groups.map((g) => g.group);
    expect(order).toEqual(["正典・共通ルール", "文体例"]);
  });

  it("CLAUDE.md と AGENTS.md は正典・共通ルールの先頭に並ぶ", () => {
    const groups = assemblePromptGroups([
      file("scripts/growth/prompts/shared/article-idea.md"),
      file("docs/operations/growth-article-style.md"),
      file("CLAUDE.md"),
      file("AGENTS.md"),
    ]);
    const ref = groups.find((g) => g.group === "正典・共通ルール");
    expect(ref?.phases.map((p) => p.filename)).toEqual([
      "CLAUDE.md",
      "AGENTS.md",
      "growth-article-style.md",
      "article-idea.md",
    ]);
  });

  it("運用・計測資料も該当グループに整形する", () => {
    const groups = assemblePromptGroups([
      file("docs/operations/growth/01-setup-guide.md"),
      file("docs/operations/growth/50-publish-metrics.md"),
      file("docs/operations/growth/60-kpi-tree.md"),
    ]);
    const ops = groups.find((g) => g.group === "運用ガイド");
    const metrics = groups.find((g) => g.group === "計測・学習");
    expect(ops?.phases.map((p) => p.path)).toEqual([
      "docs/operations/growth/01-setup-guide.md",
    ]);
    expect(metrics?.phases.map((p) => p.path)).toEqual([
      "docs/operations/growth/50-publish-metrics.md",
      "docs/operations/growth/60-kpi-tree.md",
    ]);
  });

  it("basename が同じ未登録資料も repo相対path key で区別する", () => {
    const groups = assemblePromptGroups([
      file("docs/operations/setup-manual.md"),
      file("docs/operations/manuals/setup-manual.md"),
    ]);
    const other = groups.find((g) => g.group === "その他");
    expect(other?.phases.map((p) => p.path)).toEqual([
      "docs/operations/manuals/setup-manual.md",
      "docs/operations/setup-manual.md",
    ]);
  });

  it("表示対象docsをマニフェストに含め、specs/plansは含めない", () => {
    const paths = PROMPT_REGISTRY.map((m) => m.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        "docs/operations/growth/00-canon.md",
        "docs/operations/growth/01-setup-guide.md",
        "docs/operations/growth/10-operator-guide.md",
        "docs/operations/growth/20-draft.md",
        "docs/operations/growth/30-loops.md",
        "docs/operations/growth/40-notion-props.md",
        "docs/operations/growth/50-publish-metrics.md",
        "docs/operations/growth/60-kpi-tree.md",
        "docs/operations/growth/70-self-tuning.md",
        "docs/operations/growth/worker-observability.md",
        "docs/operations/columns/setup-manual.md",
      ]),
    );
    expect(paths.some((p) => p.startsWith("docs/superpowers/specs/"))).toBe(false);
    expect(paths.some((p) => p.startsWith("docs/superpowers/plans/"))).toBe(false);
  });

  it("空配列なら空配列を返す", () => {
    expect(assemblePromptGroups([])).toEqual([]);
  });

  it("フェーズの無いグループは結果に含めない", () => {
    const groups = assemblePromptGroups([file("scripts/growth/prompts/weekly.md")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("実行プロンプト");
  });

  it("登録済みファイルが全部揃っても破綻しない(順序表の各グループは高々1回)", () => {
    const groups = assemblePromptGroups(PROMPT_REGISTRY.map((m) => file(m.path)));
    const groupNames = groups.map((g) => g.group);
    expect(new Set(groupNames).size).toBe(groupNames.length);
  });
});
