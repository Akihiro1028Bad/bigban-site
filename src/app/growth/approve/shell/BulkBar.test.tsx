import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BulkBar } from "./BulkBar";

describe("BulkBar", () => {
  it("count=0 では何も描画しない", () => {
    const { container } = render(<BulkBar count={0} onApproveAll={vi.fn()} onRejectAll={vi.fn()} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("count>0 で件数・各操作ボタンを出す", async () => {
    const onApproveAll = vi.fn();
    const onRejectAll = vi.fn();
    const onClear = vi.fn();
    render(<BulkBar count={2} onApproveAll={onApproveAll} onRejectAll={onRejectAll} onClear={onClear} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /まとめて承認/ }));
    expect(onApproveAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /まとめて却下/ }));
    expect(onRejectAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "選択解除" }));
    expect(onClear).toHaveBeenCalled();
  });
});
