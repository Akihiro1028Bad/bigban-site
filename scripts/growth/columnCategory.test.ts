// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ARTICLE_TYPE_TO_CATEGORY,
  COLUMN_CATEGORY_IDS,
  columnCategoryIdForArticleType,
  isColumnCategoryId,
  resolveColumnCategoryId,
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

describe("isColumnCategoryId", () => {
  it("正典6件を受理する", () => {
    for (const id of COLUMN_CATEGORY_IDS) {
      expect(isColumnCategoryId(id)).toBe(true);
    }
    expect(COLUMN_CATEGORY_IDS).toEqual([
      "start",
      "rules",
      "improve",
      "health",
      "compare",
      "event",
    ]);
  });

  it("正典外は拒否する", () => {
    expect(isColumnCategoryId("acquire")).toBe(false); // articleType 内部IDは category IDではない
    expect(isColumnCategoryId("")).toBe(false);
    expect(isColumnCategoryId("不明")).toBe(false);
  });
});

describe("resolveColumnCategoryId(#222 優先順位: コラムカテゴリ > 既定マッピング)", () => {
  it("override が正典IDならそれを最優先で採用する", () => {
    // 既定なら 資産→rules だが、override=improve が勝つ。
    expect(resolveColumnCategoryId("資産", "improve")).toBe("improve");
    // 既定なら 獲得→start だが、override=event が勝つ。
    expect(resolveColumnCategoryId("獲得", "event")).toBe("event");
  });

  it("override が空/未追加なら既定マッピングにフォールバック(欠落耐性)", () => {
    expect(resolveColumnCategoryId("資産", undefined)).toBe("rules");
    expect(resolveColumnCategoryId("獲得", "")).toBe("start");
    expect(resolveColumnCategoryId("比較", "   ")).toBe("compare");
  });

  it("override が正典外なら無視して既定にフォールバック", () => {
    expect(resolveColumnCategoryId("獲得", "不正な値")).toBe("start");
  });

  it("override も articleType も解決不能なら undefined(category 省略)", () => {
    expect(resolveColumnCategoryId(undefined, undefined)).toBeUndefined();
    expect(resolveColumnCategoryId("不明", "")).toBeUndefined();
  });

  it("articleType 未知でも override が正典IDなら採用する", () => {
    expect(resolveColumnCategoryId(undefined, "health")).toBe("health");
  });

  it("override の前後空白は無視する", () => {
    expect(resolveColumnCategoryId("獲得", "  improve  ")).toBe("improve");
  });
});

/**
 * 単一ソース化の構造的保証(#222): かつては下書きプロンプトに記事タイプ→カテゴリの
 * 手書き表があり、乖離検知テストで転記ズレを防いでいた。#222 でその手書き表を
 * 廃し、マッピングは `growth:column-category`(正典 ARTICLE_TYPE_TO_CATEGORY 由来)
 * で解決する運用にした。ここでは「手書き表が復活していない=単一ソースが崩れていない」
 * ことを構造的に守る(手書き表を書き戻すとこのテストが赤になる)。
 */
describe("draftOrchestrator のcategory単一ソース化(#222)", () => {
  const sourcePath = join(process.cwd(), "scripts", "growth", "draftOrchestrator.ts");
  const source = readFileSync(sourcePath, "utf-8");

  it("category 解決をresolveColumnCategoryIdに委ねている", () => {
    expect(source).toContain("resolveColumnCategoryId(input.articleType, input.columnCategory)");
  });

  it("記事タイプ→カテゴリの手書き対応表(獲得→`start` 等)が本文に残っていない", () => {
    // `記事タイプ日本語→`content-id`` 形式の手書き転記を全て抽出する。
    // 画像スタイルの `A→b`(全体がコード span 内・矢印直後がバッククォートでない)は一致しない。
    const handWritten = [...source.matchAll(/([^\s/(（`]+)→`([a-z-]+)`/g)]
      .map((m) => [m[1], m[2]] as const)
      // 正典の日本語ラベルが左辺にある行だけを「マッピング転記」とみなす。
      .filter(([labelJa]) => labelJa in ARTICLE_TYPE_TO_CATEGORY);
    expect(
      handWritten,
      `draftOrchestrator.ts に手書きマッピングが残存: ${JSON.stringify(handWritten)}`,
    ).toEqual([]);
  });
});
