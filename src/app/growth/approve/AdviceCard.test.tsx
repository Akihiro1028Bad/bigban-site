import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdviceView } from "@/lib/growth/advise";

import { AdviceCard } from "./AdviceCard";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

const FULL_ADVICE: AdviceView = {
  status: "提示中",
  raw: "",
  advice: {
    summary: "具体性が弱い。",
    scores: [
      { axis: "検索意図", score: 4 },
      { axis: "具体性", score: 2, note: "数値が少ない" },
    ],
    strengths: ["導入が読者に寄り添う"],
    fixes: [
      { area: "文体", severity: "中", quote: "重要です。", reason: "翻訳調。", suggestion: "体験ベースに。" },
      { area: "見た目", severity: "高", reason: "段落が長い。", suggestion: "分割する。" },
    ],
  },
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function mockFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setup(advice?: AdviceView) {
  const onChanged = vi.fn();
  render(<AdviceCard pageId={PAGE_ID} token="" advice={advice} onChanged={onChanged} />);
  return { onChanged };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("AdviceCard", () => {
  it("未取得/なし: 依頼フォームを出し、指示付きで POST し onChanged を呼ぶ", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup();
    await userEvent.type(screen.getByLabelText(/見てほしい点/), "  見た目も  ");
    await userEvent.click(screen.getByRole("button", { name: "アドバイスを依頼" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/growth/advise?");
    const sent = JSON.parse(init.body);
    expect(sent.pageId).toBe(PAGE_ID);
    expect(sent.instruction).toBe("見た目も"); // trim
  });

  it("依頼失敗(error あり)はその文言を出し onChanged を呼ばない", async () => {
    mockFetch(jsonResponse({ success: false, error: "下書きがありません" }, false, 400));
    const { onChanged } = setup({ status: "なし", advice: null, raw: "" });
    await userEvent.click(screen.getByRole("button", { name: "アドバイスを依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("下書きがありません");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("依頼失敗(error なし)はフォールバック文言", async () => {
    mockFetch(jsonResponse({ success: false }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アドバイスを依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("アドバイス依頼に失敗しました。");
  });

  it("fetch が非Errorでrejectしてもフォールバック文言", async () => {
    const fn = vi.fn();
    fn.mockRejectedValueOnce("boom");
    vi.stubGlobal("fetch", fn);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アドバイスを依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("アドバイス依頼に失敗しました。");
  });

  it("依頼中: 分析中メッセージと再読み込みで onChanged", async () => {
    const { onChanged } = setup({ status: "依頼中", advice: null, raw: "" });
    expect(screen.getByText(/AIが分析中/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("処理中も分析中表示", () => {
    setup({ status: "処理中", advice: null, raw: "" });
    expect(screen.getByText(/AIが分析中/)).toBeInTheDocument();
  });

  it("提示中: 総評・スコア・強み・直すべき点(引用/重要度/修正案)を表示", () => {
    setup(FULL_ADVICE);
    expect(screen.getByText("具体性が弱い。")).toBeInTheDocument();
    expect(screen.getByLabelText("観点別スコア")).toHaveTextContent("検索意図");
    expect(screen.getByText("導入が読者に寄り添う")).toBeInTheDocument();
    expect(screen.getByText("翻訳調。")).toBeInTheDocument();
    expect(screen.getByText("→ 体験ベースに。")).toBeInTheDocument();
    expect(screen.getByText("「重要です。」")).toBeInTheDocument();
    expect(screen.getByText("→ 分割する。")).toBeInTheDocument();
  });

  it("提示中: 閉じるで dismiss を POST し onChanged", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup(FULL_ADVICE);
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toContain("/api/growth/advise/dismiss");
  });

  it("提示中だが advice=null(解釈不能)は案内＋閉じる", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup({ status: "提示中", advice: null, raw: "壊れ" });
    expect(screen.getByText(/解釈できませんでした/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(fetchFn.mock.calls[0][0]).toContain("/api/growth/advise/dismiss");
  });

  it("提示中: スコア/強み/直す点が空でも総評だけ表示できる", () => {
    setup({
      status: "提示中",
      raw: "",
      advice: { summary: "おおむね良い", scores: [], strengths: [], fixes: [] },
    });
    expect(screen.getByText("おおむね良い")).toBeInTheDocument();
    expect(screen.queryByLabelText("観点別スコア")).not.toBeInTheDocument();
  });

  it("失敗: 理由表示＋再依頼で POST＋閉じる で dismiss", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup({ status: "失敗", advice: null, raw: "OpenAI 503" });
    expect(screen.getByText(/OpenAI 503/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再依頼" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toContain("/api/growth/advise?");
  });

  it("失敗: raw が空でも文言は出る", () => {
    setup({ status: "失敗", advice: null, raw: "" });
    expect(screen.getByText(/アドバイスに失敗しました/)).toBeInTheDocument();
  });

  it("失敗: 閉じるで dismiss", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup({ status: "失敗", advice: null, raw: "x" });
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0][0]).toContain("/api/growth/advise/dismiss");
  });

  it("提示中: fix の severity が未知でも低スタイルで落ちない", () => {
    setup({
      status: "提示中",
      raw: "",
      advice: {
        summary: "s",
        scores: [],
        strengths: [],
        // @ts-expect-error: 表示は未知 severity でも落ちないことを確認(防御)
        fixes: [{ area: "x", severity: "致命", reason: "r", suggestion: "g" }],
      },
    });
    expect(screen.getByText("致命")).toBeInTheDocument();
  });
});
