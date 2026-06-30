import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useDialog } from "./useDialog";

function Dialog({ withButtons = true }: { withButtons?: boolean }) {
  const ref = useDialog<HTMLDivElement>();
  return (
    <div ref={ref} role="dialog" aria-label="d">
      {withButtons ? (
        <>
          <button>first</button>
          <button>last</button>
        </>
      ) : null}
    </div>
  );
}

describe("useDialog", () => {
  it("マウント時に最初のボタンへフォーカスする", () => {
    render(<Dialog />);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("最後の要素から Tab で先頭へ巻き戻す", async () => {
    render(<Dialog />);
    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("先頭で Shift+Tab すると末尾へ回る", async () => {
    render(<Dialog />);
    const first = screen.getByRole("button", { name: "first" });
    first.focus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "last" })).toHaveFocus();
  });

  it("フォーカス可能要素が無いときパネル本体へフォーカスする", () => {
    render(<Dialog withButtons={false} />);
    expect(screen.getByRole("dialog")).toHaveFocus();
  });
});
