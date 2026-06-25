import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DecorateView, DecorationProposal } from "@/lib/growth/decorate";

import { DecorationAssistant } from "./DecorationAssistant";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const BODY = `<p>導入の本文です</p><aside class="note">既に注意</aside>`;

function proposal(over: Partial<DecorationProposal> = {}): DecorationProposal {
  return { id: "p1", blockIndex: 0, excerpt: "導入", op: "add", decoration: "note", reason: "強調したい", ...over };
}

function presented(...proposals: DecorationProposal[]): DecorateView {
  return { status: "提示中", raw: "", proposals };
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function mockFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setup(decorate?: DecorateView, bodyHtml = BODY) {
  const onChanged = vi.fn();
  render(<DecorationAssistant pageId={PAGE_ID} token="" bodyHtml={bodyHtml} decorate={decorate} onChanged={onChanged} />);
  return { onChanged };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("DecorationAssistant", () => {
  it("なし: 提案フォームを出し、指示(trim)付きで POST し onChanged", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup();
    await userEvent.type(screen.getByLabelText(/見てほしい点/), "  強調を  ");
    await userEvent.click(screen.getByRole("button", { name: "装飾を提案" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/growth/decorate");
    expect(init.headers?.Authorization).toMatch(/^Bearer /);
    expect(JSON.parse(init.body).instruction).toBe("強調を");
  });

  it("依頼失敗(error あり)はその文言・onChanged 呼ばない", async () => {
    mockFetch(jsonResponse({ success: false, error: "処理中です" }, false, 409));
    const { onChanged } = setup();
    await userEvent.click(screen.getByRole("button", { name: "装飾を提案" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("処理中です");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("依頼失敗(error なし)はフォールバック文言", async () => {
    mockFetch(jsonResponse({ success: false }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "装飾を提案" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("装飾提案の依頼に失敗しました。");
  });

  it("fetch が非Errorでrejectしてもフォールバック文言", async () => {
    const fn = vi.fn();
    fn.mockRejectedValueOnce("boom");
    vi.stubGlobal("fetch", fn);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "装飾を提案" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("装飾提案の依頼に失敗しました。");
  });

  it("依頼中: 分析中＋再読み込みで onChanged", async () => {
    const { onChanged } = setup({ status: "依頼中", raw: "", proposals: [] });
    expect(screen.getByText(/AIが装飾を分析中/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("処理中も分析中表示", () => {
    setup({ status: "処理中", raw: "", proposals: [] });
    expect(screen.getByText(/AIが装飾を分析中/)).toBeInTheDocument();
  });

  it("提示中: 提案(op/装飾/理由/before/after)を表示し、採用→反映で draft/edit 保存", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup(presented(proposal({ op: "add", decoration: "highlight", excerpt: "導入" })));
    expect(screen.getByText("足す")).toBeInTheDocument();
    expect(screen.getByText("highlight")).toBeInTheDocument();
    expect(screen.getByText("強調したい")).toBeInTheDocument();
    expect(screen.getByText(/after:/)).toHaveTextContent('<aside class="highlight">導入の本文です</aside>');

    await userEvent.click(screen.getByRole("checkbox", { name: "採用: p1" }));
    await userEvent.click(screen.getByRole("button", { name: "採用分を反映" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/growth/draft/edit");
    expect(JSON.parse(init.body).bodyHtml).toContain('<aside class="highlight">導入の本文です</aside>');
  });

  it("提示中: 採用ゼロで反映するとエラー", async () => {
    const fetchFn = mockFetch();
    setup(presented(proposal()));
    await userEvent.click(screen.getByRole("button", { name: "採用分を反映" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("採用する提案を選んでください。");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("提示中: 適用不可な提案は要確認表示・チェックボックスなし", () => {
    setup(presented(proposal({ excerpt: "存在しない抜粋" })));
    expect(screen.getByText(/要確認/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("提示中: 提案が空なら案内＋閉じる", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup(presented());
    expect(screen.getByText(/提案できる装飾が見つかりません/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(fetchFn.mock.calls[0][0]).toContain("/api/growth/decorate/dismiss");
  });

  it("提示中: 反映の保存失敗はエラー", async () => {
    mockFetch(jsonResponse({ success: false, error: "保存失敗" }, false, 502));
    setup(presented(proposal()));
    await userEvent.click(screen.getByRole("checkbox", { name: "採用: p1" }));
    await userEvent.click(screen.getByRole("button", { name: "採用分を反映" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失敗");
  });

  it("提示中: 閉じる(dismiss)失敗はエラーで onChanged 呼ばない", async () => {
    mockFetch(jsonResponse({ success: false, error: "片付け失敗" }, false, 502));
    const { onChanged } = setup(presented(proposal()));
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("片付け失敗");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("提示中: 採用→もう一度クリックで解除できる(トグル)", async () => {
    setup(presented(proposal()));
    const cb = screen.getByRole("checkbox", { name: "採用: p1" });
    await userEvent.click(cb);
    expect(cb).toBeChecked();
    await userEvent.click(cb);
    expect(cb).not.toBeChecked();
  });

  it("提示中: 閉じるで dismiss", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup(presented(proposal()));
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0][0]).toContain("/api/growth/decorate/dismiss");
  });

  it("失敗: 理由表示＋再依頼で POST＋閉じるで dismiss", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup({ status: "失敗", raw: "OpenAI 503", proposals: [] });
    expect(screen.getByText(/OpenAI 503/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再依頼" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/decorate");
  });

  it("失敗: raw 空でも文言は出る・閉じるで dismiss", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup({ status: "失敗", raw: "", proposals: [] });
    expect(screen.getByText(/装飾提案に失敗しました/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0][0]).toContain("/api/growth/decorate/dismiss");
  });
});
