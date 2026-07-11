import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingsView } from "./SettingsView";

vi.mock("./ModelSettingsView", () => ({ ModelSettingsView: () => <div>モデル設定本文</div> }));
vi.mock("./PromptsView", () => ({ PromptsView: () => <div>プロンプト本文</div> }));

describe("SettingsView", () => {
  it("モデル/プロンプトを1画面内で切り替える", async () => {
    const onSectionChange = vi.fn();
    const { rerender } = render(
      <SettingsView token="t" query="" section="models" onSectionChange={onSectionChange} />,
    );
    expect(screen.getByText("モデル設定本文")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "プロンプト" }));
    expect(onSectionChange).toHaveBeenCalledWith("prompts");
    rerender(<SettingsView token="t" query="" section="prompts" onSectionChange={onSectionChange} />);
    expect(screen.getByText("プロンプト本文")).toBeInTheDocument();
  });
});
