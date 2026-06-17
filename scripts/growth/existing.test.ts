// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import { summarizeExisting, weekStartEqualsFilter } from "./existing";

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

function ideaPage(opts: { id: string; title: string; status: string; weekStart: string }): NotionPage {
  return {
    id: opts.id,
    url: `https://notion.so/${opts.id}`,
    properties: {
      "タイトル案": title(opts.title),
      "ステータス": select(opts.status),
      "対象週開始": date(opts.weekStart),
    },
  };
}

const period = { start: "2026-06-08", end: "2026-06-14" };

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
    const md = summarizeExisting({ period, reportsForWeek: [], proposals: [], ideas: [] });
    expect(md).toContain("2026-06-08");
    expect(md).toContain("未作成");
    // 未作成のときは明確に作成を促す
    expect(md).toMatch(/新規作成|作成してください/);
    expect(md).not.toContain("作成済み");
  });

  it("対象週のレポートがあるとき『作成済み』を示す", () => {
    const md = summarizeExisting({
      period,
      reportsForWeek: [reportPage("2026-06-08")],
      proposals: [],
      ideas: [],
    });
    expect(md).toContain("作成済み");
    expect(md).not.toContain("未作成");
  });

  it("施策提案を 週キー・カテゴリ・ステータス・施策名 付きで列挙する", () => {
    const md = summarizeExisting({
      period,
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
      reportsForWeek: [],
      proposals: [],
      ideas: [
        ideaPage({ id: "i1", title: "市川エリアガイド", status: "承認", weekStart: "2026-06-08" }),
      ],
    });
    expect(md).toContain("市川エリアガイド");
    expect(md).toContain("承認");
  });
});
