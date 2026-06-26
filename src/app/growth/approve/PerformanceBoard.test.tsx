import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PendingItem } from "@/lib/growth/approve";
import type { ArticleMetrics } from "@/lib/growth/metrics";

import { PerformanceBoard } from "./PerformanceBoard";

function metrics(views: number, viewsDelta: number | null, users: number): ArticleMetrics {
  return {
    pagePath: "/news/x",
    views: { current: views, prior: 0, deltaPct: viewsDelta },
    users: { current: users, prior: 0, deltaPct: null },
    period: { start: "2026-06-15", end: "2026-06-21" },
  };
}

function published(id: string, title: string, m?: ArticleMetrics): PendingItem {
  return {
    id,
    kind: "idea",
    title,
    subtitle: "",
    details: [],
    score: 0,
    stage: "published",
    metrics: m,
  };
}

describe("PerformanceBoard", () => {
  it("計測データが無ければ空メッセージを出す", () => {
    render(<PerformanceBoard items={[published("a", "未計測")]} />);
    expect(screen.getByText(/まだ計測データがありません/)).toBeInTheDocument();
  });

  it("計測済み記事を表示数の多い順に並べ、合計と前週比を出す", () => {
    const items = [
      published("a", "記事A", metrics(100, 20, 50)),
      published("b", "記事B", metrics(300, -10, 80)),
      published("c", "未計測"),
    ];
    render(<PerformanceBoard items={items} />);

    // 合計(表示 400, ユーザー 130)
    expect(screen.getByText("400")).toBeInTheDocument();
    expect(screen.getByText("130")).toBeInTheDocument();

    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    // 表示数の多い B が先頭。
    expect(rows[0]).toHaveTextContent("記事B");
    expect(rows[1]).toHaveTextContent("記事A");
    expect(rows).toHaveLength(2); // 未計測は出さない

    // 前週比のトーン違い(上昇/下降)が両方描画される。
    expect(screen.getByText("+20%")).toBeInTheDocument();
    expect(screen.getByText("-10%")).toBeInTheDocument();
  });

  it("横ばい(±0%)・未計測(—)の前週比も描画できる", () => {
    const items = [
      published("a", "横ばい", metrics(10, 0, 5)),
      published("b", "差分なし", metrics(20, null, 5)),
    ];
    render(<PerformanceBoard items={items} />);
    expect(screen.getByText("±0%")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
