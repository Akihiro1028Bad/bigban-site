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
          content: "## 週次見出し\n\n- 週次の指示本文",
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
          content: "## 下書き見出し\n\n下書きの指示本文",
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
    expect(await screen.findByRole("button", { name: /前提情報/ })).toBeInTheDocument();
    // グループ見出しとフェーズ(ボタンは label＋meta の2行なので前方一致で照合)
    expect(screen.getByRole("button", { name: /週次分析/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下書き生成/ })).toBeInTheDocument();
    // 初期選択=前提情報の中身が右ペインに出る
    expect(screen.getByText('{"open":false}')).toBeInTheDocument();
  });

  it("フェーズ(Markdown)を選ぶと整形表示になり「いつ動くか」も表示、前提情報へ戻れる", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    const { container } = renderWithClient(<PromptsView token="t" />);
    fireEvent.click(await screen.findByRole("button", { name: /下書き生成/ }));
    // Markdown は整形表示: 見出しは h2、本文は生の "## " を含む pre ではない
    const heading = screen.getByRole("heading", { level: 2, name: "下書き見出し" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("下書きの指示本文")).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
    // meta「下書きを作るとき」は右ペインとボタンの両方に出るため getAllByText で確認
    expect(screen.getAllByText("下書きを作るとき").length).toBeGreaterThan(0);
    // 前提情報(JSON)へ戻すと生表示の pre に切り替わる(ピンの onSelect / 選択解決を網羅)
    fireEvent.click(screen.getByRole("button", { name: /前提情報/ }));
    expect(screen.getByText('{"open":false}')).toBeInTheDocument();
    expect(container.querySelector("pre")).not.toBeNull();
  });

  it("フェーズ(Markdown)の箇条書きも整形表示になる", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    const { container } = renderWithClient(<PromptsView token="t" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    expect(container.querySelector("ul li")).not.toBeNull();
    expect(screen.getByText("週次の指示本文")).toBeInTheDocument();
    // 生 Markdown の "## " や "- " が pre で露出しない
    expect(container.querySelector("pre")).toBeNull();
  });

  it("モバイル: 項目選択で詳細ペインへ切替、戻るで一覧へ戻る", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" />);
    const nav = await screen.findByRole("navigation", { name: "プロンプト一覧" });
    const detail = screen.getByRole("region", { name: "プロンプト本文" });
    // 初期(showDetailMobile=false): 一覧は表示・詳細はモバイル非表示
    expect(nav.className).toContain("block");
    expect(nav.className).not.toContain("hidden lg:block");
    expect(detail.className).toContain("hidden lg:block");
    // フェーズ選択でモバイルは詳細ペインへ
    fireEvent.click(screen.getByRole("button", { name: /週次分析/ }));
    expect(nav.className).toContain("hidden lg:block");
    expect(detail.className).toContain("block");
    expect(detail.className).not.toContain("hidden lg:block");
    // 戻るで一覧ペインへ
    fireEvent.click(screen.getByRole("button", { name: "プロンプト一覧へ戻る" }));
    expect(nav.className).not.toContain("hidden lg:block");
    expect(detail.className).toContain("hidden lg:block");
  });

  it("前提情報が無ければピンは出さず、先頭フェーズを整形表示で初期選択する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue({ ...SAMPLE, facilityContext: null });
    const { container } = renderWithClient(<PromptsView token="t" />);
    await screen.findByRole("button", { name: /週次分析/ });
    expect(screen.queryByRole("button", { name: /前提情報/ })).not.toBeInTheDocument();
    // 先頭フェーズ(Markdown)は整形表示: 見出しは h2 で pre ではない
    expect(screen.getByRole("heading", { level: 2, name: "週次見出し" })).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
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

  it("Markdown フェーズでもコピーは生の本文(未整形)を書き込む", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" />);
    fireEvent.click(await screen.findByRole("button", { name: /下書き生成/ }));
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    expect(writeText).toHaveBeenCalledWith("## 下書き見出し\n\n下書きの指示本文");
  });

  it("コピーに失敗したら『コピー済み』表示にしない", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("no clipboard"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" />);
    const copy = await screen.findByRole("button", { name: "コピー" });
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "コピー済み" })).not.toBeInTheDocument();
  });
});
