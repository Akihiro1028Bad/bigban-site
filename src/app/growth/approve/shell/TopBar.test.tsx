import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TopBar } from "./TopBar";

function setup(over: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const onSegmentChange = vi.fn();
  const onQueryChange = vi.fn();
  const onRefresh = vi.fn();
  const onOpenProposal = vi.fn();
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
      {...over}
    />,
  );
  return { onSegmentChange, onQueryChange, onRefresh, onOpenProposal };
}

describe("TopBar", () => {
  it("段階セグメントを tablist/tab で出し、クリックで onSegmentChange", async () => {
    const { onSegmentChange } = setup();
    expect(screen.getByRole("tablist", { name: "段階フィルタ" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /あなた待ち/ }));
    expect(onSegmentChange).toHaveBeenCalledWith("awaiting");
  });

  it("検索入力で onQueryChange を呼ぶ", async () => {
    const { onQueryChange } = setup();
    await userEvent.type(screen.getByPlaceholderText("記事を検索…"), "x");
    expect(onQueryChange).toHaveBeenCalled();
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
    expect(screen.getByRole("button", { name: /データを更新/ })).toHaveTextContent("3分前");
  });

  it("syncLabel が null のとき更新ボタンは — を表示", () => {
    setup({ syncLabel: null });
    expect(screen.getByRole("button", { name: /データを更新/ })).toHaveTextContent("—");
  });
});
