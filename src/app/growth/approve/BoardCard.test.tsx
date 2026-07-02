/**
 * BoardCard の再スキン(#proto P2 T4)テスト。
 * 操作系(承認/却下/取消/編集/詳細/再試行/一括選択)の click→ハンドラ・disabled 条件は不変で維持。
 * 見た目系(EyecatchThumb/StageChip/ScoreBar/AwaitingDot/抜粋・生成中 approve-pulse)を新構造で検証。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BoardCard } from "./BoardCard";
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
    onUndo: vi.fn(),
    onEdit: vi.fn(),
    onToggleSelect: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
  };
  const merged = makeItem(item);
  render(
    <ul>
      <BoardCard
        item={merged}
        choice={undefined}
        isBusy={false}
        lockedForRevise={false}
        failure={undefined}
        isFocused={false}
        bulkSelectable={false}
        selected={false}
        isIdea
        step={0}
        scoreBarWidth={50}
        stageAccentClass=""
        stuck={false}
        rowClassName="row"
        kindLabel="記事ネタ"
        generatingStepsText="取材 → 構成 → 推敲"
        awaitingDownstream={false}
        {...handlers}
        {...props}
      />
    </ul>,
  );
  return { ...handlers, item: merged };
}

describe("BoardCard アイキャッチ(#proto P2 結線修正)", () => {
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

describe("BoardCard 操作ロジック(不変)", () => {
  it("未決定カードは承認/却下ボタンを出し click でハンドラを呼ぶ", async () => {
    const { onApprove, onReject } = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "承認: テスト記事" }));
    await userEvent.click(screen.getByRole("button", { name: "却下: テスト記事" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("isBusy で承認/却下が disabled になる", () => {
    renderCard({ props: { isBusy: true } });
    expect(screen.getByRole("button", { name: "承認: テスト記事" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "却下: テスト記事" })).toBeDisabled();
  });

  it("lockedForRevise で承認/却下が disabled になる", () => {
    renderCard({ props: { lockedForRevise: true } });
    expect(screen.getByRole("button", { name: "承認: テスト記事" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "却下: テスト記事" })).toBeDisabled();
  });

  it("詳細ボタンで onOpen を呼ぶ", async () => {
    const { onOpen } = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "詳細: テスト記事" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("タイトルボタン(アクセシブル名=タイトル)クリックで onOpen を呼ぶ", async () => {
    const { onOpen } = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "テスト記事" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("タイトルは2行クランプ(truncate しない)", () => {
    renderCard();
    const title = screen.getByRole("button", { name: "テスト記事" });
    expect(title).toHaveClass("line-clamp-2");
    expect(title).not.toHaveClass("truncate");
  });

  it("未決定カードは種別バッジ(kindLabel)を出す", () => {
    renderCard({ props: { kindLabel: "📋 施策" } });
    expect(screen.getByText("📋 施策")).toBeInTheDocument();
  });

  it("決定済み(承認)は完了表示と取り消し導線を出し onUndo を呼ぶ", async () => {
    const { onUndo } = renderCard({ props: { choice: "承認" } });
    expect(screen.getByText("承認しました")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "承認: テスト記事" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "取り消す: テスト記事" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("決定済み(却下)は却下しました表示", () => {
    renderCard({ props: { choice: "却下" } });
    expect(screen.getByText("却下しました")).toBeInTheDocument();
  });

  it("取り消しは isBusy で disabled", () => {
    renderCard({ props: { choice: "承認", isBusy: true } });
    expect(screen.getByRole("button", { name: "取り消す: テスト記事" })).toBeDisabled();
  });

  it("下書き完了は編集ボタンを出し onEdit を呼ぶ(承認/却下は出さない)", async () => {
    const { onEdit } = renderCard({ item: { isDraftReady: true } });
    expect(screen.queryByRole("button", { name: "承認: テスト記事" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "編集: テスト記事" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("一括選択可能なときチェックボックスで onToggleSelect を呼ぶ", async () => {
    const { onToggleSelect } = renderCard({ props: { bulkSelectable: true } });
    await userEvent.click(screen.getByRole("checkbox", { name: "一括選択: テスト記事" }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it("selected はチェック状態を反映する", () => {
    renderCard({ props: { bulkSelectable: true, selected: true } });
    expect(screen.getByRole("checkbox", { name: "一括選択: テスト記事" })).toBeChecked();
  });

  it("失敗時は赤アラートと再試行を出し retry を呼ぶ", async () => {
    const retry = vi.fn();
    renderCard({ props: { failure: { message: "保存に失敗しました", retry } } });
    expect(screen.getByRole("alert")).toHaveTextContent("保存に失敗しました");
    await userEvent.click(screen.getByRole("button", { name: "再試行: テスト記事" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("再試行は isBusy で disabled", () => {
    renderCard({ props: { isBusy: true, failure: { message: "x", retry: vi.fn() } } });
    expect(screen.getByRole("button", { name: "再試行: テスト記事" })).toBeDisabled();
  });
});

describe("BoardCard 下流待ち表示(#107)", () => {
  it("承認済み施策は『承認済み』表示で承認/却下を出さない", () => {
    renderCard({
      item: { kind: "proposal", stage: "approved", title: "承認済み施策" },
      props: { awaitingDownstream: true },
    });
    expect(screen.getByText("承認済み")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "承認: 承認済み施策" })).not.toBeInTheDocument();
  });

  it("生成待ち記事は『生成待ち』表示", () => {
    renderCard({ item: { stage: "queued" }, props: { awaitingDownstream: true } });
    expect(screen.getByText("生成待ち")).toBeInTheDocument();
  });

  it("生成中記事は『生成中』バッジ＋執筆中ステップ＋approve-pulse", () => {
    renderCard({ item: { stage: "generating" }, props: { awaitingDownstream: true } });
    // 状態バッジと StageChip ラベルの双方に「生成中」が出る(=状態表示が濃い)。
    expect(screen.getAllByText("生成中").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("🖊 自宅PCで執筆中…")).toBeInTheDocument();
    expect(screen.getByText(/取材 → 構成 → 推敲/)).toBeInTheDocument();
    // 生成中は approve-pulse を持つ(motion-safe:animate-pulse は廃止)。
    expect(document.querySelectorAll(".approve-pulse").length).toBeGreaterThan(0);
    expect(document.querySelector(".motion-safe\\:animate-pulse")).toBeNull();
  });

  it("stuck のとき滞留警告を出す", () => {
    renderCard({
      item: { stage: "generating" },
      props: { awaitingDownstream: true, stuck: true },
    });
    expect(screen.getByRole("status")).toHaveTextContent("時間がかかっています");
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

  it("未決定 li の data-decision は空", () => {
    renderCard();
    expect(document.querySelector("li")?.getAttribute("data-decision")).toBe("");
  });
});
