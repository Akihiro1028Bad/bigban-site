import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithClient } from "@/test/renderWithClient";

import { fetchPrompts, type PromptsData } from "./api";
import { PromptsView } from "./PromptsView";

vi.mock("./api", () => ({ fetchPrompts: vi.fn() }));

const SAMPLE = {
  facilityContext: '{"open":false}',
  warnings: [],
  groups: [
    {
      group: "実行プロンプト",
      phases: [
        {
          path: "scripts/growth/prompts/weekly.md",
          filename: "weekly.md",
          label: "週次分析",
          group: "実行プロンプト",
          order: 1,
          purpose: "週次レポートと施策提案を生成する実行テンプレート",
          stage: "週次分析",
          whenItRuns: "週次の分析をするとき",
          content: "## 週次見出し\n\n### 判断基準\n\n- 週次の指示本文\n\n[正典](docs/operations/growth/00-canon.md)",
        },
        {
          path: "scripts/growth/prompts/drafts.md",
          filename: "drafts.md",
          label: "下書き生成",
          group: "実行プロンプト",
          order: 1,
          purpose: "承認済みの記事ネタを下書きHTMLへ変換する",
          stage: "下書き生成",
          whenItRuns: "下書きを作るとき",
          content: "## 下書き見出し\n\n下書きの指示本文",
        },
      ],
    },
    {
      group: "正典・共通ルール",
      phases: [
        {
          path: "docs/operations/growth/00-canon.md",
          filename: "00-canon.md",
          label: "グロース正典",
          group: "正典・共通ルール",
          order: 1,
          purpose: "全工程の禁止事項とAIモデル選択ルール",
          stage: "全工程",
          whenItRuns: "全工程が参照",
          content: "## 正典\n\n共通ルール本文",
        },
      ],
    },
  ],
} as unknown as PromptsData;

beforeEach(() => {
  vi.mocked(fetchPrompts).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("PromptsView", () => {
  it("読み込み中はステータスを表示する", () => {
    vi.mocked(fetchPrompts).mockReturnValue(new Promise(() => {}));
    renderWithClient(<PromptsView token="t" query="" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("失敗時はエラーメッセージを表示する", async () => {
    vi.mocked(fetchPrompts).mockRejectedValue(new Error("合言葉が違います。"));
    renderWithClient(<PromptsView token="t" query="" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("合言葉が違います。");
  });

  it("Error 以外で失敗したら既定文言を表示する", async () => {
    vi.mocked(fetchPrompts).mockRejectedValue("boom");
    renderWithClient(<PromptsView token="t" query="" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("前提情報をピン留めし、初期表示は前提情報の中身", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    expect(await screen.findByRole("button", { name: /前提情報/ })).toBeInTheDocument();
    // グループ見出しとフェーズ(ボタンは label＋meta の2行なので前方一致で照合)
    expect(screen.getByRole("button", { name: /週次分析/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下書き生成/ })).toBeInTheDocument();
    // 初期選択=前提情報の中身が右ペインに出る
    expect(screen.getByText('{"open":false}')).toBeInTheDocument();
  });

  it("フェーズ(Markdown)を選ぶと整形表示になり「いつ動くか」も表示、前提情報へ戻れる", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    const { container } = renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /下書き生成/ }));
    // Markdown は整形表示: 見出しは h2、本文は生の "## " を含む pre ではない
    const heading = screen.getByRole("heading", { level: 2, name: "下書き見出し" });
    expect(heading).toBeInTheDocument();
    expect(heading.closest(".prompt-markdown")).not.toBeNull();
    expect(heading.closest(".approve-article")).toBeNull();
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
    const { container } = renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    expect(container.querySelector("ul li")).not.toBeNull();
    expect(screen.getByText("週次の指示本文")).toBeInTheDocument();
    // 生 Markdown の "## " や "- " が pre で露出しない
    expect(container.querySelector("pre")).toBeNull();
  });

  it("モバイル: 項目選択で詳細ペインへ切替、戻るで一覧へ戻る", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
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
    const { container } = renderWithClient(<PromptsView token="t" query="" />);
    await screen.findByRole("button", { name: /週次分析/ });
    expect(screen.queryByRole("button", { name: /前提情報/ })).not.toBeInTheDocument();
    // 先頭フェーズ(Markdown)は整形表示: 見出しは h2 で pre ではない
    expect(screen.getByRole("heading", { level: 2, name: "週次見出し" })).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("表示できるものが無ければ空メッセージ", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue({ facilityContext: null, warnings: [], groups: [] });
    renderWithClient(<PromptsView token="t" query="" />);
    expect(await screen.findByText("表示できるプロンプトがありません。")).toBeInTheDocument();
  });

  it("コピーボタンで現在の本文をクリップボードへ書き、表示が変わる", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
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
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /下書き生成/ }));
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    expect(writeText).toHaveBeenCalledWith("## 下書き見出し\n\n下書きの指示本文");
    expect(await screen.findByRole("button", { name: "コピー済み" })).toBeInTheDocument();
  });

  it("コピーに失敗したら『コピー済み』表示にしない", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("no clipboard"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    const copy = await screen.findByRole("button", { name: "コピー" });
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "コピー済み" })).not.toBeInTheDocument();
  });

  it("API warning を alert で表示する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue({
      ...SAMPLE,
      warnings: ["任意資料 docs/operations/missing.md を読み込めませんでした。"],
    });
    renderWithClient(<PromptsView token="t" query="" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "任意資料 docs/operations/missing.md を読み込めませんでした。",
    );
  });

  it("query で資料を検索し、facility-context のピン留めは維持する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="下書き" />);
    expect(await screen.findByRole("button", { name: /前提情報/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下書き生成/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /週次分析/ })).not.toBeInTheDocument();
  });

  it("URL の doc query から選択資料を復元する", async () => {
    window.history.replaceState(
      null,
      "",
      "/growth/approve?view=prompt&doc=scripts%2Fgrowth%2Fprompts%2Fdrafts.md",
    );
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    expect(await screen.findByRole("heading", { level: 2, name: "下書き生成" })).toBeInTheDocument();
    expect(screen.getAllByText("scripts/growth/prompts/drafts.md").length).toBeGreaterThan(0);
    expect(screen.getByText("承認済みの記事ネタを下書きHTMLへ変換する")).toBeInTheDocument();
    expect(screen.getAllByText("下書き生成").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "プロンプト本文" }).className).toContain("block");
  });

  it("fragment直リンクは資料の非同期描画後に見出しへスクロールする", async () => {
    window.history.replaceState(
      null,
      "",
      "/growth/approve?view=prompt&doc=docs%2Foperations%2Fgrowth%2F00-canon.md#%E6%AD%A3%E5%85%B8",
    );
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    let resolvePrompts: ((value: PromptsData) => void) | undefined;
    vi.mocked(fetchPrompts).mockReturnValue(
      new Promise((resolve) => {
        resolvePrompts = resolve;
      }),
    );
    renderWithClient(<PromptsView token="t" query="" />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    resolvePrompts?.(SAMPLE);
    await screen.findByRole("heading", { level: 2, name: "正典" });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
  });

  it("存在しないhashと不正percent encodingは無視する", async () => {
    window.history.replaceState(
      null,
      "",
      "/growth/approve?view=prompt&doc=docs%2Foperations%2Fgrowth%2F00-canon.md#%E0%A4%A",
    );
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    expect(await screen.findByRole("heading", { level: 2, name: "正典" })).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("資料選択後もカテゴリを切替でき、切替先の先頭資料を選択する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    fireEvent.click(screen.getByRole("button", { name: /正典・共通ルール/ }));
    expect(screen.queryByRole("button", { name: /週次分析/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /グロース正典/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("heading", { level: 2, name: "グロース正典" })).toBeInTheDocument();
  });

  it("資料選択時に doc query を更新し、既存 view query は保持する", async () => {
    window.history.replaceState(null, "", "/growth/approve?view=prompt");
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("view")).toBe("prompt");
    expect(params.get("doc")).toBe("scripts/growth/prompts/weekly.md");
  });

  it("資料遷移はpushStateし、戻る/進むのpopstateで選択とモバイル詳細を同期する", async () => {
    window.history.replaceState(null, "", "/growth/approve?view=prompt");
    const pushState = vi.spyOn(window.history, "pushState");
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    expect(pushState).toHaveBeenCalled();
    expect(window.location.search).toContain("view=prompt");

    window.history.replaceState(
      null,
      "",
      "/growth/approve?view=prompt&doc=docs%2Foperations%2Fgrowth%2F00-canon.md",
    );
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("heading", { level: 2, name: "グロース正典" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "プロンプト本文" }).className).toContain("block");

    window.history.replaceState(
      null,
      "",
      "/growth/approve?view=prompt&doc=scripts%2Fgrowth%2Fprompts%2Fweekly.md",
    );
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("heading", { level: 2, name: "週次分析" })).toBeInTheDocument();
  });

  it("rendered/raw 切替と H2/H3 目次を表示する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    const { container } = renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    const toc = screen.getByRole("navigation", { name: "目次" });
    expect(toc).toHaveTextContent("週次見出し");
    expect(toc).toHaveTextContent("判断基準");
    expect(screen.getByRole("button", { name: "Raw" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(new URLSearchParams(window.location.search).get("raw")).toBe("1");
    expect(container.querySelector("pre")).not.toBeNull();
    expect(screen.getByText(/## 週次見出し/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rendered" }));
    expect(new URLSearchParams(window.location.search).has("raw")).toBe(false);
    expect(screen.getByRole("heading", { level: 2, name: "週次見出し" })).toBeInTheDocument();
  });

  it("Raw/Rendered切替はpushせず現在history entryをreplaceし、資料選択後も一致する", async () => {
    window.history.replaceState(null, "", "/growth/approve?view=prompt");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    const pushesBeforeRaw = pushState.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(replaceState).toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledTimes(pushesBeforeRaw);
    fireEvent.click(screen.getByRole("button", { name: /下書き生成/ }));
    expect(screen.getByRole("button", { name: "Raw" })).toHaveAttribute("aria-pressed", "true");
    expect(new URLSearchParams(window.location.search).get("raw")).toBe("1");
  });

  it("モバイルでカテゴリ先頭docを選択済みなら同じdocタップは履歴を増やさず詳細だけ開く", async () => {
    window.history.replaceState(null, "", "/growth/approve?view=prompt");
    const pushState = vi.spyOn(window.history, "pushState");
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /正典・共通ルール/ }));
    expect(pushState).toHaveBeenCalledTimes(1);
    const detail = screen.getByRole("region", { name: "プロンプト本文" });
    expect(detail.className).toContain("hidden lg:block");
    fireEvent.click(screen.getByRole("button", { name: /グロース正典/ }));
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(detail.className).toContain("block");
  });

  it("登録済み資料リンクをクリックすると同タブ内で該当資料へ移動する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    fireEvent.click(screen.getByRole("link", { name: "正典" }));
    expect(screen.getByRole("heading", { level: 2, name: "グロース正典" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("doc")).toBe(
      "docs/operations/growth/00-canon.md",
    );
  });

  it("登録済み資料リンクは完全なhrefを持ち、ネイティブEnter操作で履歴付き遷移する", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/growth/approve?view=prompt");
    const pushState = vi.spyOn(window.history, "pushState");
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    const link = screen.getByRole("link", { name: "正典" });
    expect(link).toHaveAttribute(
      "href",
      "/growth/approve?view=prompt&doc=docs%2Foperations%2Fgrowth%2F00-canon.md",
    );
    link.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { level: 2, name: "グロース正典" })).toBeInTheDocument();
    expect(pushState).toHaveBeenCalled();
  });

  it("未登録資料リンクは遷移せず、修飾キー付きリンクはブラウザ操作に委ねる", async () => {
    const data = structuredClone(SAMPLE);
    data.groups[0].phases[0].content += "\n\n[未登録](docs/operations/missing.md)";
    vi.mocked(fetchPrompts).mockResolvedValue(data);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    const missing = screen.getByRole("link", { name: "未登録" });
    expect(fireEvent.click(missing)).toBe(false);
    const registered = screen.getByRole("link", { name: "正典" });
    registered.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(registered, { ctrlKey: true });
    expect(screen.getByRole("heading", { level: 2, name: "週次分析" })).toBeInTheDocument();
  });

  it("raw指定で初期表示し、該当なし検索も表示する", async () => {
    window.history.replaceState(null, "", "/growth/approve?view=prompt&raw=1");
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    const first = renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    expect(await screen.findByText(/週次の指示本文/)).toBeInTheDocument();
    first.unmount();
    renderWithClient(<PromptsView token="t" query="絶対に一致しない資料" />);
    expect(await screen.findByText("一致する資料がありません。")).toBeInTheDocument();
  });

  it("popstateでdocなし・raw表示・未知groupを安全に反映する", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(SAMPLE);
    renderWithClient(<PromptsView token="t" query="" />);
    fireEvent.click(await screen.findByRole("button", { name: /週次分析/ }));
    window.history.replaceState(null, "", "/growth/approve?view=prompt&raw=1");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByText('{"open":false}')).toBeInTheDocument();
    window.history.replaceState(null, "", "/growth/approve?view=prompt&doc=unknown.md");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  });
});
