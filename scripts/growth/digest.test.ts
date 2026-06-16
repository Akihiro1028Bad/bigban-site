// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDigestMessage, buildFailureMessage } from "./digest";
import type { DigestInput } from "./digest";

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
    approveUrl: "https://example.com/growth/approve?token=abc",
    ...overrides,
  };
}

describe("buildDigestMessage", () => {
  it("数字を行動文に翻訳し、やること・承認待ち・2つのURLを含む", () => {
    const msg = buildDigestMessage(baseInput());

    expect(msg).toContain("📊 今週のグロース (2026-06-08〜06-14)");
    expect(msg).toContain("サイト訪問 777回 (前週データなし)");
    expect(msg).toContain("検索からの訪問 404回 前週より14%減");
    expect(msg).toContain("検索結果に出た回数 1,492回 前週より4%増");
    expect(msg).toContain("検索順位 4.1位 前週より悪化");
    expect(msg).toContain("■ 今週やること");
    expect(msg).toContain("1. 成果を数える設定を入れる");
    expect(msg).toContain("3. トップに予約ボタン");
    expect(msg).toContain("承認待ち 20件");
    expect(msg).toContain("レポートを見る → https://xxx.notion.site/report");
    expect(msg).toContain("承認する → https://example.com/growth/approve?token=abc");
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
    expect(msg).not.toContain("承認する →");
    expect(msg).toContain("承認待ち 20件");
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
    expect(msg).toContain("📊 今週のグロース");
  });

  it("警告が空配列・未指定なら警告行を出さない", () => {
    const omitted = buildDigestMessage(baseInput());
    expect(omitted.startsWith("📊")).toBe(true);
    const empty = buildDigestMessage(baseInput({ warnings: [] }));
    expect(empty.startsWith("📊")).toBe(true);
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
