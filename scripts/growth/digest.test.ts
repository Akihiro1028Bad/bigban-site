// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildDigestMessage,
  buildFailureMessage,
  clampAltText,
  extractReportSummary,
  LINE_ALT_TEXT_MAX,
} from "./digest";
import type { DigestInput } from "./digest";
import type { NotionBlock } from "./notion";

function baseInput(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    periodLabel: "2026-06-08〜06-14",
    metrics: {
      sessions: { current: 777, prior: 0, deltaPct: null },
      clicks: { current: 404, prior: 470, deltaPct: -14 },
      impressions: { current: 1492, prior: 1434, deltaPct: 4 },
      position: { current: 4.08, prior: 3.24, deltaPct: 25.9 },
    },
    topActions: ["成果を数える設定を入れる", "市川の受け皿ページを作る", "トップに予約ボタン"],
    pendingCount: 20,
    reportUrl: "https://xxx.notion.site/report",
    approveUrl: "https://example.com/growth/approve",
    ...overrides,
  };
}

describe("buildDigestMessage", () => {
  it("数字を行動文に翻訳し、やること・確認待ち・2つのURLを含む", () => {
    const msg = buildDigestMessage(baseInput());

    expect(msg).toContain("📊 週次サイト報告 (2026-06-08〜06-14)");
    expect(msg).toContain("サイト訪問 777回 (前週データなし)");
    expect(msg).toContain("検索からの訪問 404回 前週より14%減");
    expect(msg).toContain("検索結果に出た回数 1,492回 前週より4%増");
    expect(msg).toContain("検索順位 4.1位 前週より悪化");
    expect(msg).toContain("■ 今週やること");
    expect(msg).toContain("1. 成果を数える設定を入れる");
    expect(msg).toContain("3. トップに予約ボタン");
    expect(msg).toContain("確認待ち 20件");
    expect(msg).toContain("レポートを見る → https://xxx.notion.site/report");
    expect(msg).toContain("ダッシュボードを開く → https://example.com/growth/approve");
  });

  it("順位が改善・横ばいの表現を出し分ける", () => {
    const improved = buildDigestMessage(
      baseInput({ metrics: { position: { current: 3.0, prior: 4.0, deltaPct: -25 } } })
    );
    expect(improved).toContain("検索順位 3.0位 前週より改善");

    const flat = buildDigestMessage(
      baseInput({ metrics: { position: { current: 4.0, prior: 4.0, deltaPct: 0 } } })
    );
    expect(flat).toContain("検索順位 4.0位 前週から横ばい");

    const noPrior = buildDigestMessage(
      baseInput({ metrics: { position: { current: 4.0, prior: 0, deltaPct: null } } })
    );
    expect(noPrior).toContain("検索順位 4.0位 (前週データなし)");
  });

  it("増減ゼロは横ばい、データ無しは注記する", () => {
    const msg = buildDigestMessage(
      baseInput({
        metrics: {
          clicks: { current: 100, prior: 100, deltaPct: 0 },
          impressions: { current: 50, prior: 0, deltaPct: null },
        },
      })
    );
    expect(msg).toContain("検索からの訪問 100回 前週から横ばい");
    expect(msg).toContain("検索結果に出た回数 50回 (前週データなし)");
  });

  it("やることが空・URLが無い場合はそれらの行を出さない", () => {
    const msg = buildDigestMessage(
      baseInput({ topActions: [], reportUrl: null, approveUrl: null })
    );
    expect(msg).not.toContain("■ 今週やること");
    expect(msg).not.toContain("レポートを見る");
    expect(msg).not.toContain("ダッシュボードを開く →");
    expect(msg).toContain("確認待ち 20件");
  });

  it("やることは最大3件に丸める", () => {
    const msg = buildDigestMessage(
      baseInput({ topActions: ["a", "b", "c", "d", "e"] })
    );
    expect(msg).toContain("3. c");
    expect(msg).not.toContain("4. d");
  });

  it("警告がある場合は先頭に表示する", () => {
    const msg = buildDigestMessage(
      baseInput({ warnings: ["⚠ トークンの失効が近づいています"] })
    );
    const head = msg.split("\n")[0];
    expect(head).toBe("⚠ トークンの失効が近づいています");
    expect(msg).toContain("📊 週次サイト報告");
  });

  it("警告が空配列・未指定なら警告行を出さない", () => {
    const omitted = buildDigestMessage(baseInput());
    expect(omitted.startsWith("📊")).toBe(true);
    const empty = buildDigestMessage(baseInput({ warnings: [] }));
    expect(empty.startsWith("📊")).toBe(true);
  });

  it("LINE要約がある場合は今週のまとめを指標より前に出す", () => {
    const msg = buildDigestMessage(
      baseInput({
        reportSummary: {
          lineSummary: ["検索流入は伸びたが予約導線が弱い週でした", "来週は予約ボタンを強化する"],
          discussion: ["A"],
          dataNotes: ["推測を含む"],
        },
      })
    );

    expect(msg).toContain("■ 今週のまとめ");
    expect(msg).toContain("検索流入は伸びたが予約導線が弱い週でした");
    expect(msg).toContain("来週は予約ボタンを強化する");
    // まとめ見出しは指標(サイト訪問)より前に出る
    expect(msg.indexOf("■ 今週のまとめ")).toBeLessThan(msg.indexOf("サイト訪問"));
  });

  it("LINE要約がある場合はフォールバックの論点・データ注意を出さない", () => {
    const msg = buildDigestMessage(
      baseInput({
        reportSummary: {
          lineSummary: ["今週のまとめ本文"],
          discussion: ["A", "B"],
          dataNotes: ["推測を含む"],
        },
      })
    );

    expect(msg).toContain("■ 今週のまとめ");
    expect(msg).not.toContain("■ 論点");
    expect(msg).not.toContain("■ データ注意");
  });

  it("LINE要約が空のときだけ論点とデータ注意をフォールバック表示する", () => {
    const msg = buildDigestMessage(
      baseInput({
        reportSummary: {
          lineSummary: [],
          discussion: ["A", "B"],
          dataNotes: ["推測を含む"],
        },
      })
    );

    expect(msg).not.toContain("■ 今週のまとめ");
    expect(msg).toContain("■ 論点");
    expect(msg).toContain("・A");
    expect(msg).toContain("・B");
    expect(msg).toContain("■ データ注意");
    expect(msg).toContain("・推測を含む");
  });

  it("レポート要約が未指定または空なら今週のまとめ・論点・データ注意を出さない", () => {
    const omitted = buildDigestMessage(baseInput());
    expect(omitted).not.toContain("■ 今週のまとめ");
    expect(omitted).not.toContain("■ 論点");
    expect(omitted).not.toContain("■ データ注意");

    const empty = buildDigestMessage(
      baseInput({ reportSummary: { lineSummary: [], discussion: [], dataNotes: [] } })
    );
    expect(empty).not.toContain("■ 今週のまとめ");
    expect(empty).not.toContain("■ 論点");
    expect(empty).not.toContain("■ データ注意");
  });

  it("合言葉を表示しない", () => {
    expect(buildDigestMessage(baseInput())).not.toContain("合言葉");
  });
});

describe("buildDigestMessage の実行 SHA(#219)", () => {
  it("sha があれば末尾にスキュー確認用の実行 SHA を載せる", () => {
    const msg = buildDigestMessage(baseInput({ sha: "a1b2c3d" }));
    expect(msg).toContain("実行 SHA: a1b2c3d");
  });

  it("sha 未指定なら SHA 行を出さない", () => {
    const msg = buildDigestMessage(baseInput());
    expect(msg).not.toContain("実行 SHA");
  });

  it("sha が空文字なら SHA 行を出さない(取得失敗時に余計な行を足さない)", () => {
    const msg = buildDigestMessage(baseInput({ sha: "  " }));
    expect(msg).not.toContain("実行 SHA");
  });
});

describe("buildFailureMessage", () => {
  it("自動実行の失敗とログの場所を伝える", () => {
    const msg = buildFailureMessage("data/weekly-cron.log");
    expect(msg).toContain("❌");
    expect(msg).toContain("今週の自動実行に失敗しました");
    expect(msg).toContain("data/weekly-cron.log");
  });
});

function heading(id: string, text: string, level: "heading_2" | "heading_3" = "heading_2"): NotionBlock {
  return { id, type: level, [level]: { rich_text: [{ plain_text: text }] } };
}

function paragraph(text: string): NotionBlock {
  return { id: `p-${text}`, type: "paragraph", paragraph: { rich_text: [{ plain_text: text }] } };
}

function listItem(text: string): NotionBlock {
  return {
    id: `li-${text}`,
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: [{ plain_text: text }] },
  };
}

describe("extractReportSummary", () => {
  it("論点/データ注意セクションの要点を抽出する", () => {
    const blocks = [
      heading("h2a", "今週の論点"),
      listItem("A"),
      listItem("B"),
      heading("h2b", "データ注意"),
      paragraph("推測を含む"),
    ];

    expect(extractReportSummary(blocks)).toEqual({
      lineSummary: [],
      discussion: ["A", "B"],
      dataNotes: ["推測を含む"],
    });
  });

  it("LINE要約セクション(h2/h3)の段落・箇条書きを抽出する", () => {
    const h2 = extractReportSummary([
      heading("h2s", "LINE要約"),
      paragraph("検索流入は伸びたが予約導線が弱い週でした"),
      listItem("来週は予約ボタンを強化する"),
    ]);
    expect(h2.lineSummary).toEqual([
      "検索流入は伸びたが予約導線が弱い週でした",
      "来週は予約ボタンを強化する",
    ]);

    const h3 = extractReportSummary([
      heading("h3s", "LINE要約", "heading_3"),
      paragraph("一行目"),
    ]);
    expect(h3.lineSummary).toEqual(["一行目"]);
  });

  it("LINE要約は最大5行、超過は落とす", () => {
    const blocks = [
      heading("h2s", "LINE要約"),
      paragraph("1"),
      paragraph("2"),
      paragraph("3"),
      paragraph("4"),
      paragraph("5"),
      paragraph("6"),
    ];

    expect(extractReportSummary(blocks).lineSummary).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("LINE要約は100字超を99字+…に切る", () => {
    const long = "あ".repeat(105);
    const blocks = [heading("h2s", "LINE要約"), paragraph(long)];

    expect(extractReportSummary(blocks).lineSummary[0]).toBe("あ".repeat(99) + "…");
  });

  it("各セクション最大3行、超過は落とす", () => {
    const blocks = [
      heading("h2a", "論点"),
      listItem("1"),
      listItem("2"),
      listItem("3"),
      listItem("4"),
    ];

    expect(extractReportSummary(blocks).discussion).toEqual(["1", "2", "3"]);
  });

  it("120字超は119字+…に切る", () => {
    const long = "あ".repeat(130);
    const blocks = [heading("h2a", "論点"), paragraph(long)];

    expect(extractReportSummary(blocks).discussion[0]).toBe("あ".repeat(119) + "…");
  });

  it("該当見出しが無ければ空配列", () => {
    expect(extractReportSummary([heading("h2a", "今週の数字"), paragraph("x")])).toEqual({
      lineSummary: [],
      discussion: [],
      dataNotes: [],
    });
  });

  it("heading_3表記、連結rich_text、空行、見出し無し先頭段落、未対応blockを扱う", () => {
    const blocks: NotionBlock[] = [
      paragraph("見出し前は無視"),
      heading("h3a", "主要な", "heading_3"),
      {
        id: "p-empty",
        type: "paragraph",
        paragraph: { rich_text: [{ plain_text: " " }] },
      },
      {
        id: "to-do",
        type: "to_do",
        to_do: { rich_text: [{ plain_text: "未対応は無視" }] },
      },
      {
        id: "p-joined",
        type: "paragraph",
        paragraph: { rich_text: [{ plain_text: "論点" }, { plain_text: "ではない本文" }] },
      },
      {
        id: "h3b",
        type: "heading_3",
        heading_3: { rich_text: [{ plain_text: "データ" }, { plain_text: "注意メモ" }] },
      },
      {
        id: "li-empty-rich",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [] },
      },
      listItem("数字は暫定"),
    ];

    expect(extractReportSummary(blocks)).toEqual({
      lineSummary: [],
      discussion: [],
      dataNotes: ["数字は暫定"],
    });
  });

  it("Notionブロックのpayloadやrich_textが壊れていても落とさない", () => {
    const blocks: NotionBlock[] = [
      { id: "h-bad-string", type: "heading_2", heading_2: "論点" },
      paragraph("無効見出し後は入らない"),
      { id: "h-bad-null", type: "heading_2", heading_2: null },
      { id: "h-bad-array", type: "heading_2", heading_2: [] },
      heading("h-good", "論点"),
      { id: "p-no-rich", type: "paragraph", paragraph: {} },
      {
        id: "p-bad-rich",
        type: "paragraph",
        paragraph: { rich_text: "本文" },
      },
      {
        id: "p-bad-items",
        type: "paragraph",
        paragraph: {
          rich_text: [
            null,
            [],
            "x",
            { plain_text: 123 },
            { plain_text: "有効" },
          ],
        },
      },
    ];

    expect(extractReportSummary(blocks)).toEqual({
      lineSummary: [],
      discussion: ["有効"],
      dataNotes: [],
    });
  });
});

describe("clampAltText", () => {
  it("上限以内はそのまま返す", () => {
    expect(clampAltText("短い本文", 400)).toBe("短い本文");
  });
  it("上限ちょうどはそのまま返す", () => {
    const text = "あ".repeat(400);
    expect(clampAltText(text)).toBe(text);
  });
  it("上限超過は末尾を…で丸めて上限に収める", () => {
    const text = "あ".repeat(500);
    const out = clampAltText(text);
    expect(out.length).toBe(LINE_ALT_TEXT_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("あ".repeat(399) + "…");
  });
});
