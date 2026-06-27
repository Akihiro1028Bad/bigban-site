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

  it("GSC検索成績(search)があればクリック/CTR/順位/CTA/上位クエリを出す(#S2)", () => {
    const m: ArticleMetrics = {
      ...metrics(100, 20, 50),
      keyEvents: { current: 7, prior: 3, deltaPct: 133 },
      search: {
        clicks: { current: 12, prior: 8, deltaPct: 50 },
        impressions: { current: 200, prior: 150, deltaPct: 33.3 },
        ctr: { current: 0.06, prior: 0.05, deltaPct: 20 },
        position: { current: 3.2, prior: 4.1, deltaPct: -22 },
        topQueries: [{ query: "本八幡 ピックルボール", clicks: 6, impressions: 60, ctr: 0.1, position: 2.5 }],
      },
    };
    render(<PerformanceBoard items={[published("a", "検索成績あり", m)]} />);
    expect(screen.getByText(/クリック/)).toBeInTheDocument();
    expect(screen.getByText(/CTR 6%/)).toBeInTheDocument();
    expect(screen.getByText(/順位 3.2位/)).toBeInTheDocument();
    expect(screen.getByText(/CTA/)).toBeInTheDocument();
    expect(screen.getByText(/本八幡 ピックルボール/)).toBeInTheDocument();
  });

  it("search が無い記事は検索成績行を出さない(後方互換)", () => {
    render(<PerformanceBoard items={[published("a", "旧データ", metrics(10, null, 5))]} />);
    expect(screen.queryByText(/クリック/)).not.toBeInTheDocument();
  });

  it("search はあるが keyEvents 無し・topQueries 空なら CTA/クエリは出さない", () => {
    const m: ArticleMetrics = {
      ...metrics(40, null, 20),
      search: {
        clicks: { current: 3, prior: 0, deltaPct: null },
        impressions: { current: 90, prior: 0, deltaPct: null },
        ctr: { current: 0.033, prior: 0, deltaPct: null },
        position: { current: 8, prior: 0, deltaPct: null },
        topQueries: [],
      },
    };
    render(<PerformanceBoard items={[published("a", "検索のみ記事", m)]} />);
    expect(screen.getByText(/クリック/)).toBeInTheDocument();
    expect(screen.queryByText(/CTA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/「/)).not.toBeInTheDocument();
  });

  it("判定ラベル(#S3)を表示する: 伸びている/CTR弱い", () => {
    // publishedAt 付き(daysSincePublished 経路を通す)。views=100 なので要改稿は付かない。
    const grow: ArticleMetrics = { ...metrics(100, 20, 50), publishedAt: "2026-06-20T00:00:00Z" };
    const weak: ArticleMetrics = {
      ...metrics(100, 0, 60), // keyEvents>0(下記)・views横ばい
      keyEvents: { current: 4, prior: 4, deltaPct: 0 },
      search: {
        clicks: { current: 2, prior: 2, deltaPct: 0 },
        impressions: { current: 300, prior: 0, deltaPct: null }, // imp>=100
        ctr: { current: 0.006, prior: 0, deltaPct: null }, // ctr<0.03 → CTR弱い
        position: { current: 2, prior: 0, deltaPct: null }, // 5未満 → 順位ラベルは付かない
        topQueries: [],
      },
    };
    render(<PerformanceBoard items={[published("a", "伸び記事", grow), published("b", "弱記事", weak)]} />);
    expect(screen.getByText("伸びている")).toBeInTheDocument();
    expect(screen.getByText("CTR弱い")).toBeInTheDocument();
  });

  it("ラベルが無い記事(公開日不明・低調横ばい)はラベル行を出さない", () => {
    render(<PerformanceBoard items={[published("a", "ラベル無し", metrics(10, 0, 5))]} />);
    expect(screen.queryByText("伸びている")).not.toBeInTheDocument();
  });
});
