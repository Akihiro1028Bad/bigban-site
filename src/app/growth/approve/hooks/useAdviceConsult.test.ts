/**
 * useAdviceConsult(#165: スタイリング・アドバイス相談＋採用→本文反映)の
 * fetch 結線・状態遷移を renderHook で網羅するテスト。
 *
 * もとは AdviceCard 経由で間接検証されていたが、AdviceCard(旧ライト版)の撤去に伴い
 * 直接この live フックを対象にする。fetch は vi.stubGlobal("fetch") で制御する。
 *
 * 対象分岐:
 *  - requestAdvice/dismiss/submitApply/dismissApply の POST(url・Authorization・body・onChanged)
 *  - postJson の失敗(error あり / フォールバック / 非Error reject)
 *  - toggleAdopt の採用集合トグル(追加・削除)
 *  - applyNow の early return / 反映0件 / 成功 / 一部スキップ / 保存失敗 / 片付け失敗 / 非Error reject
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdviceView } from "@/lib/growth/advise";
import { MAX_ADOPTED, type AdviceApplyView } from "@/lib/growth/adviseApply";

import { useAdviceConsult } from "./useAdviceConsult";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const TOKEN = "secret-token";
const BODY = "<p>導入です。</p><p>ここは重要です。読んでください。</p>";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function mockFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setup(opts: { advice?: AdviceView; adviceApply?: AdviceApplyView; bodyHtml?: string } = {}) {
  const onChanged = vi.fn();
  const view = renderHook(() =>
    useAdviceConsult({
      pageId: PAGE_ID,
      token: TOKEN,
      advice: opts.advice,
      adviceApply: opts.adviceApply,
      bodyHtml: opts.bodyHtml,
      onChanged,
    }),
  );
  return { onChanged, view };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("requestAdvice", () => {
  it("指示を trim して POST し onChanged を呼ぶ", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged, view } = setup();
    act(() => view.result.current.setInstruction("  見た目も  "));
    act(() => view.result.current.requestAdvice());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/growth/advise");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({ pageId: PAGE_ID, instruction: "見た目も" });
    expect(view.result.current.busy).toBe(false);
  });

  it("失敗(error あり)はその文言を出し onChanged を呼ばない", async () => {
    mockFetch(jsonResponse({ success: false, error: "下書きがありません" }, false, 400));
    const { onChanged, view } = setup();
    act(() => view.result.current.requestAdvice());
    await waitFor(() => expect(view.result.current.error).toBe("下書きがありません"));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("失敗(error なし)はフォールバック文言", async () => {
    mockFetch(jsonResponse({ success: false }));
    const { view } = setup();
    act(() => view.result.current.requestAdvice());
    await waitFor(() => expect(view.result.current.error).toBe("アドバイス依頼に失敗しました。"));
  });

  it("非Error reject でもフォールバック文言", async () => {
    const fn = vi.fn().mockRejectedValueOnce("boom");
    vi.stubGlobal("fetch", fn);
    const { view } = setup();
    act(() => view.result.current.requestAdvice());
    await waitFor(() => expect(view.result.current.error).toBe("アドバイス依頼に失敗しました。"));
  });
});

describe("dismiss / submitApply / dismissApply", () => {
  it("dismiss は片付け API を叩く", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged, view } = setup();
    act(() => view.result.current.dismiss());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/advise/dismiss");
  });

  it("submitApply は採用 index 配列付きで反映依頼する", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged, view } = setup();
    act(() => view.result.current.toggleAdopt(1));
    act(() => view.result.current.toggleAdopt(3));
    act(() => view.result.current.submitApply());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/growth/advise/apply");
    expect(JSON.parse(init.body as string)).toEqual({ pageId: PAGE_ID, adoptedIndexes: [1, 3] });
  });

  it("dismissApply は反映の片付け API を叩く", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { onChanged, view } = setup();
    act(() => view.result.current.dismissApply());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/advise/apply/dismiss");
  });
});

describe("toggleAdopt", () => {
  it("同じ index の再トグルで採用が外れる", () => {
    const { view } = setup();
    act(() => view.result.current.toggleAdopt(2));
    expect([...view.result.current.adopted]).toEqual([2]);
    act(() => view.result.current.toggleAdopt(2));
    expect([...view.result.current.adopted]).toEqual([]);
  });
});

describe("setAdoptedBulk", () => {
  it("adopt=true は既存採用を保持して和集合で追加する", () => {
    const { view } = setup();
    act(() => view.result.current.toggleAdopt(1));
    act(() => view.result.current.setAdoptedBulk([0, 2], true));
    expect(new Set(view.result.current.adopted)).toEqual(new Set([0, 1, 2]));
  });

  it("adopt=false は指定 index を差集合で外す", () => {
    const { view } = setup();
    act(() => view.result.current.setAdoptedBulk([0, 1, 2, 3], true));
    act(() => view.result.current.setAdoptedBulk([1, 3], false));
    expect(new Set(view.result.current.adopted)).toEqual(new Set([0, 2]));
  });

  it("adopt=true は MAX_ADOPTED 件まで先頭優先でクランプする", () => {
    const { view } = setup();
    const indexes = Array.from({ length: MAX_ADOPTED + 5 }, (_, i) => i);
    act(() => view.result.current.setAdoptedBulk(indexes, true));
    expect(view.result.current.adopted.size).toBe(MAX_ADOPTED);
    expect([...view.result.current.adopted]).toEqual(
      Array.from({ length: MAX_ADOPTED }, (_, i) => i),
    );
  });

  it("pageId が変わると一括採用した集合も初期化される", () => {
    const onChanged = vi.fn();
    const view = renderHook(
      ({ pageId }: { pageId: string }) =>
        useAdviceConsult({ pageId, token: TOKEN, onChanged }),
      { initialProps: { pageId: "page-A" } },
    );
    act(() => view.result.current.setAdoptedBulk([0, 1], true));
    expect([...view.result.current.adopted]).toEqual([0, 1]);

    view.rerender({ pageId: "page-B" });
    expect([...view.result.current.adopted]).toEqual([]);
  });
});

describe("pageId 変化での state リセット(記事跨ぎ持ち越し防止)", () => {
  it("pageId が変わると instruction と adopted が初期化される(別記事への誤送信を防ぐ)", () => {
    const onChanged = vi.fn();
    const view = renderHook(
      ({ pageId }: { pageId: string }) =>
        useAdviceConsult({ pageId, token: TOKEN, onChanged }),
      { initialProps: { pageId: "page-A" } },
    );
    // 記事Aで指示文を書き、採用チェックを付ける。
    act(() => view.result.current.setInstruction("記事Aの指示"));
    act(() => view.result.current.toggleAdopt(0));
    expect(view.result.current.instruction).toBe("記事Aの指示");
    expect([...view.result.current.adopted]).toEqual([0]);

    // 記事Bへ切替 → instruction は空、adopted は空集合へリセット。
    view.rerender({ pageId: "page-B" });
    expect(view.result.current.instruction).toBe("");
    expect([...view.result.current.adopted]).toEqual([]);
  });

  it("同じ pageId の再レンダーでは instruction を持ち越す(不要なリセットを起こさない)", () => {
    const onChanged = vi.fn();
    const view = renderHook(
      ({ pageId }: { pageId: string }) =>
        useAdviceConsult({ pageId, token: TOKEN, onChanged }),
      { initialProps: { pageId: "page-A" } },
    );
    act(() => view.result.current.setInstruction("保持される"));
    view.rerender({ pageId: "page-A" });
    expect(view.result.current.instruction).toBe("保持される");
  });
});

describe("applyNow", () => {
  const APPLY_VIEW: AdviceApplyView = {
    status: "提示中",
    raw: "",
    proposal: [
      { fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>ここが肝心です。</p>" },
    ],
  };

  it("bodyHtml が無ければ何もしない(early return)", async () => {
    const fetchFn = mockFetch();
    const { view } = setup({ adviceApply: APPLY_VIEW });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(view.result.current.error).toBe("");
  });

  it("adviceApply が無ければ何もしない(early return)", async () => {
    const fetchFn = mockFetch();
    const { view } = setup({ bodyHtml: BODY });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("提示案をすべて選択解除した場合は何もしない(early return)", async () => {
    const fetchFn = mockFetch();
    const { view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW });
    act(() => view.result.current.toggleApplySelect(0));
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(view.result.current.error).toBe("");
  });

  it("反映できる案が無ければ error を出し fetch しない", async () => {
    const fetchFn = mockFetch();
    const view = setup({
      bodyHtml: BODY,
      adviceApply: {
        status: "提示中",
        raw: "",
        proposal: [{ fixIndex: 0, before: "<p>存在しない段落。</p>", after: "<p>置換。</p>" }],
      },
    });
    await act(async () => {
      await view.view.result.current.applyNow();
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(view.view.result.current.error).toBe(
      "反映できる案がありませんでした（本文が変わった可能性・要確認）。",
    );
  });

  it("成功: 保存→片付け→onChanged、エラーは空", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const advice: AdviceView = {
      status: "提示中",
      raw: "",
      advice: {
        summary: "全体",
        scores: [],
        strengths: [],
        fixes: [
          {
            area: "読みやすさ",
            severity: "中",
            reason: "冗長",
            suggestion: "短くする",
          },
        ],
      },
    };
    const { onChanged, view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW, advice });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/draft/edit");
    expect(fetchFn.mock.calls[1][0]).toBe("/api/growth/advise/apply/dismiss");
    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.bodyHtml).toContain("ここが肝心です。");
    expect(saveBody.source).toBe("advise-apply");
    expect(saveBody.adoptedAspects).toEqual(["読みやすさ"]);
    // #学習ログ詳細化: 観点だけでなく指摘・変更前後も送る。
    expect(saveBody.adoptedFixes).toEqual([
      {
        aspect: "読みやすさ",
        detail: "指摘: 冗長 / 提案: 短くする",
        before: "<p>ここは重要です。読んでください。</p>",
        after: "<p>ここが肝心です。</p>",
      },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(view.result.current.error).toBe("");
  });

  it("adoptedFixes: quote があれば detail に「対象」を付ける", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const advice: AdviceView = {
      status: "提示中",
      raw: "",
      advice: {
        summary: "全体",
        scores: [],
        strengths: [],
        fixes: [
          {
            area: "文体",
            severity: "中",
            quote: "読んでください",
            reason: "指示口調",
            suggestion: "和らげる",
          },
        ],
      },
    };
    const { view } = setup({
      bodyHtml: BODY,
      adviceApply: {
        status: "提示中",
        raw: "",
        proposal: [
          { fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>肝心です。</p>" },
        ],
      },
      advice,
    });
    await act(async () => {
      await view.result.current.applyNow();
    });
    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.adoptedFixes).toEqual([
      {
        aspect: "文体",
        detail: "指摘: 指示口調 / 提案: 和らげる（対象: 読んでください）",
        before: "<p>ここは重要です。読んでください。</p>",
        after: "<p>肝心です。</p>",
      },
    ]);
  });

  it("adoptedFixes: fix 本体が見つからなくても before/after は残り観点・指摘は空になる", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    // proposal の fixIndex がアドバイスの fixes 範囲外(=対応 fix なし)。
    // before/after は proposal から確実に残り、area/reason/suggestion は空でフォールバック。
    const { view } = setup({
      bodyHtml: BODY,
      adviceApply: {
        status: "提示中",
        raw: "",
        proposal: [
          { fixIndex: 9, before: "<p>ここは重要です。読んでください。</p>", after: "<p>肝心です。</p>" },
        ],
      },
      advice: { status: "提示中", raw: "", advice: { summary: "s", scores: [], strengths: [], fixes: [] } },
    });
    await act(async () => {
      await view.result.current.applyNow();
    });
    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.adoptedFixes).toEqual([
      {
        aspect: "",
        detail: "指摘:  / 提案: ",
        before: "<p>ここは重要です。読んでください。</p>",
        after: "<p>肝心です。</p>",
      },
    ]);
    // fix が無いので観点も空文字。
    expect(saveBody.adoptedAspects).toEqual([""]);
  });

  it("一部スキップ時は件数メッセージを出す", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const { view } = setup({
      bodyHtml: BODY,
      adviceApply: {
        status: "提示中",
        raw: "",
        proposal: [
          { fixIndex: 0, before: "<p>ここは重要です。読んでください。</p>", after: "<p>肝心です。</p>" },
          { fixIndex: 1, before: "<p>存在しない段落。</p>", after: "<p>置換。</p>" },
        ],
      },
    });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(view.result.current.error).toBe("1件を反映しました（1件は本文不一致でスキップ）。");
  });

  it("保存失敗(error あり)はその文言を出す", async () => {
    mockFetch(jsonResponse({ success: false, error: "保存できません" }, false, 400));
    const { onChanged, view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(view.result.current.error).toBe("保存できません");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("保存失敗(error なし)はフォールバック文言", async () => {
    mockFetch(jsonResponse({ success: false }));
    const { view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(view.result.current.error).toBe("保存に失敗しました。");
  });

  it("片付け失敗(error あり)はその文言を出す", async () => {
    mockFetch(jsonResponse({ success: true }), jsonResponse({ success: false, error: "片付け不可" }, false, 400));
    const { view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(view.result.current.error).toBe("片付け不可");
  });

  it("片付け失敗(error なし)はフォールバック文言", async () => {
    mockFetch(jsonResponse({ success: true }), jsonResponse({ success: false }));
    const { view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(view.result.current.error).toBe("片付けに失敗しました。");
  });

  it("非Error reject はフォールバック文言", async () => {
    const fn = vi.fn().mockRejectedValueOnce("boom");
    vi.stubGlobal("fetch", fn);
    const { view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(view.result.current.error).toBe("反映に失敗しました。");
  });
});

describe("提示後の案ごとの選択と却下ログ", () => {
  const TWO_PROPOSALS: AdviceApplyView = {
    status: "提示中",
    raw: "",
    proposal: [
      { fixIndex: 0, before: "<p>導入です。</p>", after: "<p>新しい導入です。</p>" },
      { fixIndex: 1, before: "<p>ここは重要です。読んでください。</p>", after: "<p>重要です。</p>" },
    ],
  };

  const ADVICE: AdviceView = {
    status: "提示中",
    raw: "",
    advice: {
      summary: "全体",
      scores: [],
      strengths: [],
      fixes: [
        { area: "読みやすさ", severity: "中", quote: "導入です。", reason: "冗長", suggestion: "短くする" },
        { area: "文体", severity: "中", quote: "読んでください", reason: "指示的", suggestion: "和らげる" },
      ],
    },
  };

  it("applySelected は全選択で始まり、toggle・pageId・proposal の変化でリセットする", () => {
    const onChanged = vi.fn();
    const view = renderHook(
      ({ pageId, adviceApply }: { pageId: string; adviceApply: AdviceApplyView }) =>
        useAdviceConsult({ pageId, token: TOKEN, adviceApply, onChanged }),
      { initialProps: { pageId: "page-A", adviceApply: TWO_PROPOSALS } },
    );
    expect(new Set(view.result.current.applySelected)).toEqual(new Set([0, 1]));
    act(() => view.result.current.toggleApplySelect(1));
    expect(new Set(view.result.current.applySelected)).toEqual(new Set([0]));

    view.rerender({ pageId: "page-B", adviceApply: TWO_PROPOSALS });
    expect(new Set(view.result.current.applySelected)).toEqual(new Set([0, 1]));
    act(() => view.result.current.toggleApplySelect(0));
    act(() => view.result.current.toggleApplySelect(0));
    expect(new Set(view.result.current.applySelected)).toEqual(new Set([0, 1]));
    view.rerender({
      pageId: "page-B",
      adviceApply: { ...TWO_PROPOSALS, proposal: [TWO_PROPOSALS.proposal[1]] },
    });
    expect(new Set(view.result.current.applySelected)).toEqual(new Set([1]));
  });

  it("同じ記事で提示案だけが変わっても選択を新しい案の全選択へ戻す", () => {
    const onChanged = vi.fn();
    const view = renderHook(
      ({ adviceApply }: { adviceApply: AdviceApplyView }) =>
        useAdviceConsult({ pageId: "page-A", token: TOKEN, adviceApply, onChanged }),
      { initialProps: { adviceApply: TWO_PROPOSALS } },
    );
    act(() => view.result.current.toggleApplySelect(1));
    expect(new Set(view.result.current.applySelected)).toEqual(new Set([0]));

    view.rerender({
      adviceApply: { ...TWO_PROPOSALS, proposal: [TWO_PROPOSALS.proposal[1]] },
    });
    expect(new Set(view.result.current.applySelected)).toEqual(new Set([1]));
  });

  it("同じ fixIndex の提示内容が更新された場合も全選択へ戻す", () => {
    const onChanged = vi.fn();
    const view = renderHook(
      ({ adviceApply }: { adviceApply: AdviceApplyView }) =>
        useAdviceConsult({ pageId: "page-A", token: TOKEN, adviceApply, onChanged }),
      { initialProps: { adviceApply: TWO_PROPOSALS } },
    );
    act(() => view.result.current.toggleApplySelect(1));

    view.rerender({
      adviceApply: {
        ...TWO_PROPOSALS,
        proposal: TWO_PROPOSALS.proposal.map((item) =>
          item.fixIndex === 1 ? { ...item, after: "<p>更新された案です。</p>" } : item,
        ),
      },
    });

    expect(new Set(view.result.current.applySelected)).toEqual(new Set([0, 1]));
  });

  it("提示案が消えた場合も同じ記事の選択を空集合へ戻す", () => {
    const onChanged = vi.fn();
    const view = renderHook(
      ({ adviceApply }: { adviceApply?: AdviceApplyView }) =>
        useAdviceConsult({ pageId: "page-A", token: TOKEN, adviceApply, onChanged }),
      { initialProps: { adviceApply: TWO_PROPOSALS } as { adviceApply?: AdviceApplyView } },
    );
    view.rerender({ adviceApply: undefined });
    expect(new Set(view.result.current.applySelected)).toEqual(new Set());
  });

  it("applyNow は選択分だけを保存し、非選択の案を却下ログへ送る", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
    );
    const { view } = setup({ bodyHtml: BODY, adviceApply: TWO_PROPOSALS, advice: ADVICE });
    act(() => view.result.current.toggleApplySelect(1));
    await act(async () => {
      await view.result.current.applyNow();
    });
    const save = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(save.bodyHtml).toContain("新しい導入です。");
    expect(save.bodyHtml).toContain("読んでください。");
    expect(save.adoptedFixes).toHaveLength(1);
    expect(fetchFn.mock.calls[2][0]).toBe("/api/growth/learning-log/reject");
    expect(JSON.parse((fetchFn.mock.calls[2][1] as RequestInit).body as string)).toEqual({
      pageId: PAGE_ID,
      source: "advise-apply",
      rejectedFixes: [{
        aspect: "文体",
        detail: "指摘: 指示的 / 提案: 和らげる（対象: 読んでください）",
        before: "<p>ここは重要です。読んでください。</p>",
        after: "<p>重要です。</p>",
      }],
    });
  });

  it("applyNow は全選択なら却下ログを送らない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const { view } = setup({ bodyHtml: BODY, adviceApply: TWO_PROPOSALS, advice: ADVICE });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls.map(([url]) => url)).not.toContain("/api/growth/learning-log/reject");
  });

  it("submitApply は成功時だけ非採用の適用可能 fix を却下ログへ送り、適用不能 fix は除く", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const { view } = setup({
      bodyHtml: BODY,
      advice: {
        ...ADVICE,
        advice: { ...ADVICE.advice!, fixes: [...ADVICE.advice!.fixes, { area: "構成", severity: "低", reason: "対象なし", suggestion: "直す" }] },
      },
    });
    act(() => view.result.current.toggleAdopt(0));
    act(() => view.result.current.submitApply());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe("/api/growth/learning-log/reject");
    const rejected = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string).rejectedFixes;
    expect(rejected).toEqual([{
      aspect: "文体",
      detail: "指摘: 指示的 / 提案: 和らげる（対象: 読んでください）",
      before: "読んでください",
      after: "和らげる",
    }]);
  });

  it("submitApply の依頼失敗時は却下ログを送らない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: false }, false, 400));
    const { view } = setup({ bodyHtml: BODY, advice: ADVICE });
    act(() => view.result.current.submitApply());
    await waitFor(() => expect(view.result.current.error).toBe("反映依頼に失敗しました。"));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("submitApply は本文が無い成功時、却下ログを送らない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { view } = setup({ advice: ADVICE });
    act(() => view.result.current.submitApply());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/advise/apply");
  });

  it("submitApply は advice が無くても本文があれば空の却下候補を処理する", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { view } = setup({ bodyHtml: BODY });
    act(() => view.result.current.submitApply());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/advise/apply");
  });

  it("submitApply は提案が空でも適用可能な fix の空の suggestion を詳細へ記録する", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const { view } = setup({
      bodyHtml: BODY,
      advice: {
        status: "提示中",
        raw: "",
        advice: {
          summary: "全体",
          scores: [],
          strengths: [],
          fixes: [{ area: "読みやすさ", severity: "中", quote: "導入です。", reason: "冗長", suggestion: "" }],
        },
      },
    });
    act(() => view.result.current.submitApply());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    const rejected = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string).rejectedFixes;
    expect(rejected).toEqual([{
      aspect: "読みやすさ",
      detail: "指摘: 冗長 / 提案: （対象: 導入です。）",
      before: "導入です。",
      after: "",
    }]);
  });

  it("submitApply は採用済み・不適用 fix を却下ログから除外する", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const { view } = setup({
      bodyHtml: BODY,
      advice: {
        ...ADVICE,
        advice: {
          ...ADVICE.advice!,
          fixes: [
            ADVICE.advice!.fixes[0],
            { area: "タイトル", severity: "低", quote: "読んでください", reason: "対象外", suggestion: "変更" },
          ],
        },
      },
    });
    act(() => view.result.current.toggleAdopt(0));
    act(() => view.result.current.submitApply());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/advise/apply");
  });

  it("dismissApply は成功時に提示案すべてを却下ログへ送り、却下ログ失敗はエラーにしない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: false }, false, 500));
    const { onChanged, view } = setup({ adviceApply: TWO_PROPOSALS, advice: ADVICE });
    act(() => view.result.current.dismissApply());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn.mock.calls[1][0]).toBe("/api/growth/learning-log/reject");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(view.result.current.error).toBe("");
  });

  it("dismissApply は quote が空白でも対象表記なしの詳細を却下ログへ残す", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const { view } = setup({
      adviceApply: { status: "提示中", raw: "", proposal: [TWO_PROPOSALS.proposal[0]] },
      advice: {
        ...ADVICE,
        advice: {
          ...ADVICE.advice!,
          fixes: [{ ...ADVICE.advice!.fixes[0], quote: "   " }],
        },
      },
    });
    act(() => view.result.current.dismissApply());
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    const rejected = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string).rejectedFixes;
    expect(rejected[0].detail).toBe("指摘: 冗長 / 提案: 短くする");
  });

  it("dismissApply の片付け失敗時は却下ログを送らない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: false }, false, 400));
    const { view } = setup({ adviceApply: TWO_PROPOSALS, advice: ADVICE });
    act(() => view.result.current.dismissApply());
    await waitFor(() => expect(view.result.current.error).toBe("反映の片付けに失敗しました。"));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
