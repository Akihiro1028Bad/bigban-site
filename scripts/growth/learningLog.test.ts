import { describe, expect, it, vi } from "vitest";

import type { NotionApiOptions, NotionPage } from "./notion";
import {
  AdoptedFixDetailSchema,
  appendLearningLog,
  buildLearningLogFailNotice,
  buildLearningLogProps,
  buildLearningLogTitle,
  formatAdoptedFixSummary,
  formatEditDiffSummary,
  htmlToPlainBlocks,
  LEARNING_LOG_PROPS,
  parseLearningEvent,
  parseLearningLogPage,
  summarizeLearningLog,
  summarizeEditDiff,
  type AdoptedFixDetail,
  type EditDiffSummary,
  type LearningEvent,
  type LearningLogRow,
} from "./learningLog";

const NOW_ISO = "2026-07-05T12:34:56.000Z";

function richTextContent(prop: unknown): string {
  const value = prop as { rich_text?: Array<{ text?: { content?: string } }> };
  return (value.rich_text ?? []).map((item) => item.text?.content ?? "").join("");
}

function titleContent(prop: unknown): string {
  const value = prop as { title?: Array<{ text?: { content?: string } }> };
  return (value.title ?? []).map((item) => item.text?.content ?? "").join("");
}

function selectName(prop: unknown): string {
  const value = prop as { select?: { name?: string } };
  return value.select?.name ?? "";
}

function dateStart(prop: unknown): string {
  const value = prop as { date?: { start?: string } };
  return value.date?.start ?? "";
}

function numberValue(prop: unknown): number | null {
  const value = prop as { number?: number | null };
  return value.number ?? null;
}

function page(properties: Record<string, unknown>): NotionPage {
  return { id: "page-1", url: "https://notion.test/page-1", properties };
}

describe("parseLearningEvent", () => {
  it("4 種別の妥当 JSON を LearningEvent に変換する", () => {
    expect(
      parseLearningEvent(
        JSON.stringify({
          kind: "編集",
          pageId: "idea-1",
          title: "記事タイトル",
          before: "<p>before</p>",
          after: "<p>after</p>",
        })
      )
    ).toEqual({
      kind: "編集",
      pageId: "idea-1",
      title: "記事タイトル",
      before: "<p>before</p>",
      after: "<p>after</p>",
    });
    expect(
      parseLearningEvent(
        JSON.stringify({
          kind: "採否",
          pageId: "idea-1",
          title: "記事タイトル",
          aspect: "読みやすさ",
          before: "before",
          after: "after",
        })
      )
    ).toEqual({
      kind: "採否",
      pageId: "idea-1",
      title: "記事タイトル",
      aspect: "読みやすさ",
      before: "before",
      after: "after",
    });
    expect(
      parseLearningEvent(
        JSON.stringify({
          kind: "画像試行",
          pageId: "idea-1",
          title: "記事タイトル",
          style: "diagram",
          result: "成功",
          attempt: 1,
        })
      )
    ).toEqual({
      kind: "画像試行",
      pageId: "idea-1",
      title: "記事タイトル",
      style: "diagram",
      result: "成功",
      attempt: 1,
    });
    expect(
      parseLearningEvent(
        JSON.stringify({
          kind: "工程失敗",
          mode: "revise",
          exitCode: null,
          detail: "failed",
        })
      )
    ).toEqual({
      kind: "工程失敗",
      mode: "revise",
      exitCode: null,
      detail: "failed",
    });
  });

  it("不正 JSON とスキーマ不一致は null を返す", () => {
    expect(parseLearningEvent("{")).toBeNull();
    expect(parseLearningEvent(JSON.stringify({ pageId: "idea-1" }))).toBeNull();
    expect(
      parseLearningEvent(
        JSON.stringify({
          kind: "画像試行",
          pageId: "idea-1",
          title: "記事タイトル",
          style: "diagram",
          result: "成功",
          attempt: 0,
        })
      )
    ).toBeNull();
    expect(
      parseLearningEvent(
        JSON.stringify({
          kind: "画像試行",
          pageId: "idea-1",
          title: "記事タイトル",
          style: "diagram",
          result: "保留",
          attempt: 1,
        })
      )
    ).toBeNull();
  });
});

describe("buildLearningLogTitle", () => {
  it("4 種別のタイトルを生成する", () => {
    expect(
      buildLearningLogTitle(
        { kind: "編集", pageId: "idea-1", title: "初めてのピックルボール", before: "a", after: "b" },
        "導入を短縮"
      )
    ).toBe("編集: 導入を短縮 (初めてのピックルボール)");
    expect(
      buildLearningLogTitle({
        kind: "採否",
        pageId: "idea-1",
        title: "初めてのピックルボール",
        aspect: "読みやすさ",
        before: "a",
        after: "b",
      })
    ).toBe("採用: 読みやすさ (初めてのピックルボール)");
    expect(
      buildLearningLogTitle({
        kind: "画像試行",
        pageId: "idea-1",
        title: "初めてのピックルボール",
        style: "mascot",
        result: "成功",
        attempt: 2,
      })
    ).toBe("画像成功: mascot ×2 (初めてのピックルボール)");
    expect(
      buildLearningLogTitle({
        kind: "工程失敗",
        mode: "draft",
        exitCode: 1,
        detail: "Codex failed",
      })
    ).toBe("失敗: draft 異常終了(exit 1)");
  });

  it("60 字超を丸め、空 title は 無題 にフォールバックする", () => {
    const longHeadline = "あ".repeat(80);
    const title = buildLearningLogTitle(
      { kind: "編集", pageId: "idea-1", title: " ".repeat(3), before: "a", after: "b" },
      longHeadline
    );
    expect(title).toHaveLength(60);
    expect(title).toBe(`編集: ${"あ".repeat(56)}`);

    expect(
      buildLearningLogTitle({
        kind: "採否",
        pageId: "idea-1",
        title: "",
        aspect: "",
        before: "a",
        after: "b",
      })
    ).toBe("採用: 観点なし (無題)");
  });

  it("工程失敗の exitCode=null は exit ? にする", () => {
    expect(
      buildLearningLogTitle({
        kind: "工程失敗",
        mode: "regen-body",
        exitCode: null,
        detail: "unknown",
      })
    ).toBe("失敗: regen-body 異常終了(exit ?)");
  });

  it("編集で editHeadline が無いときは 変更 にフォールバックする", () => {
    expect(
      buildLearningLogTitle({
        kind: "編集",
        pageId: "idea-1",
        title: "初めてのピックルボール",
        before: "a",
        after: "b",
      })
    ).toBe("編集: 変更 (初めてのピックルボール)");
  });
});

describe("buildLearningLogProps", () => {
  it("編集イベントを Notion プロパティに変換する", () => {
    const event: LearningEvent = {
      kind: "編集",
      pageId: "idea-1",
      title: "記事タイトル",
      before: "<p>before</p>",
      after: "<p>after</p>",
    };
    const props = buildLearningLogProps(event, NOW_ISO, "[導入] 80字短縮", "導入を短縮");

    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("編集");
    expect(dateStart(props[LEARNING_LOG_PROPS.recordedAt])).toBe(NOW_ISO);
    expect(titleContent(props[LEARNING_LOG_PROPS.event])).toBe("編集: 導入を短縮 (記事タイトル)");
    expect(richTextContent(props[LEARNING_LOG_PROPS.articleTitle])).toBe("記事タイトル");
    expect(richTextContent(props[LEARNING_LOG_PROPS.pageId])).toBe("idea-1");
    expect(richTextContent(props[LEARNING_LOG_PROPS.target])).toBe("");
    expect(richTextContent(props[LEARNING_LOG_PROPS.summary])).toBe("[導入] 80字短縮");
    expect(props).not.toHaveProperty(LEARNING_LOG_PROPS.result);
    expect(props).not.toHaveProperty(LEARNING_LOG_PROPS.count);
  });

  it("採否イベントは対象に aspect を入れ、空 aspect なら空 rich_text にする", () => {
    const props = buildLearningLogProps(
      {
        kind: "採否",
        pageId: "idea-1",
        title: "記事タイトル",
        aspect: "読みやすさ",
        before: "before",
        after: "after",
      },
      NOW_ISO,
      "強調を採用"
    );
    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("採否");
    expect(richTextContent(props[LEARNING_LOG_PROPS.target])).toBe("読みやすさ");
    expect(props).not.toHaveProperty(LEARNING_LOG_PROPS.result);
    expect(props).not.toHaveProperty(LEARNING_LOG_PROPS.count);

    const emptyAspectProps = buildLearningLogProps(
      {
        kind: "採否",
        pageId: "idea-1",
        title: "記事タイトル",
        aspect: "",
        before: "before",
        after: "after",
      },
      NOW_ISO,
      ""
    );
    expect(emptyAspectProps[LEARNING_LOG_PROPS.target]).toEqual({ rich_text: [] });
  });

  it("画像試行イベントは結果・回数・対象を入れる", () => {
    const successProps = buildLearningLogProps(
      {
        kind: "画像試行",
        pageId: "idea-1",
        title: "記事タイトル",
        style: "diagram",
        result: "成功",
        attempt: 3,
      },
      NOW_ISO,
      "生成成功"
    );
    expect(selectName(successProps[LEARNING_LOG_PROPS.result])).toBe("成功");
    expect(numberValue(successProps[LEARNING_LOG_PROPS.count])).toBe(3);
    expect(richTextContent(successProps[LEARNING_LOG_PROPS.target])).toBe("diagram");

    const failProps = buildLearningLogProps(
      {
        kind: "画像試行",
        pageId: "idea-1",
        title: "記事タイトル",
        style: "mascot",
        result: "失敗",
        attempt: 1,
      },
      NOW_ISO,
      "生成失敗"
    );
    expect(selectName(failProps[LEARNING_LOG_PROPS.result])).toBe("失敗");
  });

  it("工程失敗イベントは記事タイトル・ページIDを空にし、結果=失敗・対象=mode にする", () => {
    const props = buildLearningLogProps(
      { kind: "工程失敗", mode: "publish-due", exitCode: null, detail: "timeout" },
      NOW_ISO,
      "timeout"
    );
    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("工程失敗");
    expect(props[LEARNING_LOG_PROPS.articleTitle]).toEqual({ rich_text: [] });
    expect(props[LEARNING_LOG_PROPS.pageId]).toEqual({ rich_text: [] });
    expect(selectName(props[LEARNING_LOG_PROPS.result])).toBe("失敗");
    expect(richTextContent(props[LEARNING_LOG_PROPS.target])).toBe("publish-due");
    expect(props).not.toHaveProperty(LEARNING_LOG_PROPS.count);
  });

  it("要約 2001 字を chunkRichText で 2 要素に分割する", () => {
    const props = buildLearningLogProps(
      { kind: "工程失敗", mode: "draft", exitCode: 1, detail: "x" },
      NOW_ISO,
      "あ".repeat(2001)
    );
    expect(props[LEARNING_LOG_PROPS.summary]).toEqual({
      rich_text: [{ text: { content: "あ".repeat(2000) } }, { text: { content: "あ" } }],
    });
  });
});

describe("appendLearningLog", () => {
  const event: LearningEvent = {
    kind: "画像試行",
    pageId: "idea-1",
    title: "記事タイトル",
    style: "diagram",
    result: "成功",
    attempt: 2,
  };
  const notionOptions: NotionApiOptions = {
    token: "notion-token",
    fetchFn: vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    })),
  };

  it("DS 未設定なら createPageFn を呼ばず skipped を返す", async () => {
    const createPageFn = vi.fn<() => Promise<string>>();

    await expect(
      appendLearningLog(event, {
        dataSourceId: undefined,
        notionOptions,
        createPageFn,
        nowIso: NOW_ISO,
      })
    ).resolves.toEqual({ status: "skipped" });
    expect(createPageFn).not.toHaveBeenCalled();

    await expect(
      appendLearningLog(event, {
        dataSourceId: "",
        notionOptions,
        createPageFn,
        nowIso: NOW_ISO,
      })
    ).resolves.toEqual({ status: "skipped" });
    expect(createPageFn).not.toHaveBeenCalled();
  });

  it("DS 設定済みなら createPageFn に props と options を渡して appended を返す", async () => {
    const createPageFn = vi.fn<
      (dataSourceId: string, props: Record<string, unknown>, options: NotionApiOptions) => Promise<string>
    >();
    createPageFn.mockResolvedValue("log-1");

    await expect(
      appendLearningLog(event, {
        dataSourceId: "learning-log-ds",
        notionOptions,
        createPageFn,
        nowIso: NOW_ISO,
        diffSummary: "生成成功",
      })
    ).resolves.toEqual({ status: "appended", pageId: "log-1" });

    expect(createPageFn).toHaveBeenCalledTimes(1);
    const [dataSourceId, props, options] = createPageFn.mock.calls[0];
    expect(dataSourceId).toBe("learning-log-ds");
    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("画像試行");
    expect(options).toBe(notionOptions);
  });

  it("createPageFn が reject しても throw せず failed と error を返す", async () => {
    const error = new Error("notion down");
    const createPageFn = vi.fn<
      (dataSourceId: string, props: Record<string, unknown>, options: NotionApiOptions) => Promise<string>
    >();
    createPageFn.mockRejectedValue(error);

    const outcome = await appendLearningLog(event, {
      dataSourceId: "learning-log-ds",
      notionOptions,
      createPageFn,
      nowIso: NOW_ISO,
    });

    expect(outcome).toEqual({ status: "failed", error });
  });

  it("編集イベントでは diffSummary と titleHeadline を props/title に反映する", async () => {
    const createPageFn = vi.fn<
      (dataSourceId: string, props: Record<string, unknown>, options: NotionApiOptions) => Promise<string>
    >();
    createPageFn.mockResolvedValue("log-1");

    await appendLearningLog(
      {
        kind: "編集",
        pageId: "idea-1",
        title: "記事タイトル",
        before: "<p>before</p>",
        after: "<p>after</p>",
      },
      {
        dataSourceId: "learning-log-ds",
        notionOptions,
        createPageFn,
        nowIso: NOW_ISO,
        diffSummary: "[導入] 80字短縮",
        titleHeadline: "導入を短縮",
      }
    );

    const props = createPageFn.mock.calls[0][1];
    expect(titleContent(props[LEARNING_LOG_PROPS.event])).toBe("編集: 導入を短縮 (記事タイトル)");
    expect(richTextContent(props[LEARNING_LOG_PROPS.summary])).toBe("[導入] 80字短縮");
  });
});

describe("buildLearningLogFailNotice", () => {
  it("学習ログ追記失敗の通知本文を生成する", () => {
    expect(buildLearningLogFailNotice("画像試行")).toBe(
      "学習ログの記録に失敗しました(画像試行)。台帳への追記に失敗しています。"
    );
  });
});

describe("parseLearningLogPage", () => {
  it("全プロパティが揃ったページを読み取る", () => {
    const row = parseLearningLogPage(
      page({
        [LEARNING_LOG_PROPS.kind]: { select: { name: "画像試行" } },
        [LEARNING_LOG_PROPS.recordedAt]: { date: { start: NOW_ISO } },
        [LEARNING_LOG_PROPS.articleTitle]: {
          rich_text: [{ plain_text: "記事" }, { plain_text: "タイトル" }],
        },
        [LEARNING_LOG_PROPS.pageId]: { rich_text: [{ plain_text: "idea-1" }] },
        [LEARNING_LOG_PROPS.target]: { rich_text: [{ plain_text: "mascot" }] },
        [LEARNING_LOG_PROPS.result]: { select: { name: "リトライ" } },
        [LEARNING_LOG_PROPS.summary]: { rich_text: [{ plain_text: "1回目失敗" }] },
        [LEARNING_LOG_PROPS.count]: { number: 2 },
      })
    );

    expect(row).toEqual({
      id: "page-1",
      kind: "画像試行",
      recordedAtMs: Date.parse(NOW_ISO),
      articleTitle: "記事タイトル",
      pageId: "idea-1",
      target: "mascot",
      result: "リトライ",
      summary: "1回目失敗",
      count: 2,
    });
  });

  it("空ページは安全側の既定値に寄せる", () => {
    expect(parseLearningLogPage(page({}))).toEqual({
      id: "page-1",
      kind: "その他",
      recordedAtMs: null,
      articleTitle: "",
      pageId: "",
      target: "",
      result: "",
      summary: "",
      count: null,
    });
  });

  it("未知 select と不正日付を安全側に寄せる", () => {
    const row = parseLearningLogPage(
      page({
        [LEARNING_LOG_PROPS.kind]: { select: { name: "未知" } },
        [LEARNING_LOG_PROPS.recordedAt]: { date: { start: "not-a-date" } },
        [LEARNING_LOG_PROPS.result]: { select: { name: "保留" } },
      })
    );
    expect(row.kind).toBe("その他");
    expect(row.recordedAtMs).toBeNull();
    expect(row.result).toBe("");
  });

  it("rich_text 要素に plain_text が無くても空文字として読む", () => {
    const row = parseLearningLogPage(
      page({
        [LEARNING_LOG_PROPS.summary]: { rich_text: [{}, { plain_text: "要約" }] },
      })
    );
    expect(row.summary).toBe("要約");
  });
});

describe("summarizeEditDiff", () => {
  it("HTML をトップレベルブロックのプレーンテキストに変換する", () => {
    expect(htmlToPlainBlocks("<h2>見出し</h2><p>本文</p>")).toEqual([
      { text: "見出し", isHeading: true },
      { text: "本文", isHeading: false },
    ]);
    expect(htmlToPlainBlocks("<p> </p><p>&nbsp;本文&nbsp;</p>")).toEqual([
      { text: "本文", isHeading: false },
    ]);
  });

  it("headline を決定的に判定する", () => {
    expect(summarizeEditDiff("<p>A</p>", "<p>A</p><p>B</p><p>C</p>").headline).toBe("加筆");
    expect(summarizeEditDiff("<p>A</p><p>B</p><p>C</p>", "<p>A</p>").headline).toBe(
      "短縮"
    );
    expect(summarizeEditDiff("<p>A</p><p>B</p><p>C</p>", "<p>A</p><p>D</p><p>C</p>").headline).toBe(
      "言い換え"
    );
    expect(summarizeEditDiff("<p>導入</p><p>本文</p>", "<p>新しい導入</p><p>本文</p>").headline).toBe(
      "導入を修正"
    );
    expect(summarizeEditDiff("<h2>旧見出し</h2><p>本文</p>", "<h2>新見出し</h2><p>本文</p>").headline).toBe(
      "見出しを修正"
    );

    const noChange = summarizeEditDiff("<p>同じ</p>", "<p>同じ</p>");
    expect(noChange.headline).toBe("無変更");
    expect(noChange.noChange).toBe(true);
  });

  it("region を決定的に判定する", () => {
    expect(
      summarizeEditDiff("<h2>旧見出し</h2><p>本文</p>", "<h2>新見出し</h2><p>本文</p>").region
    ).toBe("見出し");
    expect(summarizeEditDiff("<p>導入</p><p>本文</p>", "<p>新導入</p><p>本文</p>").region).toBe(
      "導入"
    );
    expect(
      summarizeEditDiff(
        "<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p><p>Z</p>",
        "<p>A</p><p>V</p><p>W</p><p>X</p><p>Y</p><p>Z</p>"
      ).region
    ).toBe("全体");
    expect(summarizeEditDiff("<p>A</p><p>B</p><p>C</p>", "<p>A</p><p>D</p><p>C</p>").region).toBe(
      "本文"
    );
  });

  it("タグ除去後の文字数と delta を返す", () => {
    const diff = summarizeEditDiff(`<p>${"あ".repeat(100)}</p>`, `<p>${"い".repeat(60)}</p>`);
    expect(diff.beforeChars).toBe(100);
    expect(diff.afterChars).toBe(60);
    expect(diff.delta).toBe(-40);
  });

  it("sample は最初の changed ペアを 200 字で切り、純追加では before を空にする", () => {
    const longBefore = "前".repeat(250);
    const longAfter = "後".repeat(250);
    const changed = summarizeEditDiff(
      `<p>A</p><p>${longBefore}</p><p>Z</p>`,
      `<p>A</p><p>${longAfter}</p><p>Z</p>`
    );
    expect(changed.sample).toEqual({
      before: "前".repeat(200),
      after: "後".repeat(200),
    });

    expect(summarizeEditDiff("<p>A</p>", "<p>A</p><p>追加</p>").sample).toEqual({
      before: "",
      after: "追加",
    });
  });

  it("formatEditDiffSummary は表示文字列を作り 2000 字で切る", () => {
    const noChange: EditDiffSummary = {
      headline: "無変更",
      region: "本文",
      beforeChars: 0,
      afterChars: 0,
      delta: 0,
      sample: { before: "", after: "" },
      noChange: true,
    };
    expect(formatEditDiffSummary(noChange)).toBe("無変更");

    const longSummary = formatEditDiffSummary({
      headline: "加筆",
      region: "本文",
      beforeChars: 1,
      afterChars: 3001,
      delta: 3000,
      sample: { before: "前", after: "後".repeat(3000) },
      noChange: false,
    });
    expect(longSummary).toHaveLength(2000);
    expect(longSummary.startsWith("[本文] 加筆 / 1字→3001字(+3000)")).toBe(true);

    const shortened = formatEditDiffSummary({
      headline: "短縮",
      region: "本文",
      beforeChars: 100,
      afterChars: 60,
      delta: -40,
      sample: { before: "前", after: "後" },
      noChange: false,
    });
    expect(shortened.startsWith("[本文] 短縮 / 100字→60字(-40)")).toBe(true);
  });

  it("空入力と巨大 HTML を安全に扱う", () => {
    expect(summarizeEditDiff("", "")).toEqual({
      headline: "無変更",
      region: "本文",
      beforeChars: 0,
      afterChars: 0,
      delta: 0,
      sample: { before: "", after: "" },
      noChange: true,
    });

    expect(() =>
      formatEditDiffSummary(
        summarizeEditDiff(`<p>${"あ".repeat(30000)}</p>`, `<p>${"い".repeat(30000)}</p>`)
      )
    ).not.toThrow();
  });
});

describe("summarizeLearningLog", () => {
  const nowMs = Date.parse("2026-07-05T00:00:00.000Z");
  const dayMs = 24 * 60 * 60 * 1000;

  function row(overrides: Partial<LearningLogRow>): LearningLogRow {
    return {
      id: "row-1",
      kind: "編集",
      recordedAtMs: nowMs,
      articleTitle: "記事",
      pageId: "page-1",
      target: "",
      result: "",
      summary: "[導入] 導入を修正",
      count: null,
      ...overrides,
    };
  }

  it("直近 windowWeeks 週内だけを対象にし、recordedAtMs=null は除外する", () => {
    const summary = summarizeLearningLog(
      [
        row({ id: "old", recordedAtMs: nowMs - 35 * dayMs }),
        row({ id: "recent", recordedAtMs: nowMs - 21 * dayMs }),
        row({ id: "missing-date", recordedAtMs: null }),
      ],
      nowMs,
      4
    );

    expect(summary.totalRows).toBe(1);
    expect(summary.countByKind).toEqual({
      編集: 1,
      採否: 0,
      画像試行: 0,
      工程失敗: 0,
      その他: 0,
    });
  });

  it("種別別件数は 4 種別とその他を初期化してカウントする", () => {
    const summary = summarizeLearningLog(
      [
        row({ kind: "編集" }),
        row({ kind: "採否" }),
        row({ kind: "画像試行" }),
        row({ kind: "工程失敗" }),
        row({ kind: "その他" }),
      ],
      nowMs,
      4
    );

    expect(summary.countByKind).toEqual({
      編集: 1,
      採否: 1,
      画像試行: 1,
      工程失敗: 1,
      その他: 1,
    });
  });

  it("編集イベントの要約先頭から region を抽出し、抽出不能なら不明に寄せる", () => {
    const summary = summarizeLearningLog(
      [
        row({ kind: "編集", summary: "[導入] 導入を修正" }),
        row({ kind: "編集", summary: "[導入] 短縮" }),
        row({ kind: "編集", summary: "[導入] 加筆" }),
        row({ kind: "編集", summary: "無変更" }),
      ],
      nowMs,
      4
    );

    expect(summary.editRegionHeatmap).toEqual({ 導入: 3, 不明: 1 });
  });

  it("採否イベントは target を aspect として集計し、空なら不明に寄せる", () => {
    const summary = summarizeLearningLog(
      [
        row({ kind: "採否", target: "冗長" }),
        row({ kind: "採否", target: "冗長" }),
        row({ kind: "採否", target: "" }),
      ],
      nowMs,
      4
    );

    expect(summary.adoptAspectHeatmap).toEqual({ 冗長: 2, 不明: 1 });
  });

  it("画像試行は pageId と style ごとの最大回数を降順にし、上位 10 件に丸める", () => {
    const imageRows = Array.from({ length: 11 }, (_, index) =>
      row({
        id: `image-${index}`,
        kind: "画像試行",
        pageId: `page-${index}`,
        target: "diagram",
        count: index + 1,
      })
    );
    const summary = summarizeLearningLog(
      [
        row({ id: "same-1", kind: "画像試行", pageId: "same-page", target: "mascot", count: 1 }),
        row({ id: "same-3", kind: "画像試行", pageId: "same-page", target: "mascot", count: 3 }),
        ...imageRows,
      ],
      nowMs,
      4
    );

    expect(summary.imageRetryTop).toHaveLength(10);
    expect(summary.imageRetryTop[0]).toEqual({
      key: "page-10::diagram",
      style: "diagram",
      pageId: "page-10",
      maxAttempt: 11,
    });
    expect(summary.imageRetryTop.find((item) => item.key === "same-page::mascot")).toEqual({
      key: "same-page::mascot",
      style: "mascot",
      pageId: "same-page",
      maxAttempt: 3,
    });
  });

  it("工程失敗は target を mode として集計し、空なら不明に寄せる", () => {
    const summary = summarizeLearningLog(
      [
        row({ kind: "工程失敗", target: "revise" }),
        row({ kind: "工程失敗", target: "revise" }),
        row({ kind: "工程失敗", target: "revise" }),
        row({ kind: "工程失敗", target: "weekly" }),
        row({ kind: "工程失敗", target: "" }),
      ],
      nowMs,
      4
    );

    expect(summary.failModeFrequency).toEqual({ revise: 3, weekly: 1, 不明: 1 });
  });

  it("0 件でも空サマリを返す", () => {
    expect(summarizeLearningLog([], nowMs, 4)).toEqual({
      windowWeeks: 4,
      totalRows: 0,
      countByKind: {
        編集: 0,
        採否: 0,
        画像試行: 0,
        工程失敗: 0,
        その他: 0,
      },
      editRegionHeatmap: {},
      adoptAspectHeatmap: {},
      imageRetryTop: [],
      failModeFrequency: {},
    });
  });
});

describe("formatAdoptedFixSummary", () => {
  it("観点・指摘・前後の HTML タグ除去テキストを整形する", () => {
    const fix: AdoptedFixDetail = {
      aspect: "読みやすさ",
      detail: "指摘: 冗長 / 提案: 短くする",
      before: "<p>ここは<strong>重要</strong>です。読んでください。</p>",
      after: "<p>ここが肝心です。</p>",
    };
    const summary = formatAdoptedFixSummary(fix);
    expect(summary).toBe(
      "[読みやすさ] 指摘: 冗長 / 提案: 短くする\n変更前: ここは重要です。読んでください。\n変更後: ここが肝心です。"
    );
  });

  it("aspect が空なら「観点なし」を使う", () => {
    const summary = formatAdoptedFixSummary({
      aspect: "",
      detail: "コメント: ここを直す",
      before: "<p>前</p>",
      after: "<p>後</p>",
    });
    expect(summary.startsWith("[観点なし] コメント: ここを直す")).toBe(true);
  });

  it("前後テキストは HTML タグ除去後 200 字で切る", () => {
    const summary = formatAdoptedFixSummary({
      aspect: "文体",
      detail: "短い指摘",
      before: `<p>${"あ".repeat(3000)}</p>`,
      after: `<p>${"う".repeat(3000)}</p>`,
    });
    expect(summary).toContain(`変更前: ${"あ".repeat(200)}\n`);
    expect(summary).not.toContain("あ".repeat(201));
    expect(summary).toContain(`変更後: ${"う".repeat(200)}`);
    expect(summary).not.toContain("う".repeat(201));
  });

  it("全体は 2000 字で切る(長い detail)", () => {
    const summary = formatAdoptedFixSummary({
      aspect: "文体",
      detail: "い".repeat(3000),
      before: "<p>前</p>",
      after: "<p>後</p>",
    });
    expect(summary).toHaveLength(2000);
    expect(summary.startsWith("[文体] いい")).toBe(true);
  });

  it("AdoptedFixDetailSchema は全フィールド string を要求する", () => {
    expect(
      AdoptedFixDetailSchema.safeParse({
        aspect: "x",
        detail: "y",
        before: "z",
        after: "w",
      }).success
    ).toBe(true);
    expect(
      AdoptedFixDetailSchema.safeParse({ aspect: 1, detail: "y", before: "z", after: "w" }).success
    ).toBe(false);
  });
});
