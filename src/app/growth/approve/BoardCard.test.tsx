/**
 * BoardCard の proto 対話モデル(#213/#211)テスト。
 * 行は「開く / 選ぶ」だけ。決定操作(承認/却下/取消/編集/詳細)と失敗アラートは撤去済み。
 * 見た目系(EyecatchThumb/StageChip/ScoreBar/AwaitingDot/抜粋)・情報チップ(✓承認/生成中/生成待ち)・
 * 滞留/修正中バッジ・控えめチェックの選択トグルを検証する。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BoardCard } from "./BoardCard";
import { rowClass } from "./boardItemHelpers";
import type { PendingItem } from "./types";

function makeItem(over: Partial<PendingItem> = {}): PendingItem {
  return {
    id: "i1",
    kind: "idea",
    title: "テスト記事",
    subtitle: "サブタイトル説明",
    details: [],
    score: 42,
    stage: "proposed",
    ...over,
  };
}

interface Overrides {
  item?: Partial<PendingItem>;
  props?: Partial<Parameters<typeof BoardCard>[0]>;
}

function renderCard({ item, props }: Overrides = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onToggleSelect: vi.fn(),
  };
  const merged = makeItem(item);
  render(
    <ul>
      <BoardCard
        item={merged}
        choice={undefined}
        isFocused={false}
        bulkSelectable={false}
        selected={false}
        stuck={false}
        rowClassName="row"
        awaitingDownstream={false}
        {...handlers}
        {...props}
      />
    </ul>,
  );
  return { ...handlers, item: merged };
}

describe("BoardCard アイキャッチ", () => {
  it("eyecatchUrl があれば実画像を表示する(グラデーションにフォールバックしない)", () => {
    renderCard({ item: { contentId: "c1", eyecatchUrl: "https://example.com/eye.png" } });
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("eye.png");
  });
  it("eyecatchUrl が無ければ実画像は出さない(グラデーション/プレースホルダ)", () => {
    renderCard({ item: { contentId: "c1" } });
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("BoardCard 開く/選ぶ(proto 対話モデル)", () => {
  it("タイトルクリックで onOpen を呼ぶ", async () => {
    const { onOpen } = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "テスト記事" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("タイトルは truncate(1行)で開く起点になる", () => {
    renderCard();
    const title = screen.getByRole("button", { name: "テスト記事" });
    expect(title).toHaveClass("truncate");
    expect(title.id).toBe("open-i1");
  });

  it("bulkSelectable のとき控えめチェックで onToggleSelect を呼ぶ", async () => {
    const { onToggleSelect } = renderCard({ props: { bulkSelectable: true } });
    await userEvent.click(screen.getByRole("checkbox", { name: "一括選択: テスト記事" }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it("控えめチェックは Enter/Space でも onToggleSelect を呼ぶ", async () => {
    const { onToggleSelect } = renderCard({ props: { bulkSelectable: true } });
    const check = screen.getByRole("checkbox", { name: "一括選択: テスト記事" });
    check.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onToggleSelect).toHaveBeenCalledTimes(2);
  });

  it("selected は aria-checked と accent 塗り(IconCheck)を反映する", () => {
    renderCard({ props: { bulkSelectable: true, selected: true } });
    const check = screen.getByRole("checkbox", { name: "一括選択: テスト記事" });
    expect(check).toHaveAttribute("aria-checked", "true");
    expect(check).toHaveClass("opacity-100");
    expect(check).toHaveStyle({ backgroundColor: "var(--p-accent)" });
    expect(check.querySelector("svg")).not.toBeNull();
  });

  it("bulkSelectable でないときチェックを描画しない", () => {
    renderCard({ props: { bulkSelectable: false } });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("決定操作ボタン(承認/却下/編集/取消/詳細)を一切描画しない", () => {
    renderCard({ props: { choice: undefined } });
    expect(screen.queryByRole("button", { name: "承認: テスト記事" })).toBeNull();
    expect(screen.queryByRole("button", { name: "却下: テスト記事" })).toBeNull();
    expect(screen.queryByRole("button", { name: "詳細: テスト記事" })).toBeNull();
    expect(screen.queryByRole("button", { name: "編集: テスト記事" })).toBeNull();
    expect(screen.queryByRole("button", { name: "取り消す: テスト記事" })).toBeNull();
  });

  it("下書き完了でも編集ボタンは出さない(編集は詳細ヘッダ)", () => {
    renderCard({ item: { isDraftReady: true } });
    expect(screen.queryByRole("button", { name: "編集: テスト記事" })).toBeNull();
  });

  it("失敗アラート(alert/再試行)を描画しない", () => {
    renderCard();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "再試行: テスト記事" })).toBeNull();
  });
});

describe("BoardCard 状態チップ(情報のみ・非操作)", () => {
  it("決定済み(承認)は ✓承認 チップを出し取り消しボタンは出さない", () => {
    renderCard({ props: { choice: "承認" } });
    expect(screen.getByText("✓承認")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取り消す: テスト記事" })).toBeNull();
  });

  it("決定済み(却下)は ✓却下 チップを出す", () => {
    renderCard({ props: { choice: "却下" } });
    expect(screen.getByText("✓却下")).toBeInTheDocument();
  });

  it("生成中は『生成中』チップ(approve-pulse)を出す", () => {
    renderCard({ item: { stage: "generating" }, props: { awaitingDownstream: true } });
    // 状態チップと StageChip ラベルの双方に「生成中」が出る。
    expect(screen.getAllByText("生成中").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll(".approve-pulse").length).toBeGreaterThan(0);
  });

  it("生成待ちは『生成待ち』チップを出す", () => {
    renderCard({ item: { stage: "queued" }, props: { awaitingDownstream: true } });
    expect(screen.getByText("生成待ち")).toBeInTheDocument();
  });

  it("承認済み施策は『承認済み』チップを出す", () => {
    renderCard({
      item: { kind: "proposal", stage: "approved", title: "承認済み施策" },
      props: { awaitingDownstream: true },
    });
    expect(screen.getByText("承認済み")).toBeInTheDocument();
  });

  it("冗長な執筆中テキスト・滞留警告パラグラフは撤去済み", () => {
    renderCard({
      item: { stage: "generating" },
      props: { awaitingDownstream: true, stuck: true },
    });
    expect(screen.queryByText("🖊 自宅PCで執筆中…")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("BoardCard バッジ(滞留 / 修正中)", () => {
  it("stuck のとき滞留バッジ(amber)を出す", () => {
    renderCard({ item: { stage: "generating" }, props: { awaitingDownstream: true, stuck: true } });
    expect(screen.getByText("滞留")).toBeInTheDocument();
  });

  it("stuck でないとき滞留バッジは出さない", () => {
    renderCard({ item: { stage: "generating" }, props: { awaitingDownstream: true, stuck: false } });
    expect(screen.queryByText("滞留")).toBeNull();
  });

  it("reviseStatus が busy のとき修正中バッジ(purple)を出す", () => {
    renderCard({ item: { reviseStatus: "依頼中" } });
    expect(screen.getByText("修正中")).toBeInTheDocument();
  });

  it("reviseStatus が無ければ修正中バッジは出さない", () => {
    renderCard({ item: { reviseStatus: undefined } });
    expect(screen.queryByText("修正中")).toBeNull();
  });
});

describe("BoardCard 見た目(proto プリミティブ)", () => {
  it("ステージチップ(deriveBoardStage ラベル)を出す", () => {
    renderCard({ item: { kind: "idea", stage: "proposed" } });
    // proposed(idea) → outline_review → 「構成案レビュー」
    expect(screen.getByText("構成案レビュー")).toBeInTheDocument();
  });

  it("proposal は『ネタ案』ステージチップ", () => {
    renderCard({ item: { kind: "proposal", stage: "untouched", title: "施策A" } });
    expect(screen.getByText("ネタ案")).toBeInTheDocument();
  });

  it("subtitle 抜粋を出す", () => {
    renderCard({ item: { subtitle: "夏の集客テーマ" } });
    expect(screen.getByText("夏の集客テーマ")).toBeInTheDocument();
  });

  it("subtitle/details 無しは抜粋段落を出さない", () => {
    renderCard({ item: { subtitle: "", details: [] } });
    expect(document.body.querySelector("p.truncate")).toBeNull();
  });

  it("score があれば ScoreBar(数値)を出す", () => {
    renderCard({ item: { score: 77 } });
    expect(screen.getByText("77")).toBeInTheDocument();
  });

  it("score 無しは ScoreBar を出さない", () => {
    renderCard({ item: { score: undefined } });
    expect(screen.getByText("構成案レビュー")).toBeInTheDocument();
    expect(screen.queryByTitle(/優先度スコア/)).toBeNull();
  });

  it("actionable(未決定・未下書き・下流待ちでない)なとき AwaitingDot を出す", () => {
    renderCard();
    expect(screen.getByTitle("あなたのアクション待ち")).toBeInTheDocument();
  });

  it("決定済みは AwaitingDot を出さない", () => {
    renderCard({ props: { choice: "承認" } });
    expect(screen.queryByTitle("あなたのアクション待ち")).toBeNull();
  });

  it("下流待ちは AwaitingDot を出さない", () => {
    renderCard({ item: { stage: "queued" }, props: { awaitingDownstream: true } });
    expect(screen.queryByTitle("あなたのアクション待ち")).toBeNull();
  });

  it("contentId ありは EyecatchThumb 画像プレースホルダにならない(has=true)", () => {
    renderCard({ item: { contentId: "g-1" } });
    expect(screen.queryByText("無")).toBeNull();
  });

  it("contentId 無しは EyecatchThumb プレースホルダ(無)を出す", () => {
    renderCard({ item: { contentId: undefined } });
    expect(screen.getByText("無")).toBeInTheDocument();
  });

  it("isFocused でフォーカスリングを付与する", () => {
    renderCard({ props: { isFocused: true } });
    const li = document.querySelector("li");
    expect(li?.className).toContain("ring-2");
  });

  it("rowClassName / data-decision を反映する", () => {
    renderCard({ props: { choice: "承認", rowClassName: "my-row" } });
    const li = document.querySelector("li");
    expect(li?.className).toContain("my-row");
    expect(li?.getAttribute("data-decision")).toBe("承認");
  });

  it("Root は proto のフラット横並びで、箱・段階アクセント境界を持たない", () => {
    renderCard({ props: { rowClassName: rowClass() } });
    const li = document.querySelector("li");
    const cls = li?.className ?? "";
    // フラット横並び(外側 li と同じ骨格)
    expect(cls).toContain("flex");
    expect(cls).toContain("items-start");
    expect(cls).toContain("gap-3");
    // 箱・段階アクセント境界は撤去済み
    expect(cls).not.toContain("border");
    expect(cls).not.toContain("rounded-lg");
    expect(cls).not.toContain("bg-[var(--p-bg-raised)]");
    expect(cls).not.toContain("border-l-4");
  });

  it("未決定 li の data-decision は空", () => {
    renderCard();
    expect(document.querySelector("li")?.getAttribute("data-decision")).toBe("");
  });
});
