import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { PendingItem } from "@/lib/growth/approve";

import { ArticlesView } from "./ArticlesView";
import { ARTICLE_COLUMNS, groupArticlesByStage } from "./board";

function idea(id: string, stage: PendingItem["stage"]): PendingItem {
  return { id, kind: "idea", title: id, subtitle: "", details: [], score: 0, stage };
}

const renderItem = (item: PendingItem) => <li key={item.id}>{item.title}</li>;

describe("ArticlesView", () => {
  it("4段階の列を出し、各列に件数バッジとカードを表示する", () => {
    const ideas = [idea("a", "proposed"), idea("b", "proposed"), idea("c", "drafted")];
    const columns = groupArticlesByStage(ideas, {});
    render(<ArticlesView columns={columns} renderItem={renderItem} densityClass="space-y-2" />);

    expect(screen.getByRole("region", { name: "記事パイプライン" })).toBeInTheDocument();
    // 4列(提案中/生成待ち/生成中/下書き)が並ぶ
    ARTICLE_COLUMNS.forEach((col) => {
      expect(screen.getByRole("region", { name: `列: ${col.label}` })).toBeInTheDocument();
    });
    // 提案中列に2件
    const proposed = screen.getByRole("region", { name: "列: 提案中" });
    expect(within(proposed).getByText("2件")).toBeInTheDocument();
    expect(within(proposed).getByText("a")).toBeInTheDocument();
    expect(within(proposed).getByText("b")).toBeInTheDocument();
  });

  it("空の列は『なし』を表示する", () => {
    const columns = groupArticlesByStage([], {});
    render(<ArticlesView columns={columns} renderItem={renderItem} densityClass="space-y-2" />);
    // 全列が空なので「なし」が4つ
    expect(screen.getAllByText("なし")).toHaveLength(4);
  });

  it("段階で色分けされた列ヘッダ(提案=blue/生成待ち=amber/生成中=purple/下書き=teal)", () => {
    const columns = groupArticlesByStage([], {});
    const { container } = render(
      <ArticlesView columns={columns} renderItem={renderItem} densityClass="space-y-2" />,
    );
    expect(container.querySelector(".bg-blue-50")).toBeTruthy();
    expect(container.querySelector(".bg-amber-50")).toBeTruthy();
    expect(container.querySelector(".bg-purple-50")).toBeTruthy();
    expect(container.querySelector(".bg-teal-50")).toBeTruthy();
  });
});
