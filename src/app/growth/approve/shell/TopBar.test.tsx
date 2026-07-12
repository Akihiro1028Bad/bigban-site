import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TopBar } from "./TopBar";

function setup(over: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const onSegmentChange = vi.fn();
  const onQueryChange = vi.fn();
  const onRefresh = vi.fn();
  const onOpenProposal = vi.fn();
  const onToggleDensity = vi.fn();
  render(
    <TopBar
      segment="all"
      segments={[
        { key: "all", label: "すべて", count: 3 },
        { key: "awaiting", label: "あなた待ち", count: 1 },
      ]}
      query=""
      awaitingCount={1}
      publishedTotal={2}
      onSegmentChange={onSegmentChange}
      onQueryChange={onQueryChange}
      searchRef={createRef<HTMLInputElement>()}
      syncLabel="3分前"
      syncStale
      syncing={false}
      onRefresh={onRefresh}
      onOpenProposal={onOpenProposal}
      density="comfortable"
      onToggleDensity={onToggleDensity}
      showSegments
      showSearch
      {...over}
    />,
  );
  return { onSegmentChange, onQueryChange, onRefresh, onOpenProposal, onToggleDensity };
}

describe("TopBar", () => {
  it("段階フィルタは group + aria-pressed で絞り込みを表し、クリックで onSegmentChange", async () => {
    const { onSegmentChange } = setup();
    const group = screen.getByRole("group", { name: "段階フィルタ" });
    // 既定は「すべて」が押下状態。
    expect(within(group).getByRole("button", { name: /すべて/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(group).getByRole("button", { name: /あなた待ち/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(within(group).getByRole("button", { name: /あなた待ち/ }));
    expect(onSegmentChange).toHaveBeenCalledWith("awaiting");
  });

  it("検索入力で onQueryChange を呼ぶ", async () => {
    const { onQueryChange } = setup();
    await userEvent.type(screen.getByPlaceholderText("記事を検索…"), "x");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("検索入力はplaceholderに依存しないaccessible nameを持つ", () => {
    setup({ searchPlaceholder: "資料を検索…" });
    expect(screen.getByRole("textbox", { name: "検索" })).toHaveAttribute(
      "placeholder",
      "資料を検索…",
    );
  });

  it("検索 placeholder を view に応じて差し替えられる", () => {
    setup({ searchPlaceholder: "資料を検索…" });
    expect(screen.getByPlaceholderText("資料を検索…")).toBeInTheDocument();
  });

  it("不要な画面では段階フィルタと検索を隠せる", () => {
    setup({ showSegments: false, showSearch: false });
    expect(screen.queryByRole("group", { name: "段階フィルタ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "検索" })).not.toBeInTheDocument();
  });

  it("表示フラグ未指定時は段階フィルタと検索を表示する", () => {
    setup({ showSegments: undefined, showSearch: undefined });
    expect(screen.getByRole("group", { name: "段階フィルタ" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "検索" })).toBeInTheDocument();
  });

  it("統計ピル(あなた待ち/公開済み)を表示する", () => {
    setup();
    expect(screen.getByTitle("あなたのアクション待ち")).toHaveTextContent("1");
    expect(screen.getByTitle("公開済みの記事数")).toHaveTextContent("2");
  });

  it("施策追加ボタンで onOpenProposal", async () => {
    const { onOpenProposal } = setup();
    await userEvent.click(screen.getByRole("button", { name: /施策/ }));
    expect(onOpenProposal).toHaveBeenCalled();
  });

  it("更新ボタンで onRefresh・syncing 中は disabled で更新中表示", async () => {
    const { onRefresh } = setup();
    await userEvent.click(screen.getByRole("button", { name: /データを更新/ }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("syncing 中は更新ボタンが disabled", () => {
    setup({ syncing: true });
    expect(screen.getByRole("button", { name: /データを更新/ })).toBeDisabled();
  });

  it("syncStale が false のとき更新ボタンは通常配色・syncLabel をそのまま表示", () => {
    setup({ syncStale: false });
    const button = screen.getByRole("button", { name: /データを更新/ });
    expect(button).toHaveTextContent("3分前");
    // 通常配色: input 背景・text-3 文字色（警告色を使わない）。
    expect(button).toHaveStyle({
      background: "var(--p-bg-input)",
      color: "var(--p-text-3)",
    });
    // border は CSS 変数を含む shorthand で jsdom が解決しないため、
    // インライン style 文字列で通常 border を直接確認する。
    expect(button.getAttribute("style")).toContain("1px solid var(--p-border)");
  });

  it("syncStale が true のとき更新ボタンは警告配色（amber）で強調する", () => {
    setup({ syncStale: true });
    const button = screen.getByRole("button", { name: /データを更新/ });
    // 警告配色: amber-weak 背景・amber 文字色。
    expect(button).toHaveStyle({
      background: "var(--p-amber-weak)",
      color: "var(--p-amber)",
    });
    // border は amber 半透明で強調する（shorthand なので style 文字列で確認）。
    // DOM は rgba を正規化(値間に空白)するため、正規化後の表記で照合する。
    expect(button.getAttribute("style")).toContain("1px solid rgba(249, 185, 78, 0.3)");
  });

  it("syncLabel が null のとき更新ボタンは — を表示", () => {
    setup({ syncLabel: null });
    expect(screen.getByRole("button", { name: /データを更新/ })).toHaveTextContent("—");
  });

  it("密度トグルを表示し、comfortable のとき aria-pressed=false", () => {
    setup();
    expect(screen.getByRole("button", { name: "表示密度を切り替え" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("density=compact のとき密度トグルは aria-pressed=true", () => {
    setup({ density: "compact" });
    expect(screen.getByRole("button", { name: "表示密度を切り替え" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("密度トグルのクリックで onToggleDensity を呼ぶ", async () => {
    const { onToggleDensity } = setup();
    await userEvent.click(screen.getByRole("button", { name: "表示密度を切り替え" }));
    expect(onToggleDensity).toHaveBeenCalledTimes(1);
  });
});
