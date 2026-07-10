import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProposalDetailBody } from "./ProposalDetailBody";
import type { PendingItem } from "./types";

function proposal(over: Partial<PendingItem> = {}): PendingItem {
  return {
    id: "p1",
    kind: "proposal",
    title: "市川ページ改善",
    subtitle: "サイト表示内容",
    details: [
      { label: "根拠", value: "市川関連の流入が増えている" },
      { label: "想定アクション", value: "ヒーロー文言をBefore/Afterで差し替える" },
      { label: "優先度スコア", value: "8.5" },
      { label: "確度", value: "高" },
      { label: "インパクト", value: "大" },
    ],
    score: 8.5,
    stage: "untouched",
    proposalHypothesis: {
      hypothesis: "市川向けの訴求を強めると予約導線の迷いが減る",
      successMetric: "予約クリックが月10件増える",
      reviewAtMs: Date.parse("2026-08-01T00:00:00.000Z"),
    },
    ...over,
  };
}

describe("ProposalDetailBody", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("施策の判断材料・狙い・承認後の流れ・次にやることを表示する", () => {
    render(<ProposalDetailBody item={proposal()} kind="site" />);

    expect(screen.getByRole("heading", { name: "判断材料" })).toBeInTheDocument();
    expect(screen.getByText("市川関連の流入が増えている")).toBeInTheDocument();
    expect(screen.getByText("ヒーロー文言をBefore/Afterで差し替える")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "狙いと検証" })).toBeInTheDocument();
    expect(screen.getByText("市川向けの訴求を強めると予約導線の迷いが減る")).toBeInTheDocument();
    expect(screen.getByText("予約クリックが月10件増える")).toBeInTheDocument();
    expect(screen.getByText("2026/08/01")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "承認後の流れ" })).toBeInTheDocument();
    expect(screen.getByText("実装タスク")).toBeInTheDocument();
    expect(screen.getByText("Notion本文の成果物")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "次にやること" })).toBeInTheDocument();
    expect(screen.getByText(/Before\/After 文言を確認/)).toBeInTheDocument();
  });

  it("MEO は GBP 反映の次アクションを表示する", () => {
    render(<ProposalDetailBody item={proposal({ subtitle: "MEO" })} kind="other" />);

    expect(screen.getByText(/GBP投稿文案/)).toBeInTheDocument();
  });

  it("システム改善は改善タスク化と diff/要件案確認の次アクションを表示する", () => {
    render(<ProposalDetailBody item={proposal({ subtitle: "システム改善" })} kind="system" />);

    expect(screen.getByText("改善タスク")).toBeInTheDocument();
    expect(screen.getByText(/diff案・要件案/)).toBeInTheDocument();
  });

  it("成果物化済み施策は成果物リンクと承認日時を表示する", () => {
    render(
      <ProposalDetailBody
        item={proposal({
          stage: "completed",
          artifactUrl: "https://notion.so/artifact",
          approvedAtMs: Date.parse("2026-07-08T10:00:00.000Z"),
        })}
        kind="site"
      />
    );

    expect(screen.getByRole("heading", { name: "成果物" })).toBeInTheDocument();
    expect(screen.getByText("成果物化済み")).toBeInTheDocument();
    expect(screen.getByText("2026/07/08")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notionで成果物を開く" })).toHaveAttribute(
      "href",
      "https://notion.so/artifact"
    );
  });

  it("成果物化済み施策は Notion 本文の成果物を画面内に表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            blocks: [
              { id: "b1", type: "heading_2", text: "実装ステップ" },
              { id: "b2", type: "paragraph", text: "ホームに沿線アクセスを追記する。" },
              { id: "b3", type: "bulleted_list_item", text: "Before/After 文言を確認する。" },
            ],
          }),
      })
    );

    render(
      <ProposalDetailBody
        item={proposal({
          stage: "completed",
          artifactUrl: "https://notion.so/artifact",
        })}
        kind="site"
        token="secret"
      />
    );

    expect(await screen.findByText("実装ステップ")).toBeInTheDocument();
    expect(screen.getByText("ホームに沿線アクセスを追記する。")).toBeInTheDocument();
    expect(screen.getByText("Before/After 文言を確認する。")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/growth/proposal-artifact?pageId=p1",
      expect.objectContaining({ headers: { Authorization: "Bearer secret" } })
    );
  });

  it("記事カテゴリの成果物化済み施策でも成果物欄を表示する", () => {
    render(
      <ProposalDetailBody
        item={proposal({
          subtitle: "コンテンツ",
          stage: "completed",
          artifactUrl: "https://notion.so/article-artifact",
        })}
        kind="article"
      />
    );

    expect(screen.getByRole("heading", { name: "成果物" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notionで成果物を開く" })).toHaveAttribute(
      "href",
      "https://notion.so/article-artifact"
    );
  });

  it("記事カテゴリの施策でも次にやることを表示する", () => {
    render(<ProposalDetailBody item={proposal({ subtitle: "コンテンツ" })} kind="article" />);

    expect(screen.getByRole("heading", { name: "次にやること" })).toBeInTheDocument();
    expect(screen.getByText(/記事化後の下書きを確認/)).toBeInTheDocument();
  });

  it("空の optional 情報は表示しない", () => {
    render(
      <ProposalDetailBody
        item={proposal({ details: [], proposalHypothesis: undefined, subtitle: "" })}
        kind="article"
      />
    );

    expect(screen.queryByRole("heading", { name: "判断材料" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "狙いと検証" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "承認後の流れ" })).toBeInTheDocument();
  });
});
