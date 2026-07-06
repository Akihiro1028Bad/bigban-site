// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ArticleMetrics } from "./metrics";
import type { NotionPage } from "./notion";
import {
  articleReviewLabelLines,
  coverageCrossTabLines,
  searchIntentIndexLines,
  summarizeExisting,
  weekStartEqualsFilter,
} from "./existing";

function title(name: string) {
  return { type: "title", title: [{ plain_text: name }] };
}
function select(name: string) {
  return { type: "select", select: { name } };
}
function text(value: string) {
  return { type: "rich_text", rich_text: [{ plain_text: value }] };
}
function date(start: string) {
  return { type: "date", date: { start } };
}

function emptyRichText() {
  return { type: "rich_text", rich_text: [] };
}

function metricsJson(overrides: Partial<ArticleMetrics> = {}): string {
  const metrics: ArticleMetrics = {
    pagePath: "/news/test",
    views: { current: 80, prior: 0, deltaPct: null },
    users: { current: 60, prior: 0, deltaPct: null },
    keyEvents: { current: 0, prior: 0, deltaPct: null },
    search: {
      clicks: { current: 5, prior: 0, deltaPct: null },
      impressions: { current: 500, prior: 0, deltaPct: null },
      ctr: { current: 0.02, prior: 0, deltaPct: null },
      position: { current: 8, prior: 0, deltaPct: null },
      topQueries: [],
    },
    publishedAt: "2026-06-01T00:00:00.000Z",
    period: { start: "2026-06-01", end: "2026-06-07" },
    ...overrides,
  };
  return JSON.stringify(metrics);
}

function reportPage(weekStart: string): NotionPage {
  return {
    id: `r-${weekStart}`,
    url: `https://notion.so/r-${weekStart}`,
    properties: { "レポート": title(`週次 ${weekStart}`), "対象週開始": date(weekStart) },
  };
}

function proposalPage(opts: {
  id: string;
  name: string;
  weekKey: string;
  category: string;
  status: string;
  memo?: string;
  verification?: string;
}): NotionPage {
  const props: Record<string, unknown> = {
    "施策名": title(opts.name),
    "週キー": text(opts.weekKey),
    "カテゴリ": select(opts.category),
    "ステータス": select(opts.status),
  };
  if (opts.memo) props["判断者メモ"] = text(opts.memo);
  if (opts.verification) props["検証結果"] = select(opts.verification);
  return { id: opts.id, url: `https://notion.so/${opts.id}`, properties: props };
}

function ideaPage(opts: {
  id: string;
  title: string;
  status: string;
  weekStart: string;
  reason?: string;
  postJudgement?: string;
  searchIntent?: string | null;
  articleType?: string | null;
  media?: string | null;
  metrics?: string | null;
}): NotionPage {
  const props: Record<string, unknown> = {
    "タイトル案": title(opts.title),
    "ステータス": select(opts.status),
    "対象週開始": date(opts.weekStart),
  };
  if (opts.reason) props["却下理由"] = text(opts.reason);
  if (opts.postJudgement) props["公開後判定"] = select(opts.postJudgement);
  if (opts.searchIntent === null) props["検索意図"] = emptyRichText();
  if (typeof opts.searchIntent === "string") props["検索意図"] = text(opts.searchIntent);
  if (opts.articleType === null) {
    // 欠落ケース用。何も設定しない。
  } else if (opts.articleType) {
    props["記事タイプ"] = select(opts.articleType);
  }
  if (opts.media === null) {
    // 欠落ケース用。何も設定しない。
  } else if (opts.media) {
    props["媒体"] = select(opts.media);
  }
  if (opts.metrics === null) {
    props["成績データ"] = emptyRichText();
  } else if (opts.metrics) {
    props["成績データ"] = text(opts.metrics);
  }
  return {
    id: opts.id,
    url: `https://notion.so/${opts.id}`,
    properties: props,
  };
}

const period = { start: "2026-06-08", end: "2026-06-14" };
const fixedNowMs = Date.parse("2026-07-06T00:00:00.000Z");

describe("weekStartEqualsFilter", () => {
  it("対象週開始 の date equals フィルタを返す", () => {
    expect(weekStartEqualsFilter("2026-06-08")).toEqual({
      property: "対象週開始",
      date: { equals: "2026-06-08" },
    });
  });
});

describe("summarizeExisting", () => {
  it("対象週のレポートが無いとき『未作成』と新規作成の指示を含む", () => {
    const md = summarizeExisting({ period, nowMs: fixedNowMs, reportsForWeek: [], proposals: [], ideas: [] });
    expect(md).toContain("2026-06-08");
    expect(md).toContain("未作成");
    // 未作成のときは明確に作成を促す
    expect(md).toMatch(/新規作成|作成してください/);
    expect(md).not.toContain("作成済み");
  });

  it("対象週のレポートがあるとき『作成済み』を示す", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [reportPage("2026-06-08")],
      proposals: [],
      ideas: [],
    });
    expect(md).toContain("作成済み");
    expect(md).not.toContain("未作成");
  });

  describe("オーナー週次手入力(改善案#4・週次グロースレポート DB)", () => {
    function manualInputRow(weekStart: string, props: Record<string, unknown>): NotionPage {
      // レポート本文(title)を持たない=手入力だけの行。作成済み判定には数えない。
      return {
        id: `mi-${weekStart}`,
        url: `https://notion.so/mi-${weekStart}`,
        properties: { "対象週開始": date(weekStart), ...props },
      };
    }

    it("手入力(予約/LINE/IG/口コミ)があれば手入力データ節に載せる", () => {
      const md = summarizeExisting({
        period,
        nowMs: fixedNowMs,
        reportsForWeek: [
          manualInputRow("2026-06-08", {
            "予約件数": { type: "number", number: 42 },
            "LINE友だち数": { type: "number", number: 130 },
            "IGフォロワー数": { type: "number", number: 560 },
            "口コミ件数": { type: "number", number: 8 },
            "口コミ平均評価": { type: "number", number: 4.6 },
          }),
        ],
        proposals: [],
        ideas: [],
      });
      expect(md).toContain("オーナー手入力");
      expect(md).toContain("予約件数");
      expect(md).toContain("42");
      expect(md).toContain("LINE友だち数");
      expect(md).toContain("130");
      expect(md).toContain("IGフォロワー数");
      expect(md).toContain("口コミ件数");
      expect(md).toContain("4.6");
    });

    it("手入力だけの行(レポート本文なし)は『作成済み』に数えない(#4)", () => {
      const md = summarizeExisting({
        period,
        nowMs: fixedNowMs,
        reportsForWeek: [manualInputRow("2026-06-08", { "予約件数": { type: "number", number: 10 } })],
        proposals: [],
        ideas: [],
      });
      // 手入力はあるがレポート本文(title)は無いので、レポートは未作成として新規作成を促す。
      expect(md).toContain("未作成");
      expect(md).not.toContain("週次グロースレポート: 作成済み");
      // それでも手入力の数字は分析に供給する。
      expect(md).toContain("オーナー手入力");
      expect(md).toContain("10");
    });

    it("手入力が無ければ『手入力データなし』で従来動作(欠落耐性)", () => {
      const md = summarizeExisting({ period, nowMs: fixedNowMs, reportsForWeek: [], proposals: [], ideas: [] });
      expect(md).toContain("手入力データなし");
    });

    it("一部だけ入力なら入力済みの指標だけ載せる", () => {
      const md = summarizeExisting({
        period,
        nowMs: fixedNowMs,
        reportsForWeek: [manualInputRow("2026-06-08", { "LINE友だち数": { type: "number", number: 200 } })],
        proposals: [],
        ideas: [],
      });
      expect(md).toContain("LINE友だち数");
      expect(md).toContain("200");
      expect(md).not.toContain("予約件数");
    });
  });

  it("施策提案を 週キー・カテゴリ・ステータス・施策名 付きで列挙する", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [
        proposalPage({
          id: "p1",
          name: "GBP投稿の改善",
          weekKey: "2026-W24",
          category: "MEO",
          status: "未処理",
        }),
      ],
      ideas: [],
    });
    expect(md).toContain("GBP投稿の改善");
    expect(md).toContain("2026-W24");
    expect(md).toContain("MEO");
    expect(md).toContain("未処理");
    expect(md).toContain("既存 1件");
  });

  it("却下・見送りの施策は学習ループ用に判断者メモと検証結果を併記する", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [
        proposalPage({
          id: "p2",
          name: "チラシ配布",
          weekKey: "2026-W23",
          category: "イベント",
          status: "却下",
          memo: "コストに見合わない",
          verification: "効果なし",
        }),
      ],
      ideas: [],
    });
    expect(md).toContain("コストに見合わない");
    expect(md).toContain("効果なし");
  });

  it("却下でも判断者メモ・検証結果が無ければ追記しない", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [
        proposalPage({
          id: "p3",
          name: "メモ無し却下",
          weekKey: "2026-W23",
          category: "MEO",
          status: "却下",
        }),
      ],
      ideas: [],
    });
    expect(md).toContain("メモ無し却下");
    expect(md).not.toContain("判断者メモ:");
  });

  it("見送りも学習ループ対象。検証結果『未検証』は併記しない", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [
        proposalPage({
          id: "p4",
          name: "見送り施策",
          weekKey: "2026-W23",
          category: "イベント",
          status: "見送り",
          memo: "時期尚早",
          verification: "未検証",
        }),
      ],
      ideas: [],
    });
    expect(md).toContain("時期尚早");
    expect(md).not.toContain("検証結果:");
  });

  it("プロパティ欠落のページもフォールバック表記で落ちない", () => {
    const emptyPage: NotionPage = { id: "x", url: "https://notion.so/x", properties: {} };
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [emptyPage],
      ideas: [emptyPage],
    });
    expect(md).toContain("週キー無し");
    expect(md).toContain("カテゴリ無し");
    expect(md).toContain("(無題)");
    expect(md).toContain("週開始無し");
  });

  it("title/rich_text の要素に plain_text が無くても空文字で扱う", () => {
    const noPlainText: NotionPage = {
      id: "np",
      url: "https://notion.so/np",
      properties: {
        "施策名": { type: "title", title: [{}] },
        "週キー": { type: "rich_text", rich_text: [{}] },
        "カテゴリ": select("MEO"),
        "ステータス": select("未処理"),
      },
    };
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [noPlainText],
      ideas: [],
    });
    expect(md).toContain("(無題)");
    expect(md).toContain("週キー無し");
  });

  it("記事ネタ案を タイトル案・ステータス付きで列挙する", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({ id: "i1", title: "市川エリアガイド", status: "承認", weekStart: "2026-06-08" }),
      ],
    });
    expect(md).toContain("市川エリアガイド");
    expect(md).toContain("承認");
  });

  it("却下の記事ネタ案は却下理由を併記する", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({
          id: "i-reject",
          title: "狭すぎるテーマ",
          status: "却下",
          weekStart: "2026-06-08",
          reason: "需要が薄いニッチ",
        }),
      ],
    });
    expect(md).toContain("却下理由: 需要が薄いニッチ");
  });

  it("見送りの記事ネタ案は却下理由を併記する", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({
          id: "i-hold",
          title: "情報不足のテーマ",
          status: "見送り",
          weekStart: "2026-06-08",
          reason: "一次情報が出せない",
        }),
      ],
    });
    expect(md).toContain("却下理由: 一次情報が出せない");
  });

  it("公開後判定が要改稿の記事ネタ案は判定と却下理由を併記する", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({
          id: "i-rewrite",
          title: "公開済みだが要改稿",
          status: "公開済み",
          weekStart: "2026-06-08",
          postJudgement: "要改稿",
          reason: "検索意図とズレ",
        }),
      ],
    });
    expect(md).toContain("公開後判定: 要改稿");
    expect(md).toContain("却下理由: 検索意図とズレ");
  });

  it("公開後判定が要改稿で却下理由が空なら判定だけを併記する", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({
          id: "i-rewrite-no-reason",
          title: "理由なし要改稿",
          status: "公開済み",
          weekStart: "2026-06-08",
          postJudgement: "要改稿",
        }),
      ],
    });
    expect(md).toContain("公開後判定: 要改稿");
    expect(md).not.toContain("却下理由:");
  });

  it("却下の記事ネタ案でも却下理由が空なら理由を併記しない", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({
          id: "i-reject-no-reason",
          title: "理由なし却下",
          status: "却下",
          weekStart: "2026-06-08",
        }),
      ],
    });
    expect(md).toContain("理由なし却下");
    expect(md).not.toContain("却下理由:");
  });

  it("通常ステータスの記事ネタ案は却下理由や公開後判定を併記しない", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({
          id: "i-normal",
          title: "通常の承認行",
          status: "承認",
          weekStart: "2026-06-08",
        }),
      ],
    });
    expect(md).toContain("通常の承認行");
    expect(md).not.toContain("却下理由:");
    expect(md).not.toContain("公開後判定:");
  });

  it("公開済み記事があるとき記事タイプ別の成績サマリを含む(#221 伸ばす学習)", () => {
    const publishedIdea: NotionPage = {
      id: "pub1",
      url: "https://notion.so/pub1",
      properties: {
        "タイトル案": title("本八幡で始めるガイド"),
        "ステータス": select("公開済み"),
        "対象週開始": date("2026-05-01"),
        "記事タイプ": select("獲得"),
        "公開後判定": select("成功"),
      },
    };
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [publishedIdea],
    });
    expect(md).toContain("成績サマリ");
    expect(md).toContain("獲得");
    expect(md).toContain("成功1");
    expect(md).toContain("効いた型を優先");
  });

  it("公開済み記事が無いとき成績サマリは空表示で壊れない(#221 欠落耐性)", () => {
    const md = summarizeExisting({
      period,
      nowMs: fixedNowMs,
      reportsForWeek: [],
      proposals: [],
      ideas: [ideaPage({ id: "i2", title: "未公開案", status: "承認", weekStart: "2026-06-08" })],
    });
    expect(md).toContain("成績サマリ");
    expect(md).toContain("公開済み記事がまだ無い");
  });
});

describe("searchIntentIndexLines", () => {
  it("検索意図インデックスに生きているネタのタイトルと検索意図を出す", () => {
    const lines = searchIntentIndexLines([
      ideaPage({
        id: "i-live",
        title: "本八幡で始めるガイド",
        status: "提案中",
        weekStart: "2026-06-08",
        searchIntent: "本八幡 ピックルボール 始め方",
      }),
      ideaPage({
        id: "i-pub",
        title: "公開済みガイド",
        status: "公開済み",
        weekStart: "2026-05-01",
        searchIntent: "市川 ピックルボール 屋内",
      }),
    ]);
    const textValue = lines.join("\n");
    expect(textValue).toContain("本八幡で始めるガイド ｜ 検索意図: 本八幡 ピックルボール 始め方");
    expect(textValue).toContain("公開済みガイド ｜ 検索意図: 市川 ピックルボール 屋内");
  });

  it("却下・見送りのネタはインデックスに出さない", () => {
    const lines = searchIntentIndexLines([
      ideaPage({
        id: "i-reject",
        title: "却下済みテーマ",
        status: "却下",
        weekStart: "2026-06-08",
        searchIntent: "却下 意図",
      }),
      ideaPage({
        id: "i-hold",
        title: "見送りテーマ",
        status: "見送り",
        weekStart: "2026-06-08",
        searchIntent: "見送り 意図",
      }),
      ideaPage({
        id: "i-live",
        title: "生きているテーマ",
        status: "生成中",
        weekStart: "2026-06-08",
        searchIntent: "生成中 意図",
      }),
    ]);
    const textValue = lines.join("\n");
    expect(textValue).toContain("生きているテーマ");
    expect(textValue).not.toContain("却下済みテーマ");
    expect(textValue).not.toContain("見送りテーマ");
  });

  it("検索意図が空なら未記入として出す", () => {
    const lines = searchIntentIndexLines([
      ideaPage({
        id: "i-empty",
        title: "検索意図なし",
        status: "承認",
        weekStart: "2026-06-08",
        searchIntent: null,
      }),
    ]);
    expect(lines.join("\n")).toContain("検索意図なし ｜ 検索意図: (検索意図未記入)");
  });

  it("生きているネタ0件でインデックスは空と出す", () => {
    const lines = searchIntentIndexLines([
      ideaPage({
        id: "i-reject",
        title: "却下済み",
        status: "却下",
        weekStart: "2026-06-08",
      }),
    ]);
    expect(lines).toEqual(["(生きているネタが無いためインデックスは空)"]);
  });
});

describe("coverageCrossTabLines", () => {
  it("カバレッジ集計を記事タイプ×媒体で数える", () => {
    const lines = coverageCrossTabLines([
      ideaPage({
        id: "i1",
        title: "獲得コラム1",
        status: "提案中",
        weekStart: "2026-06-08",
        articleType: "獲得",
        media: "コラム",
      }),
      ideaPage({
        id: "i2",
        title: "獲得コラム2",
        status: "公開済み",
        weekStart: "2026-06-08",
        articleType: "獲得",
        media: "コラム",
      }),
      ideaPage({
        id: "i3",
        title: "イベントニュース",
        status: "承認",
        weekStart: "2026-06-08",
        articleType: "イベント",
        media: "ニュース",
      }),
    ]);
    const textValue = lines.join("\n");
    expect(textValue).toContain("| 獲得 | 2 | 0 |");
    expect(textValue).toContain("| イベント | 0 | 1 |");
  });

  it("媒体欠落はコラム列に計上する", () => {
    const textValue = coverageCrossTabLines([
      ideaPage({
        id: "i-missing-media",
        title: "媒体なし",
        status: "承認",
        weekStart: "2026-06-08",
        articleType: "資産",
        media: null,
      }),
    ]).join("\n");
    expect(textValue).toContain("| 資産 | 1 | 0 |");
  });

  it("記事タイプ欠落はタイプ未設定行に計上する", () => {
    const textValue = coverageCrossTabLines([
      ideaPage({
        id: "i-missing-type",
        title: "タイプなし",
        status: "承認",
        weekStart: "2026-06-08",
        articleType: null,
        media: "ニュース",
      }),
    ]).join("\n");
    expect(textValue).toContain("| タイプ未設定 | 0 | 1 |");
  });

  it("既知5型は現れなくても0で出す", () => {
    const textValue = coverageCrossTabLines([
      ideaPage({
        id: "i-acq",
        title: "獲得だけ",
        status: "提案中",
        weekStart: "2026-06-08",
        articleType: "獲得",
        media: "コラム",
      }),
    ]).join("\n");
    expect(textValue).toContain("| 不安解消 | 0 | 0 |");
    expect(textValue).toContain("| 比較 | 0 | 0 |");
  });

  it("却下・見送りはカバレッジ本数に数えない", () => {
    const lines = coverageCrossTabLines([
      ideaPage({
        id: "i-reject",
        title: "却下獲得",
        status: "却下",
        weekStart: "2026-06-08",
        articleType: "獲得",
        media: "コラム",
      }),
      ideaPage({
        id: "i-hold",
        title: "見送りイベント",
        status: "見送り",
        weekStart: "2026-06-08",
        articleType: "イベント",
        media: "ニュース",
      }),
    ]);
    expect(lines).toEqual(["(生きているネタが無いためカバレッジは空)"]);
  });

  it("生きているネタ0件でカバレッジは空と出す", () => {
    const lines = coverageCrossTabLines([]);
    expect(lines).toEqual(["(生きているネタが無いためカバレッジは空)"]);
  });
});

describe("articleReviewLabelLines", () => {
  it("公開済み記事に判定ラベルを記事単位で併記する", () => {
    const lines = articleReviewLabelLines([
      ideaPage({
        id: "i-pub",
        title: "CTR改善対象",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: metricsJson({
          views: { current: 40, prior: 0, deltaPct: null },
          keyEvents: { current: 1, prior: 0, deltaPct: null },
          search: {
            clicks: { current: 5, prior: 0, deltaPct: null },
            impressions: { current: 500, prior: 0, deltaPct: null },
            ctr: { current: 0.02, prior: 0, deltaPct: null },
            position: { current: 20, prior: 0, deltaPct: null },
            topQueries: [],
          },
          publishedAt: "2026-07-01T00:00:00.000Z",
        }),
      }),
    ], fixedNowMs);
    expect(lines).toContain("- CTR改善対象: CTR弱い");
  });

  it("複数ラベルは中黒で連結する", () => {
    const lines = articleReviewLabelLines([
      ideaPage({
        id: "i-multi",
        title: "複数改善対象",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: metricsJson({
          views: { current: 40, prior: 0, deltaPct: null },
          keyEvents: { current: 1, prior: 0, deltaPct: null },
          publishedAt: "2026-07-01T00:00:00.000Z",
        }),
      }),
    ], fixedNowMs);
    expect(lines).toContain("- 複数改善対象: CTR弱い・順位あと少し");
  });

  it("成績データが空/不正の公開済み記事は未計測と出す", () => {
    const lines = articleReviewLabelLines([
      ideaPage({
        id: "i-empty",
        title: "未計測記事",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: null,
      }),
      ideaPage({
        id: "i-invalid",
        title: "不正JSON記事",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: "not-json",
      }),
    ], fixedNowMs);
    expect(lines).toContain("- 未計測記事: 未計測");
    expect(lines).toContain("- 不正JSON記事: 未計測");
  });

  it("publishedAt 欠落でも要改稿以外のラベルは出る", () => {
    const parsed = JSON.parse(metricsJson({
      views: { current: 40, prior: 0, deltaPct: null },
      keyEvents: { current: 1, prior: 0, deltaPct: null },
    })) as ArticleMetrics;
    delete parsed.publishedAt;
    const lines = articleReviewLabelLines([
      ideaPage({
        id: "i-no-published-at",
        title: "公開日なし",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: JSON.stringify(parsed),
      }),
    ], fixedNowMs);
    expect(lines).toContain("- 公開日なし: CTR弱い・順位あと少し");
    expect(lines.join("\n")).not.toContain("要改稿");
  });

  it("公開前の記事はラベル節に出さない", () => {
    const lines = articleReviewLabelLines([
      ideaPage({
        id: "i-draft",
        title: "未公開案",
        status: "承認",
        weekStart: "2026-06-08",
        metrics: metricsJson(),
      }),
      ideaPage({
        id: "i-pub",
        title: "公開済み案",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: metricsJson(),
      }),
    ], fixedNowMs);
    const textValue = lines.join("\n");
    expect(textValue).toContain("公開済み案");
    expect(textValue).not.toContain("未公開案");
  });

  it("ラベルが空ならコロン以降を省いてタイトルだけ出す", () => {
    const lines = articleReviewLabelLines([
      ideaPage({
        id: "i-no-label",
        title: "ラベルなし記事",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: metricsJson({
          views: { current: 40, prior: 0, deltaPct: null },
          keyEvents: { current: 1, prior: 0, deltaPct: null },
          search: {
            clicks: { current: 5, prior: 0, deltaPct: null },
            impressions: { current: 20, prior: 0, deltaPct: null },
            ctr: { current: 0.25, prior: 0, deltaPct: null },
            position: { current: 20, prior: 0, deltaPct: null },
            topQueries: [],
          },
          publishedAt: "2026-07-01T00:00:00.000Z",
        }),
      }),
    ], fixedNowMs);
    expect(lines).toEqual(["- ラベルなし記事"]);
  });

  it("公開済み0本なら空である旨を出す", () => {
    const lines = articleReviewLabelLines([
      ideaPage({ id: "i-draft", title: "未公開案", status: "承認", weekStart: "2026-06-08" }),
    ], fixedNowMs);
    expect(lines).toEqual(["(公開済み記事がまだ無いため記事単位ラベルは空)"]);
  });

  it("nowMs 注入で要改稿判定が決定的", () => {
    const lines = articleReviewLabelLines([
      ideaPage({
        id: "i-rewrite",
        title: "要改稿対象",
        status: "公開済み",
        weekStart: "2026-06-08",
        metrics: metricsJson({
          views: { current: 20, prior: 0, deltaPct: null },
          keyEvents: { current: 1, prior: 0, deltaPct: null },
          search: {
            clicks: { current: 5, prior: 0, deltaPct: null },
            impressions: { current: 20, prior: 0, deltaPct: null },
            ctr: { current: 0.25, prior: 0, deltaPct: null },
            position: { current: 20, prior: 0, deltaPct: null },
            topQueries: [],
          },
          publishedAt: "2026-06-01T00:00:00.000Z",
        }),
      }),
    ], fixedNowMs);
    expect(lines).toContain("- 要改稿対象: 要改稿");
  });
});
