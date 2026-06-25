import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { PendingItem } from "@/lib/growth/approve";

import { ProposalsView } from "./ProposalsView";

function proposal(id: string, title: string): PendingItem {
  return { id, kind: "proposal", title, subtitle: "", details: [], score: 0, stage: "untouched" };
}

const renderItem = (item: PendingItem) => <li key={item.id}>{item.title}</li>;

describe("ProposalsView", () => {
  it("施策があればリスト表示し件数を出す", () => {
    render(
      <ProposalsView
        proposals={[proposal("p1", "市川ページ"), proposal("p2", "SNS強化")]}
        renderItem={renderItem}
        densityClass="space-y-2"
        headerClass="hdr"
      />,
    );
    expect(screen.getByRole("region", { name: "施策レーン" })).toBeInTheDocument();
    expect(screen.getByText("2件")).toBeInTheDocument();
    expect(screen.getByText("市川ページ")).toBeInTheDocument();
    expect(screen.getByText("SNS強化")).toBeInTheDocument();
  });

  it("空なら空状態メッセージを出す", () => {
    render(
      <ProposalsView
        proposals={[]}
        renderItem={renderItem}
        densityClass="space-y-2"
        headerClass="hdr"
      />,
    );
    expect(screen.getByText("未処理の施策はありません")).toBeInTheDocument();
    expect(screen.getByText("0件")).toBeInTheDocument();
  });
});
