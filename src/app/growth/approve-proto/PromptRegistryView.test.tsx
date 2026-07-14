import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { PromptRegistryView } from "./PromptRegistryView";

vi.mock("@/app/growth/approve/PromptsView", () => ({
  PromptsView: ({ token }: { token: string }) => <div>token:{token}</div>,
}));

describe("PromptRegistryView", () => {
  it("既定の認証設定を使用する", () => {
    render(<PromptRegistryView />);
    expect(screen.getByLabelText("承認画面の合言葉")).toBeInTheDocument();
  });

  it("認証有効時は合言葉を入力してから本番PromptsViewへ渡す", () => {
    render(<PromptRegistryView isAuthEnabled />);

    expect(screen.queryByText(/^token:/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("承認画面の合言葉"), {
      target: { value: "secret-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロンプトを表示" }));

    expect(screen.getByText("token:secret-token")).toBeInTheDocument();
  });

  it("空の合言葉ではプロンプトを表示しない", () => {
    render(<PromptRegistryView isAuthEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "プロンプトを表示" }));

    expect(screen.queryByText(/^token:/)).not.toBeInTheDocument();
  });

  it("認証無効時は空tokenで直ちに表示する", () => {
    render(<PromptRegistryView isAuthEnabled={false} />);
    expect(screen.getByText("token:")).toBeInTheDocument();
  });
});
