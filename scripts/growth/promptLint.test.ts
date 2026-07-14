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

describe("下書き生成の構成案契約", () => {
  const drafts = readFileSync(
    path.join(process.cwd(), "scripts/growth/prompts/drafts.md"),
    "utf-8"
  );
  const publishDraftCli = readFileSync(
    path.join(process.cwd(), "scripts/growth/publish-draft-cli.ts"),
    "utf-8"
  );

  it("現在の構成案を入力として使い、決定的ゲートでも見出し一致を守る", () => {
    expect(drafts).toContain("現在の `構成案`");
    expect(drafts).toContain("執筆入力として使う");
    expect(drafts).toContain("H2/H3の見出し名・レベル・順序を変更しない");
    expect(publishDraftCli).toContain("evaluateOutlineCompliance");
    expect(publishDraftCli).toContain("outlineFromPage(page)");
  });

  it("1回のClaudeセッションでは対象記事を1件だけ処理する", () => {
    expect(drafts).toContain("1回の実行で1件だけ");
    expect(drafts).toContain("複数件を同じClaudeセッションで処理しない");
  });

  it("禁止する表現と創作の範囲を具体的に示す", () => {
    expect(drafts).toContain(
      "根拠のない最大級表現、過度に不安や焦りを促す表現、確認できない事実・体験談の創作はしない。"
    );
    expect(drafts).not.toContain("煽り・誇張・創作なし");
  });

  it("前回本文と根拠台帳を参照しない", () => {
    expect(drafts).toContain("`下書き本文HTML` と `根拠台帳` は読まない");
  });

  it("確認済み情報源はURLと重要事実だけの最小形式にする", () => {
    expect(drafts).toContain("`confirmedFacts`");
    expect(drafts).not.toContain("`confidence`");
    expect(drafts).not.toContain("`reason`");
    expect(drafts).not.toContain("`usableInArticle`");
  });

  it("単一Claudeの1パス執筆で、別AI校閲・採点・自動リライトを行わない", () => {
    expect(drafts).toContain("同じ Claude プロセス");
    expect(drafts).toContain("1パス");
    expect(drafts).not.toContain("記事ブリーフを確定");
    expect(drafts).not.toContain("校閲(別エージェント");
    expect(drafts).not.toContain("編集者ゲート");
    expect(drafts).not.toContain("最大2周");
  });

  it("確認済み情報源リストは重要事実だけを本文と同じ1回の出力で保存する", () => {
    expect(drafts).toContain("重要事実だけ");
    expect(drafts).toContain("実際に本文で使用した重要事実だけ");
    expect(drafts).toContain("検索結果の要約だけでは使用可能にしない");
    expect(drafts).toContain("確認できなかった候補は本文にもリストにも入れない");
  });

  it("調査対象を列挙項目に限定せず、重要事実だけ公式情報で確認する", () => {
    expect(drafts).toContain("承認済み構成案と記事テーマに必要な情報を調査する");
    expect(drafts).toContain("これらに限らず、読者の判断に役立つ具体的な情報があれば調査してよい");
    expect(drafts).toContain("報道記事や専門メディアも情報収集に使ってよい");
    expect(drafts).not.toContain("台帳対象は次に限定する");
  });

  it("執筆入力は承認済み情報と確定事実に限定し、評価用プロパティを渡さない", () => {
    expect(drafts).toContain("狙う読者");
    expect(drafts).toContain("検索意図");
    expect(drafts).toContain("想定CTA");
    expect(drafts).toContain("一次情報メモ");
    expect(drafts).toContain("`勝ち筋` と `成功指標` は本文生成へ渡さない");
  });

  it("冒頭で検索意図へ直接答え、入力にない読者の行動や心理を作らない", () => {
    expect(drafts).toContain("冒頭の1〜2文で、検索意図への答えを直接書く");
    expect(drafts).toContain(
      "読者が公式サイトを開いた、迷っている、身構えているなど、入力にない行動や心理を作らない"
    );
  });

  it("確認済み事実を使い切らず、読者の判断に不要な情報を省く", () => {
    expect(drafts).toContain("確認済み事実は素材であり、本文で使い切るチェックリストではない");
    expect(drafts).toContain("場所選びや次の行動に影響しない事実は、正しくても省く");
    expect(drafts).toContain("facility-context の `confirmed` はそのまま全文を渡さない");
  });

  it("重複説明と自施設のパンフレット化を避ける", () => {
    expect(drafts).toContain("同じ事実を本文・表・まとめで繰り返さない");
    expect(drafts).toContain(
      "自施設の理念・スローガン・ショーコート等は、記事テーマと直接関係しなければ書かない"
    );
  });

  it("CTAは強く勧めず、確認を促す穏やかな1文にする", () => {
    expect(drafts).toContain("空き状況や詳細の確認を促す穏やかな1文");
    expect(drafts).toContain("今すぐ・まずは・体験してみてください等で行動を迫らない");
  });

  it("再生成では既存下書きのslugを維持し、取得不能なら投入を止める", () => {
    expect(drafts).toContain("既存下書きのslugを読み直し");
    expect(drafts).toContain("記事URLを維持");
    expect(drafts).toContain("元slugを取得できない場合は安全側で投入を中断");
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
