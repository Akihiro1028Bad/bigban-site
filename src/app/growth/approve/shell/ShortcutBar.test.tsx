import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShortcutBar } from "./ShortcutBar";

describe("ShortcutBar", () => {
  it("キーヒントを表示し、ヘルプボタンで onOpenShortcuts", async () => {
    const onOpenShortcuts = vi.fn();
    render(<ShortcutBar onOpenShortcuts={onOpenShortcuts} />);
    expect(screen.getByText("移動")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(onOpenShortcuts).toHaveBeenCalled();
  });
});
