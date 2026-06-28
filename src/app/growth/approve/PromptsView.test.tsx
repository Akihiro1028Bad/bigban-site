import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithClient } from "@/test/renderWithClient";

import { fetchPrompts, type PromptsData } from "./api";
import { PromptsView } from "./PromptsView";

vi.mock("./api", () => ({ fetchPrompts: vi.fn() }));

const SAMPLE: PromptsData = {
  facilityContext: '{"open":false}',
  groups: [
    {
      group: "分析",
      phases: [
        {
          filename: "weekly.md",
          label: "週次分析",
          group: "分析",
          order: 1,
          whenItRuns: "週次の分析をするとき",
          content: "週次の指示本文",
        },
      ],
    },
    {
      group: "執筆",
      phases: [
        {
          filename: "drafts.md",
          label: "下書き生成",
          group: "執筆",
          order: 1,
          whenItRuns: "下書きを作るとき",
          content: "下書きの指示本文",
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.mocked(fetchPrompts).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PromptsView", () => {
  it("読み込み中はステータスを表示する", () => {
    vi.mocked(fetchPrompts).mockReturnValue(new Promise(() => {}));
    renderWithClient(<PromptsView token="t" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("失敗時はエラーメッセージを表示する", async () => {
    vi.mocked(fetchPrompts).mockRejectedValue(new Error("合言葉が違います。"));
    renderWithClient(<PromptsView token="t" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("合言葉が違います。");
  });

  it("Error 以外で失敗したら既定文言を表示する", async () => {
    vi.mocked(fetchPrompts).mockRejectedValue("boom");
    renderWithClient(<PromptsView token="t" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("前提情報をピン留めし、初期表示は前提情報の中身", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" />);
    expect(await screen.findByRole("button", { name: "前提情報" })).toBeInTheDocument();
    // グループ見出しとフェーズ
    expect(screen.getByRole("button", { name: "週次分析" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下書き生成" })).toBeInTheDocument();
    // 初期選択=前提情報の中身が右ペインに出る
    expect(screen.getByText('{"open":false}')).toBeInTheDocument();
  });

  it("フェーズを選ぶと本文と「いつ動くか」を表示し、前提情報へ戻れる", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" />);
    fireEvent.click(await screen.findByRole("button", { name: "下書き生成" }));
    expect(screen.getByText("下書きの指示本文")).toBeInTheDocument();
    expect(screen.getByText("下書きを作るとき")).toBeInTheDocument();
    // 前提情報へ戻すと中身が切り替わる(ピンの onSelect / 選択解決を網羅)
    fireEvent.click(screen.getByRole("button", { name: "前提情報" }));
    expect(screen.getByText('{"open":false}')).toBeInTheDocument();
  });

  it("前提情報が無ければピンは出さず、先頭フェーズを初期選択する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue({ ...SAMPLE, facilityContext: null });
    renderWithClient(<PromptsView token="t" />);
    await screen.findByRole("button", { name: "週次分析" });
    expect(screen.queryByRole("button", { name: "前提情報" })).not.toBeInTheDocument();
    expect(screen.getByText("週次の指示本文")).toBeInTheDocument();
  });

  it("表示できるものが無ければ空メッセージ", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue({ facilityContext: null, groups: [] });
    renderWithClient(<PromptsView token="t" />);
    expect(await screen.findByText("表示できるプロンプトがありません。")).toBeInTheDocument();
  });

  it("コピーボタンで現在の本文をクリップボードへ書き、表示が変わる", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" />);
    const copy = await screen.findByRole("button", { name: "コピー" });
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith('{"open":false}');
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "コピー済み" })).toBeInTheDocument()
    );
  });
});
