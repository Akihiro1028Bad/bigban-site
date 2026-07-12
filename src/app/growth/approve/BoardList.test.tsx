import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BoardList } from "./BoardList";
import type { BoardGroup } from "./boardGroups";
import type { PendingItem } from "./types";

function pi(
  over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">,
): PendingItem {
  return { title: over.id, subtitle: "", ...over } as PendingItem;
}

const groups: BoardGroup[] = [
  { stage: "generating", label: "生成中", items: [pi({ id: "g1", kind: "idea", stage: "generating" })] },
  { stage: "published", label: "公開済み", items: [pi({ id: "p1", kind: "idea", stage: "published" })] },
];

function setup(over: Partial<Parameters<typeof BoardList>[0]> = {}) {
  const onActivate = vi.fn();
  render(
    <BoardList
      groups={groups}
      activeId={null}
      decided={{}}
      onActivate={onActivate}
      renderRow={(item) => <span>{item.id}行</span>}
      {...over}
    />,
  );
  return { onActivate };
}

describe("BoardList", () => {
  it("段階セクションをラベル＋件数で出す", () => {
    setup();
    expect(screen.getByText("生成中")).toBeInTheDocument();
    expect(screen.getByText("公開済み")).toBeInTheDocument();
  });

  it("各セクションに件数を表示する", () => {
    setup();
    const counts = screen.getAllByText("1");
    expect(counts).toHaveLength(2);
  });

  it("renderRow で行本体を描画する", () => {
    setup();
    expect(screen.getByText("g1行")).toBeInTheDocument();
    expect(screen.getByText("p1行")).toBeInTheDocument();
  });

  it("renderRow に isActive を渡す(active 行は true)", () => {
    render(
      <BoardList
        groups={groups}
        activeId="p1"
        decided={{}}
        onActivate={vi.fn()}
        renderRow={(item, isActive) => (
          <span>
            {item.id}:{isActive ? "on" : "off"}
          </span>
        )}
      />,
    );
    expect(screen.getByText("g1:off")).toBeInTheDocument();
    expect(screen.getByText("p1:on")).toBeInTheDocument();
  });

  it("行クリックで onActivate(id)", async () => {
    const { onActivate } = setup();
    await userEvent.click(screen.getByText("g1行"));
    expect(onActivate).toHaveBeenCalledWith("g1");
  });

  it("activeId の行に aria-current が付く", () => {
    setup({ activeId: "p1" });
    const active = screen.getByText("p1行").closest("[aria-current]");
    expect(active).toHaveAttribute("aria-current", "true");
  });

  it("非アクティブ行には aria-current が付かない", () => {
    setup({ activeId: "p1" });
    const row = screen.getByText("g1行").closest("[role='listitem']");
    expect(row).not.toHaveAttribute("aria-current");
  });

  it("role=list / role=listitem を持つ", () => {
    setup();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getByRole("listitem")).toBeInTheDocument();
  });

  it("groups が空なら空メッセージを出す", () => {
    setup({ groups: [] });
    expect(screen.getByText("該当する記事がありません")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("densityClass を各行に付与する", () => {
    setup({ densityClass: "py-1" });
    const row = screen.getByText("g1行").closest("[role='listitem']");
    expect(row).toHaveClass("py-1");
  });

  it("densityClass 未指定でも行を描画する", () => {
    setup();
    const row = screen.getByText("g1行").closest("[role='listitem']");
    expect(row).toBeInTheDocument();
  });

  it("マウスホバーで背景色が変わり離れると戻る(非アクティブ)", async () => {
    setup();
    const row = screen.getByText("g1行").closest("[role='listitem']") as HTMLElement;
    await userEvent.hover(row);
    expect(row.style.background).toBe("var(--p-bg-hover)");
    await userEvent.unhover(row);
    expect(row.style.background).toBe("transparent");
  });

  it("アクティブ行はホバーしても背景を変えない", async () => {
    setup({ activeId: "g1" });
    const row = screen.getByText("g1行").closest("[role='listitem']") as HTMLElement;
    await userEvent.hover(row);
    expect(row.style.background).toBe("var(--p-bg-raised)");
    await userEvent.unhover(row);
    expect(row.style.background).toBe("var(--p-bg-raised)");
  });
});
