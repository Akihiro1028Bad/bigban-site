import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  buildLearningLogProps,
  buildLearningLogTitle,
  LEARNING_LOG_PROPS,
  parseLearningLogPage,
  type LearningEvent,
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
});
