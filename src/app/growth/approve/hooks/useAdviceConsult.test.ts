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

import type { AdviceApplyView } from "@/lib/growth/adviseApply";

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

function setup(opts: { adviceApply?: AdviceApplyView; bodyHtml?: string } = {}) {
  const onChanged = vi.fn();
  const view = renderHook(() =>
    useAdviceConsult({
      pageId: PAGE_ID,
      token: TOKEN,
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
    const { onChanged, view } = setup({ bodyHtml: BODY, adviceApply: APPLY_VIEW });
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/draft/edit");
    expect(fetchFn.mock.calls[1][0]).toBe("/api/growth/advise/apply/dismiss");
    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.bodyHtml).toContain("ここが肝心です。");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(view.result.current.error).toBe("");
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
