import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdviceView } from "@/lib/growth/advise";
import type { AdviceApplyView } from "@/lib/growth/adviseApply";

import { AdviceCard } from "./AdviceCard";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
// fix[0] の quote「重要です。」を一意に含む本文(採用候補の判定に使う)。
const BODY = "<p>導入です。</p><p>ここは重要です。読んでください。</p>";

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

function setup(advice?: AdviceView, opts: { adviceApply?: AdviceApplyView; bodyHtml?: string } = {}) {
  const onChanged = vi.fn();
  render(
    <AdviceCard
      pageId={PAGE_ID}
      token=""
      advice={advice}
      adviceApply={opts.adviceApply}
      bodyHtml={opts.bodyHtml}
      onChanged={onChanged}
    />
  );
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
    expect(url).toBe("/api/growth/advise");
    expect(init.headers?.Authorization).toMatch(/^Bearer /);
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
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/advise");
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

describe("AdviceCard 採用→本文反映(#165)", () => {
  const APPLY_NONE: AdviceApplyView = { status: "なし", proposal: [], raw: "" };

  it("反映なし: 採用候補に採用チェックを出し、採用→反映依頼を POST する", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup(FULL_ADVICE, { adviceApply: APPLY_NONE, bodyHtml: BODY });
    // fix[0](文体・quote一致)だけ採用チェックが出る。fix[1](見た目・quote無し)は出ない。
    const checkbox = screen.getByRole("checkbox", { name: "修正案1を採用" });
    expect(screen.queryByRole("checkbox", { name: "修正案2を採用" })).not.toBeInTheDocument();
    // 未選択では反映依頼は無効
    const submit = screen.getByRole("button", { name: /採用分を反映依頼/ });
    expect(submit).toBeDisabled();
    await userEvent.click(checkbox);
    await userEvent.click(submit);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/growth/advise/apply");
    expect(init.headers?.Authorization).toMatch(/^Bearer /);
    expect(JSON.parse(init.body)).toEqual({ pageId: PAGE_ID, adoptedIndexes: [0] });
  });

  it("bodyHtml が無ければ採用候補は出ない", () => {
    setup(FULL_ADVICE, { adviceApply: APPLY_NONE });
    expect(screen.queryByRole("checkbox", { name: /採用/ })).not.toBeInTheDocument();
  });

  it("引用が無い修正案には理由を表示する(#178)", () => {
    setup(FULL_ADVICE, { adviceApply: APPLY_NONE, bodyHtml: BODY });
    // fix[1](見た目・quote無し)はチェック不可だが、なぜ不可かを理由表示する。
    expect(screen.queryByRole("checkbox", { name: "修正案2を採用" })).not.toBeInTheDocument();
    expect(screen.getByText("引用がないため自動反映できません")).toBeInTheDocument();
  });

  it("事実・タイトル等の除外カテゴリは『助言のみ』理由を表示する(#178)", () => {
    const advice: AdviceView = {
      status: "提示中",
      raw: "",
      advice: {
        summary: "s",
        scores: [],
        strengths: [],
        fixes: [
          { area: "正確性", severity: "高", quote: "重要です。", reason: "r", suggestion: "g" },
        ],
      },
    };
    setup(advice, { adviceApply: APPLY_NONE, bodyHtml: BODY });
    expect(screen.queryByRole("checkbox", { name: /採用/ })).not.toBeInTheDocument();
    expect(
      screen.getByText("助言のみ（事実・タイトル・リンク等は自動反映の対象外）")
    ).toBeInTheDocument();
  });

  it("採用チェックは付け外しできる(再クリックで解除)", async () => {
    setup(FULL_ADVICE, { adviceApply: APPLY_NONE, bodyHtml: BODY });
    const checkbox = screen.getByRole("checkbox", { name: "修正案1を採用" });
    const submit = screen.getByRole("button", { name: /採用分を反映依頼/ });
    await userEvent.click(checkbox); // 採用
    expect(submit).toBeEnabled();
    await userEvent.click(checkbox); // 解除
    expect(submit).toBeDisabled();
  });

  it("反映 失敗: raw が空でも文言は出る", () => {
    setup(FULL_ADVICE, {
      adviceApply: { status: "失敗", proposal: [], raw: "" },
      bodyHtml: BODY,
    });
    expect(screen.getByText(/反映に失敗しました/)).toBeInTheDocument();
  });

  it("反映 依頼中: 作成中バッジと再読み込み", async () => {
    const { onChanged } = setup(FULL_ADVICE, {
      adviceApply: { status: "依頼中", proposal: [], raw: "" },
      bodyHtml: BODY,
    });
    expect(screen.getByText(/反映案を作成中/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("反映 提示中: 元/新の差分を出し、反映するで draft/edit→dismiss→onChanged", async () => {
    const proposal = [
      { fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>ここがポイントです。</p>" },
    ];
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const { onChanged } = setup(FULL_ADVICE, {
      adviceApply: { status: "提示中", proposal, raw: "" },
      bodyHtml: BODY,
    });
    expect(screen.getByText(/ここがポイントです。/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "本文に反映する" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(String(fetchFn.mock.calls[0][0])).toContain("/api/growth/draft/edit");
    const saved = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(saved.bodyHtml).toContain("ここがポイントです。");
    expect(String(fetchFn.mock.calls[1][0])).toContain("/api/growth/advise/apply/dismiss");
  });

  it("反映 提示中: 本文不一致の案は反映できずエラー(保存しない)", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup(FULL_ADVICE, {
      adviceApply: {
        status: "提示中",
        proposal: [{ fixIndex: 0, before: "<p>存在しない段落</p>", after: "<p>x</p>" }],
        raw: "",
      },
      bodyHtml: BODY,
    });
    await userEvent.click(screen.getByRole("button", { name: "本文に反映する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/反映できる案がありません/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("反映 提示中: bodyHtml 無しなら反映ボタンは何もしない(防御)", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup(FULL_ADVICE, {
      adviceApply: {
        status: "提示中",
        proposal: [{ fixIndex: 0, before: "<p>x</p>", after: "<p>y</p>" }],
        raw: "",
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "本文に反映する" }));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("反映 提示中: 一部のみ一致なら反映＋スキップ件数を知らせる", async () => {
    const proposal = [
      { fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>新文。</p>" },
      { fixIndex: 1, before: "<p>存在しない</p>", after: "<p>z</p>" },
    ];
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const { onChanged } = setup(FULL_ADVICE, {
      adviceApply: { status: "提示中", proposal, raw: "" },
      bodyHtml: BODY,
    });
    await userEvent.click(screen.getByRole("button", { name: "本文に反映する" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent(/1件を反映しました（1件は本文不一致/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("反映 提示中: 片付け(dismiss)失敗はエラー", async () => {
    mockFetch(jsonResponse({ success: true }), jsonResponse({ success: false }));
    setup(FULL_ADVICE, {
      adviceApply: {
        status: "提示中",
        proposal: [{ fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>新</p>" }],
        raw: "",
      },
      bodyHtml: BODY,
    });
    await userEvent.click(screen.getByRole("button", { name: "本文に反映する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("片付けに失敗しました。");
  });

  it("反映 提示中: 保存失敗(error なし)はフォールバック文言", async () => {
    mockFetch(jsonResponse({ success: false }, false, 502));
    setup(FULL_ADVICE, {
      adviceApply: {
        status: "提示中",
        proposal: [{ fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>新</p>" }],
        raw: "",
      },
      bodyHtml: BODY,
    });
    await userEvent.click(screen.getByRole("button", { name: "本文に反映する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存に失敗しました。");
  });

  it("反映 提示中: 保存失敗はエラー", async () => {
    mockFetch(jsonResponse({ success: false, error: "保存NG" }, false, 502));
    setup(FULL_ADVICE, {
      adviceApply: {
        status: "提示中",
        proposal: [{ fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>新</p>" }],
        raw: "",
      },
      bodyHtml: BODY,
    });
    await userEvent.click(screen.getByRole("button", { name: "本文に反映する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存NG");
  });

  it("反映 提示中: 閉じるで dismiss を POST", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged } = setup(FULL_ADVICE, {
      adviceApply: { status: "提示中", proposal: [], raw: "" },
      bodyHtml: BODY,
    });
    await userEvent.click(screen.getByRole("button", { name: "反映を閉じる" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(String(fetchFn.mock.calls[0][0])).toContain("/api/growth/advise/apply/dismiss");
  });

  it("反映 失敗: 理由と閉じる", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup(FULL_ADVICE, {
      adviceApply: { status: "失敗", proposal: [], raw: "本文が変わりました" },
      bodyHtml: BODY,
    });
    expect(screen.getByText(/本文が変わりました/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "反映を閉じる" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(String(fetchFn.mock.calls[0][0])).toContain("/api/growth/advise/apply/dismiss");
  });
});
