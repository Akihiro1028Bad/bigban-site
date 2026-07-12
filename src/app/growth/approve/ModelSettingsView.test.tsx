import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithClient } from "@/test/renderWithClient";

import { fetchModelSettings, putModelSetting } from "./api";
import { ModelSettingsView } from "./ModelSettingsView";

vi.mock("./api", () => ({
  fetchModelSettings: vi.fn(),
  putModelSetting: vi.fn(),
}));

const DATA = {
  storageAvailable: true,
  warning: null,
  settings: [
    {
      id: "weekly" as const,
      phaseId: "weekly" as const,
      label: "週次分析・提案",
      description: "予約ファネルを分析する",
      modes: ["weekly"],
      provider: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "xhigh" as const,
      source: "notion" as const,
    },
    {
      id: "drafts" as const,
      phaseId: "drafts" as const,
      label: "記事下書き生成",
      description: "記事本文を作る",
      modes: ["drafts", "drafts-auto"],
      provider: "claude" as const,
      model: "claude-opus-4-8",
      effort: "high" as const,
      source: "default" as const,
    },
    {
      id: "image-prompt" as const,
      phaseId: "image-prompt" as const,
      label: "画像プロンプト設計",
      description: "画像モデルへ渡す指示を設計する",
      modes: ["image-prompt", "regen", "regen-body"],
      provider: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "high" as const,
      source: "default" as const,
    },
  ],
  catalog: [
    { id: "gpt-5.6-sol", provider: "codex" as const, label: "GPT-5.6 Sol", note: "分析向け" },
    { id: "gpt-5.5", provider: "codex" as const, label: "GPT-5.5", note: "構造化向け" },
    { id: "claude-opus-4-8", provider: "claude" as const, label: "Claude Opus 4.8", note: "文章向け" },
    { id: "claude-sonnet-5", provider: "claude" as const, label: "Claude Sonnet 5", note: "高速" },
  ],
  efforts: {
    codex: ["minimal", "low", "medium", "high", "xhigh"] as const,
    claude: ["low", "medium", "high", "xhigh", "max"] as const,
  },
};

beforeEach(() => {
  vi.mocked(fetchModelSettings).mockReset();
  vi.mocked(putModelSetting).mockReset();
});

describe("ModelSettingsView", () => {
  it("読み込み中と失敗を表示する", async () => {
    vi.mocked(fetchModelSettings).mockReturnValueOnce(new Promise(() => {}));
    const first = renderWithClient(<ModelSettingsView token="t" />);
    expect(screen.getByRole("status")).toHaveTextContent("読み込み中");
    first.unmount();

    vi.mocked(fetchModelSettings).mockRejectedValueOnce(new Error("取得失敗"));
    renderWithClient(<ModelSettingsView token="t" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("取得失敗");
  });

  it("Error以外の取得失敗は既定文言を表示する", async () => {
    vi.mocked(fetchModelSettings).mockRejectedValue("down");
    renderWithClient(<ModelSettingsView token="t" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("工程ごとの現在モデルと設定元を表示する", async () => {
    vi.mocked(fetchModelSettings).mockResolvedValue(DATA);
    renderWithClient(<ModelSettingsView token="t" />);

    expect(await screen.findByRole("heading", { name: "AIモデル設定" })).toBeInTheDocument();
    expect(screen.getByText("週次分析・提案")).toBeInTheDocument();
    expect(screen.getByText("記事下書き生成")).toBeInTheDocument();
    expect(screen.getByText("画像プロンプト設計")).toBeInTheDocument();
    expect(screen.getByText("保存済み")).toBeInTheDocument();
    expect(screen.getAllByText("推奨値")).toHaveLength(2);
    expect(screen.getByLabelText("週次分析・提案のモデル")).toHaveValue("gpt-5.6-sol");
    expect(screen.getByLabelText("画像プロンプト設計のモデル")).toHaveValue("gpt-5.6-sol");
    expect(screen.getByText("growth:image-prompt / growth:regen / growth:regen-body")).toBeInTheDocument();
  });

  it("Notion未接続時は推奨値と保存できない理由を表示する", async () => {
    vi.mocked(fetchModelSettings).mockResolvedValue({
      ...DATA,
      storageAvailable: false,
      warning: "NotionのAIモデル設定DBを読み込めないため、推奨値を表示しています。",
    });
    renderWithClient(<ModelSettingsView token="t" />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("推奨値を表示"));
    expect(screen.getAllByRole("button", { name: /を保存$/ })[0]).toBeDisabled();
  });

  it("プロバイダー変更で対応モデル・推論強度へ切替え、保存する", async () => {
    vi.mocked(fetchModelSettings).mockResolvedValue(DATA);
    vi.mocked(putModelSetting).mockResolvedValue({
      ...DATA.settings[0],
      provider: "claude",
      model: "claude-opus-4-8",
      effort: "low",
      source: "notion",
    });
    renderWithClient(<ModelSettingsView token="t" />);

    const provider = await screen.findByLabelText("週次分析・提案のプロバイダー");
    fireEvent.change(provider, { target: { value: "claude" } });
    expect(screen.getByLabelText("週次分析・提案のモデル")).toHaveValue("claude-opus-4-8");
    expect(screen.getByLabelText("週次分析・提案の推論強度")).toHaveValue("low");

    fireEvent.click(screen.getByRole("button", { name: "週次分析・提案を保存" }));
    await waitFor(() =>
      expect(putModelSetting).toHaveBeenCalledWith("t", {
        phaseId: "weekly",
        provider: "claude",
        model: "claude-opus-4-8",
        effort: "low",
      }),
    );
    expect(await screen.findByText("保存しました")).toBeInTheDocument();
  });

  it("保存失敗を行内に表示する", async () => {
    vi.mocked(fetchModelSettings).mockResolvedValue(DATA);
    vi.mocked(putModelSetting).mockRejectedValue(new Error("保存できません"));
    renderWithClient(<ModelSettingsView token="t" />);

    fireEvent.change(await screen.findByLabelText("記事下書き生成のモデル"), {
      target: { value: "claude-sonnet-5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "記事下書き生成を保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存できません");
  });

  it("推論強度を変更すると保存可能になる", async () => {
    vi.mocked(fetchModelSettings).mockResolvedValue(DATA);
    renderWithClient(<ModelSettingsView token="t" />);
    const effort = await screen.findByLabelText("週次分析・提案の推論強度");
    fireEvent.change(effort, { target: { value: "medium" } });
    expect(effort).toHaveValue("medium");
    expect(screen.getByRole("button", { name: "週次分析・提案を保存" })).toBeEnabled();
  });

  it("Error以外の保存失敗は既定文言を表示する", async () => {
    vi.mocked(fetchModelSettings).mockResolvedValue(DATA);
    vi.mocked(putModelSetting).mockRejectedValue("down");
    renderWithClient(<ModelSettingsView token="t" />);
    fireEvent.change(await screen.findByLabelText("週次分析・提案の推論強度"), { target: { value: "medium" } });
    fireEvent.click(screen.getByRole("button", { name: "週次分析・提案を保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存に失敗しました。");
  });

  it("切替先にモデルと推論強度が無い場合も空値で安全に表示する", async () => {
    vi.mocked(fetchModelSettings).mockResolvedValue({ ...DATA, catalog: DATA.catalog.filter((item) => item.provider === "codex"), efforts: { ...DATA.efforts, claude: [] } });
    renderWithClient(<ModelSettingsView token="t" />);
    fireEvent.change(await screen.findByLabelText("週次分析・提案のプロバイダー"), { target: { value: "claude" } });
    expect(screen.getByLabelText("週次分析・提案のモデル").querySelectorAll("option")).toHaveLength(0);
    expect(screen.getByLabelText("週次分析・提案の推論強度").querySelectorAll("option")).toHaveLength(0);
  });
});
