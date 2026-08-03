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

describe("下書き生成のフェーズ分離契約", () => {
  const research = readFileSync(
    path.join(process.cwd(), "scripts/growth/prompts/draft-research.md"),
    "utf-8",
  );
  const writer = readFileSync(
    path.join(process.cwd(), "scripts/growth/prompts/draft-write.md"),
    "utf-8",
  );
  const publishDraftCli = readFileSync(
    path.join(process.cwd(), "scripts/growth/publish-draft-cli.ts"),
    "utf-8",
  );

  it("リサーチは公式情報の確認だけを行い、記事本文を作らない", () => {
    expect(research).toContain("公式情報の確認だけ");
    expect(research).toContain("記事本文・導入文・見出し・まとめは書かない");
    expect(research).toContain("`option | constraint | detail`");
    expect(research).toContain("公式確認できない候補は出力しない");
    expect(research).toContain("公式情報源の`sourceLabel`");
    expect(research).toContain("統計・健康情報には`publishedYear`");
    expect(research).toContain("`official-site`として出力");
    expect(research).toContain("公式確認できなければ出力しない");
    expect(research).toContain("原文のまま抜き出す");
    expect(research).toContain("`name`・`confirmed`・`location`");
    expect(research).toContain("facility-context.json");
    expect(research).toContain("一次情報メモ");
    expect(research).toContain("任意項目も省略せず");
    expect(research).toContain("該当しない値は`null`");
  });

  it("執筆はResearchPacketだけを素材に1回で書き、運用手順を含まない", () => {
    expect(writer).toContain("最初から最後まで1回で書く");
    expect(writer).toContain("調査過程や裏取り方法を書かない");
    expect(writer).toContain("`constraint`を利用可能な選択肢として数えない");
    for (const forbidden of ["npm run", "microCMS", "LINE", "Notion", "WebSearch", "WebFetch", "Task"]) {
      expect(writer).not.toContain(forbidden);
    }
    expect(writer).toContain("factにある情報だけを書く");
    expect(writer).toContain("factに無い金額、時刻、日付、数量、施設名、統計、健康効果は本文に書かない");
    expect(writer).toContain("概略表現に言い換えるか、その文を削る");
    expect(writer).not.toContain("<!--FACT:");
  });

  it("見出し契約は執筆プロンプトと決定的ゲートの両方で守る", () => {
    expect(writer).toContain("H2/H3の見出し名・レベル・順序を変更しない");
    expect(publishDraftCli).toContain("evaluateOutlineCompliance");
    expect(publishDraftCli).toContain("outlineFromPage(page)");
  });

  it("重複、確認表現、自施設の説明量を制限する", () => {
    expect(writer).toContain("同じ事実を本文・表・まとめで繰り返さない");
    expect(writer).toContain("記事末に最大1回");
    expect(writer).toContain("自施設だけ説明量を増やさず");
  });

  it("入力にない読者の行動や心理を導入へ創作しない", () => {
    expect(writer).toContain("入力にない行動や心理を作らない");
    expect(writer).toContain("公式サイトを開いた");
    expect(writer).toContain("戸惑っている");
  });

  it("CTAは自然な1文と固定予約URLの1件だけにする", () => {
    expect(writer).toContain("記事内容に合う自然な誘導文を1文だけ");
    expect(writer).toContain("固定予約URLのCTAを1つだけ");
    expect(writer).toContain("行動を迫らない");
  });

  it("統計・健康情報を使う場合だけ参考資料見出しを例外として追加する", () => {
    expect(writer).toContain("統計・健康情報を使う場合");
    expect(writer).toContain("AI免責文の直前に`参考資料`見出し");
    expect(writer).toContain("見出し追加禁止の唯一の例外");
    expect(writer).toContain("factの`sourceLabel`と`publishedYear`");
    expect(writer).toContain("入力にない出典名や発行年を作らない");
  });

  it("可変情報はResearchFactと公開ゲートで照合できる表現を保つ", () => {
    expect(writer).toContain("キャンペーン、クーポン、イベント");
    expect(writer).toContain("factのstatementの語順と数値を本文に保持する");
    expect(writer).toContain("意味が同じでも言い換えない");
  });
});

describe("承認画面プロトタイプのプロンプト表示", () => {
  const view = readFileSync(
    path.join(process.cwd(), "src/app/growth/approve-proto/PromptRegistryView.tsx"),
    "utf-8"
  );

  it("本番と同じPromptsView/APIを使い、ハードコード本文を参照しない", () => {
    expect(view).toContain("PromptsView");
    expect(view).not.toContain("promptData");
    expect(view).not.toContain("PROTO_PROMPTS");
  });

  it("プロンプト台帳でも文体例を自動下書き工程へ案内しない", () => {
    const registry = readFileSync(
      path.join(process.cwd(), "scripts/growth/promptRegistry.ts"),
      "utf-8"
    );
    expect(registry).not.toContain("下書き生成時に文体を真似る");
    expect(registry).not.toContain('stage: "編集者ゲート"');
  });
});
