// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ARTICLE_TYPE_TO_CATEGORY,
  columnCategoryIdForArticleType,
} from "./columnCategory";

describe("ARTICLE_TYPE_TO_CATEGORY(正典マッピング表)", () => {
  it("正典5エントリを多対一で定義している(§6.2)", () => {
    expect(ARTICLE_TYPE_TO_CATEGORY).toEqual({
      獲得: "start",
      不安解消: "start",
      資産: "rules",
      比較: "compare",
      イベント: "event",
    });
  });
});

describe("columnCategoryIdForArticleType", () => {
  it("獲得 → start(来店直結の入口記事)", () => {
    expect(columnCategoryIdForArticleType("獲得")).toBe("start");
  });

  it("不安解消 → start(獲得と同じ導線カテゴリへ多対一)", () => {
    expect(columnCategoryIdForArticleType("不安解消")).toBe("start");
  });

  it("資産 → rules(既定。上達/健康は編集で振替)", () => {
    expect(columnCategoryIdForArticleType("資産")).toBe("rules");
  });

  it("比較 → compare", () => {
    expect(columnCategoryIdForArticleType("比較")).toBe("compare");
  });

  it("イベント → event", () => {
    expect(columnCategoryIdForArticleType("イベント")).toBe("event");
  });

  it("内部ID を渡しても同じ ID を返す(冪等)", () => {
    expect(columnCategoryIdForArticleType("acquire")).toBe("start");
    expect(columnCategoryIdForArticleType("relief")).toBe("start");
    expect(columnCategoryIdForArticleType("asset")).toBe("rules");
  });

  it("未知/欠落は undefined(category を省略 = 人が後付け)", () => {
    expect(columnCategoryIdForArticleType("不明")).toBeUndefined();
    expect(columnCategoryIdForArticleType(undefined)).toBeUndefined();
    expect(columnCategoryIdForArticleType("")).toBeUndefined();
  });

  it("前後の空白を無視する", () => {
    expect(columnCategoryIdForArticleType("  獲得  ")).toBe("start");
  });

  it("空白のみ(trim で空になる)は undefined", () => {
    expect(columnCategoryIdForArticleType("   ")).toBeUndefined();
  });
});

/**
 * 乖離検知(#columns レビュー対応): payload.json はプロンプト
 * `prompts/drafts.md` を読んだ実行エージェントが手書きするため、
 * マッピングの真実源(この TS 定数)とプロンプト内の転記が食い違うと
 * 静かに壊れる。プロンプト側の表を書き換え/削除したらここが赤になる。
 */
describe("prompts/drafts.md との乖離検知", () => {
  const promptPath = join(
    process.cwd(),
    "scripts",
    "growth",
    "prompts",
    "drafts.md",
  );
  const prompt = readFileSync(promptPath, "utf-8");

  const entries = Object.entries(ARTICLE_TYPE_TO_CATEGORY);

  it.each(entries)(
    "正典エントリ %s→%s がプロンプト本文に転記されている",
    (labelJa, categoryId) => {
      // プロンプトの表記: 獲得→`start`(workflow 手順3の既定マッピング行)
      expect(prompt).toContain(`${labelJa}→\`${categoryId}\``);
    },
  );

  it("プロンプト内の 記事タイプ→カテゴリ 行に正典外のマッピングが紛れていない", () => {
    // `X→`y`` 形式(矢印直後にバッククォート付き content ID)を全て抽出し、
    // 正典表と突き合わせる。画像スタイルの `A→b` は全体がコード span 内
    // (矢印直後がバッククォートでない)ため一致しない。
    const found = [...prompt.matchAll(/([^\s/(（`]+)→`([a-z-]+)`/g)].map(
      (m) => [m[1], m[2]] as const,
    );
    // 抽出漏れで空振りしていないことも保証する(正典5件×転記1箇所以上)。
    expect(found.length).toBeGreaterThanOrEqual(entries.length);
    for (const [labelJa, categoryId] of found) {
      expect(
        ARTICLE_TYPE_TO_CATEGORY,
        `プロンプトに正典外のマッピング: ${labelJa}→${categoryId}`,
      ).toHaveProperty(labelJa, categoryId);
    }
  });
});
