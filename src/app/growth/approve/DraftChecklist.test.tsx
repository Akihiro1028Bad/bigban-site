import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { DraftChecklist } from "./DraftChecklist";

describe("DraftChecklist", () => {
  it("各項目をラベル＋値＋状態(色だけに依存しない)で出す", () => {
    render(
      <DraftChecklist
        checks={[
          { label: "文字数", value: "2,400字", ok: true },
          { label: "画像", value: "0 / 3", ok: false },
        ]}
      />,
    );
    const list = screen.getByRole("region", { name: "公開前チェック" });
    expect(within(list).getByText("文字数")).toBeInTheDocument();
    expect(within(list).getByText("2,400字")).toBeInTheDocument();
    expect(within(list).getByText("画像")).toBeInTheDocument();
    expect(within(list).getByText("0 / 3")).toBeInTheDocument();
    // 状態は色だけでなくテキストでも示す(AA)。
    expect(within(list).getByText("OK")).toBeInTheDocument();
    expect(within(list).getByText("要確認")).toBeInTheDocument();
  });
});
