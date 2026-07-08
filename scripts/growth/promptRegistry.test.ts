import { describe, expect, it } from "vitest";

import {
  assemblePromptGroups,
  PROMPT_GROUP_ORDER,
  PROMPT_REGISTRY,
  type PromptFile,
} from "./promptRegistry";

function file(filename: string, content = "本文"): PromptFile {
  return { filename, content };
}

describe("PROMPT_REGISTRY", () => {
  it("全エントリの group は PROMPT_GROUP_ORDER に含まれる(その他は除く)", () => {
    for (const meta of PROMPT_REGISTRY) {
      expect(PROMPT_GROUP_ORDER).toContain(meta.group);
      expect(meta.group).not.toBe("その他");
    }
  });

  it("filename は重複しない", () => {
    const names = PROMPT_REGISTRY.map((m) => m.filename);
    expect(new Set(names).size).toBe(names.length);
  });

  it("「その他」は順序表の最後に置く", () => {
    expect(PROMPT_GROUP_ORDER[PROMPT_GROUP_ORDER.length - 1]).toBe("その他");
  });
});

describe("assemblePromptGroups", () => {
  it("ファイル内容を該当フェーズに載せ、グループにまとめる", () => {
    const groups = assemblePromptGroups([file("weekly.md", "週次の指示")]);
    const analysis = groups.find((g) => g.group === "分析");
    expect(analysis).toBeDefined();
    expect(analysis?.phases).toHaveLength(1);
    expect(analysis?.phases[0]).toMatchObject({
      filename: "weekly.md",
      content: "週次の指示",
      group: "分析",
    });
    expect(analysis?.phases[0].label.length).toBeGreaterThan(0);
    expect(analysis?.phases[0].whenItRuns.length).toBeGreaterThan(0);
  });

  it("グループは PROMPT_GROUP_ORDER の順に並ぶ", () => {
    // 執筆(drafts)→修正・推敲(advise) を逆順で渡しても順序表どおりに並ぶ
    const groups = assemblePromptGroups([file("advise.md"), file("drafts.md")]);
    const order = groups.map((g) => g.group);
    expect(order.indexOf("執筆")).toBeLessThan(order.indexOf("修正・推敲"));
  });

  it("同一グループ内は order 昇順で並ぶ", () => {
    const groups = assemblePromptGroups([
      file("decorate.md"),
      file("revise-outline.md"),
    ]);
    const refine = groups.find((g) => g.group === "修正・推敲");
    const names = refine?.phases.map((p) => p.filename);
    expect(names).toEqual(["revise-outline.md", "decorate.md"]);
  });

  it("同 order(未登録同士)はファイル名昇順で並ぶ", () => {
    const groups = assemblePromptGroups([file("zzz.md"), file("aaa.md")]);
    const other = groups.find((g) => g.group === "その他");
    expect(other?.phases.map((p) => p.filename)).toEqual(["aaa.md", "zzz.md"]);
  });

  it("未登録の .md は「その他」グループへ自動追加し、ラベルはファイル名にする", () => {
    const groups = assemblePromptGroups([file("brand-new.md", "新規")]);
    const other = groups.find((g) => g.group === "その他");
    expect(other).toBeDefined();
    expect(other?.phases[0]).toMatchObject({
      filename: "brand-new.md",
      content: "新規",
      group: "その他",
      label: "brand-new.md",
    });
    expect(other?.phases[0].whenItRuns.length).toBeGreaterThan(0);
  });

  it("「その他」は常に最後のグループになる", () => {
    const groups = assemblePromptGroups([file("zzz-unknown.md"), file("weekly.md")]);
    expect(groups[groups.length - 1].group).toBe("その他");
  });

  it("参考ドキュメント・文体の例も該当グループに整形する", () => {
    const groups = assemblePromptGroups([
      file("example-trend.md"),
      file("growth-article-style.md"),
      file("ai-news-prompt.md"),
      file("article-idea.md"),
    ]);
    const ref = groups.find((g) => g.group === "参考ドキュメント");
    const ex = groups.find((g) => g.group === "文体の例");
    expect(ref?.phases.map((p) => p.filename)).toEqual([
      "growth-article-style.md",
      "ai-news-prompt.md",
      "article-idea.md",
    ]);
    expect(ex?.phases.map((p) => p.filename)).toEqual(["example-trend.md"]);
    // フェーズより後、その他より前に並ぶ
    const order = groups.map((g) => g.group);
    expect(order).toEqual(["参考ドキュメント", "文体の例"]);
  });

  it("CLAUDE.md は参考ドキュメントの先頭に並ぶ", () => {
    const groups = assemblePromptGroups([
      file("article-idea.md"),
      file("growth-article-style.md"),
      file("CLAUDE.md"),
    ]);
    const ref = groups.find((g) => g.group === "参考ドキュメント");
    expect(ref?.phases.map((p) => p.filename)).toEqual([
      "CLAUDE.md",
      "growth-article-style.md",
      "article-idea.md",
    ]);
  });

  it("運用・セットアップ資料も該当グループに整形する", () => {
    const groups = assemblePromptGroups([file("news-admin-manual.md")]);
    const ops = groups.find((g) => g.group === "運用・セットアップ");
    expect(ops?.phases.map((p) => p.filename)).toEqual(["news-admin-manual.md"]);
  });

  it("空配列なら空配列を返す", () => {
    expect(assemblePromptGroups([])).toEqual([]);
  });

  it("フェーズの無いグループは結果に含めない", () => {
    const groups = assemblePromptGroups([file("weekly.md")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("分析");
  });

  it("登録済みファイルが全部揃っても破綻しない(順序表の各グループは高々1回)", () => {
    const groups = assemblePromptGroups(PROMPT_REGISTRY.map((m) => file(m.filename)));
    const groupNames = groups.map((g) => g.group);
    expect(new Set(groupNames).size).toBe(groupNames.length);
  });
});
