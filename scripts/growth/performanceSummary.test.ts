// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ArticleMetrics } from "./metrics";
import type { NotionPage } from "./notion";
import {
  renderPerformanceSummary,
  summarizeArticlePerformance,
  type ArticleTypePerformance,
} from "./performanceSummary";

function select(name: string) {
  return { type: "select", select: { name } };
}

function metricsJson(topQueries: { query: string; clicks: number }[]): string {
  const metrics: ArticleMetrics = {
    pagePath: "/news/x",
    views: { current: 100, prior: 0, deltaPct: null },
    users: { current: 80, prior: 0, deltaPct: null },
    search: {
      clicks: { current: 10, prior: 0, deltaPct: null },
      impressions: { current: 500, prior: 0, deltaPct: null },
      ctr: { current: 0.02, prior: 0, deltaPct: null },
      position: { current: 8, prior: 0, deltaPct: null },
      topQueries: topQueries.map((q) => ({
        query: q.query,
        clicks: q.clicks,
        impressions: 100,
        ctr: 0.05,
        position: 6,
      })),
    },
    period: { start: "2026-06-01", end: "2026-06-07" },
  };
  return JSON.stringify(metrics);
}

function ideaPage(opts: {
  id: string;
  status: string;
  articleType?: string;
  verdict?: string;
  metrics?: string;
}): NotionPage {
  const props: Record<string, unknown> = {
    "ステータス": select(opts.status),
  };
  if (opts.articleType) props["記事タイプ"] = select(opts.articleType);
  if (opts.verdict) props["公開後判定"] = select(opts.verdict);
  if (opts.metrics) {
    props["成績データ"] = { type: "rich_text", rich_text: [{ plain_text: opts.metrics }] };
  }
  return { id: opts.id, url: `https://notion.so/${opts.id}`, properties: props };
}

describe("summarizeArticlePerformance", () => {
  it("公開済み記事だけを記事タイプ別に集計する(公開前は成績が無いので除外)", () => {
    const summaries = summarizeArticlePerformance([
      ideaPage({ id: "a", status: "公開済み", articleType: "獲得", verdict: "成功" }),
      ideaPage({ id: "b", status: "承認", articleType: "獲得", verdict: "成功" }), // 除外
      ideaPage({ id: "c", status: "下書き作成済み", articleType: "資産" }), // 除外
    ]);
    expect(summaries).toEqual<ArticleTypePerformance[]>([
      {
        articleType: "獲得",
        published: 1,
        success: 1,
        watch: 0,
        rewrite: 0,
        unjudged: 0,
        winningQueries: [],
      },
    ]);
  });

  it("公開後判定を 成功/様子見/要改稿/未判定 に振り分ける", () => {
    const [summary] = summarizeArticlePerformance([
      ideaPage({ id: "a", status: "公開済み", articleType: "不安解消", verdict: "成功" }),
      ideaPage({ id: "b", status: "公開済み", articleType: "不安解消", verdict: "様子見" }),
      ideaPage({ id: "c", status: "公開済み", articleType: "不安解消", verdict: "要改稿" }),
      ideaPage({ id: "d", status: "公開済み", articleType: "不安解消", verdict: "未判定" }),
      ideaPage({ id: "e", status: "公開済み", articleType: "不安解消" }), // 判定プロパティ欠落
    ]);
    expect(summary).toMatchObject({
      articleType: "不安解消",
      published: 5,
      success: 1,
      watch: 1,
      rewrite: 1,
      unjudged: 2, // 未判定 + 欠落
    });
  });

  it("記事タイプ欠落は『タイプ未設定』バケットに寄せる(黙って落とさない)", () => {
    const [summary] = summarizeArticlePerformance([
      ideaPage({ id: "a", status: "公開済み", verdict: "成功" }),
    ]);
    expect(summary.articleType).toBe("タイプ未設定");
    expect(summary.published).toBe(1);
  });

  it("成績データの勝ちクエリをクリック降順・上位3件・重複合算で返す", () => {
    const [summary] = summarizeArticlePerformance([
      ideaPage({
        id: "a",
        status: "公開済み",
        articleType: "獲得",
        verdict: "成功",
        metrics: metricsJson([
          { query: "本八幡 ピックルボール", clicks: 5 },
          { query: "市川 屋内", clicks: 3 },
          { query: "0クリック語", clicks: 0 }, // 下限未満は勝ちに含めない
          { query: "低クリック語", clicks: 1 },
        ]),
      }),
      ideaPage({
        id: "b",
        status: "公開済み",
        articleType: "獲得",
        verdict: "様子見",
        metrics: metricsJson([{ query: "本八幡 ピックルボール", clicks: 4 }]), // 合算で最上位
      }),
    ]);
    expect(summary.winningQueries).toEqual([
      "本八幡 ピックルボール", // 5+4=9 で最上位
      "市川 屋内", // 3
      "低クリック語", // 1(上位3件に入る)
    ]);
  });

  it("成績データ rich_text の要素に plain_text が無くても空文字で扱う(欠落耐性)", () => {
    const page: NotionPage = {
      id: "a",
      url: "https://notion.so/a",
      properties: {
        "ステータス": select("公開済み"),
        "記事タイプ": select("獲得"),
        "成績データ": { type: "rich_text", rich_text: [{}] },
      },
    };
    const [summary] = summarizeArticlePerformance([page]);
    expect(summary.winningQueries).toEqual([]);
  });

  it("成績データが空/不正でも壊れず勝ちクエリ無しで扱う(欠落耐性)", () => {
    const [summary] = summarizeArticlePerformance([
      ideaPage({
        id: "a",
        status: "公開済み",
        articleType: "資産",
        verdict: "成功",
        metrics: "これはJSONではない",
      }),
    ]);
    expect(summary.winningQueries).toEqual([]);
  });

  it("公開0本なら空配列(欠落耐性)", () => {
    expect(summarizeArticlePerformance([])).toEqual([]);
    expect(
      summarizeArticlePerformance([ideaPage({ id: "a", status: "承認", articleType: "獲得" })])
    ).toEqual([]);
  });
});

describe("renderPerformanceSummary", () => {
  it("公開0本のとき『空』と学習開始の意図を明示する", () => {
    const lines = renderPerformanceSummary([]);
    const text = lines.join("\n");
    expect(text).toContain("成績サマリ");
    expect(text).toContain("公開済み記事がまだ無い");
  });

  it("成功本数の多い型を上に並べ、勝ちクエリと伸ばす学習の指示を出す", () => {
    const summaries: ArticleTypePerformance[] = [
      {
        articleType: "資産",
        published: 1,
        success: 0,
        watch: 1,
        rewrite: 0,
        unjudged: 0,
        winningQueries: [],
      },
      {
        articleType: "獲得",
        published: 3,
        success: 2,
        watch: 1,
        rewrite: 0,
        unjudged: 0,
        winningQueries: ["本八幡 ピックルボール", "市川 屋内"],
      },
    ];
    const lines = renderPerformanceSummary(summaries);
    const text = lines.join("\n");
    // 獲得(成功2)が資産(成功0)より上に来る
    expect(text.indexOf("獲得")).toBeLessThan(text.indexOf("資産"));
    expect(text).toContain("公開3本");
    expect(text).toContain("成功2");
    expect(text).toContain("勝ったクエリ: 本八幡 ピックルボール / 市川 屋内");
    expect(text).toContain("効いた型を優先");
  });

  it("成功本数が同数のとき公開本数の多い型を上に並べる(第2ソート軸)", () => {
    const summaries: ArticleTypePerformance[] = [
      {
        articleType: "比較",
        published: 1,
        success: 1,
        watch: 0,
        rewrite: 0,
        unjudged: 0,
        winningQueries: [],
      },
      {
        articleType: "獲得",
        published: 4,
        success: 1,
        watch: 3,
        rewrite: 0,
        unjudged: 0,
        winningQueries: [],
      },
    ];
    const text = renderPerformanceSummary(summaries).join("\n");
    // 成功は同数(1)。公開が多い獲得(4本)を比較(1本)より上に。
    expect(text.indexOf("獲得")).toBeLessThan(text.indexOf("比較"));
  });
});
