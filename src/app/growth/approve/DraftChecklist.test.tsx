import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { DraftChecklist } from "./DraftChecklist";

describe("DraftChecklist", () => {
  it("各項目をラベル＋値＋状態(3段階・色だけに依存しない)で出す", () => {
    render(
      <DraftChecklist
        checks={[
          { label: "文字数", value: "2,400字", level: "ok" },
          { label: "画像", value: "0 / 3", level: "warn" },
          { label: "AI免責文", value: "なし", level: "block", hint: "末尾に§5の免責文が必要" },
        ]}
      />,
    );
    const list = screen.getByRole("region", { name: "公開前チェック" });
    expect(within(list).getByText("2,400字")).toBeInTheDocument();
    expect(within(list).getByText("0 / 3")).toBeInTheDocument();
    // 状態は色だけでなくテキストでも示す(AA): ok/warn/block の3段階。
    expect(within(list).getByText("OK")).toBeInTheDocument();
    expect(within(list).getByText("要確認")).toBeInTheDocument();
    expect(within(list).getByText("公開ブロック")).toBeInTheDocument();
    // hint も表示する。
    expect(within(list).getByText(/末尾に§5の免責文が必要/)).toBeInTheDocument();
  });
});
