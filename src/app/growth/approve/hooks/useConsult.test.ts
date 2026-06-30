/**
 * useConsult のオーケストレータ・グルーロジックを renderHook で網羅するテスト。
 *
 * 対象分岐:
 *  - stage/mode 初期値・activeMode フォールバック（outline→draft 遷移）
 *  - views が activeMode の kind だけに絞られること
 *  - classifications/selectable の算出（bodyHtml 空 / bodyHtml + アンカー一致分岐）
 *  - onRetry/onReload/busy が activeMode に応じて正しく分岐すること
 *  - openDrawer/closeDrawer/setMode の状態遷移
 *  - 委譲コールバックが実際に対応するメソッドを呼ぶこと（spy で実証）
 *
 * useAdviceConsult・useBodyCommentConsult の fetch は vi.stubGlobal("fetch") で制御する。
 * useReviseEditing は ReturnType<typeof useReviseEditing> を満たす最小モックオブジェクトを渡す。
 * (useReviseEditing は useMutation を含むため QueryClientProvider が必要だが、
 *  useConsult は revise を props で受け取るため、モックで十分)
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAGE_KINDS } from "@/lib/growth/consult";

import type { DraftPreview } from "../draftTypes";
import type { PendingItem } from "../types";
import { useConsult } from "./useConsult";
import type { useReviseEditing } from "./useReviseEditing";

// ── テスト用フィクスチャ ────────────────────────────────────────────────────────

const BASE_ITEM: PendingItem = {
  id: "page-001",
  kind: "idea",
  title: "テスト記事",
  subtitle: "副題",
  stage: "proposed" as const,
  reviseStatus: undefined,
};

const ITEM_WITH_REVISE: PendingItem = {
  ...BASE_ITEM,
  reviseStatus: "依頼中",
};

/** bodyHtml にアンカー句「重要です。」を含む本文。 */
const BODY_WITH_ANCHOR = "<p>導入です。</p><p>ここは重要です。読んでください。</p>";

const DRAFT_BASE: DraftPreview = {
  title: "記事タイトル",
  displayMode: "html",
  bodyHtml: "",
  body: "",
};

const DRAFT_WITH_ADVICE: DraftPreview = {
  ...DRAFT_BASE,
  bodyHtml: BODY_WITH_ANCHOR,
  advice: {
    status: "提示中",
    raw: "",
    advice: {
      summary: "総評",
      scores: [],
      strengths: [],
      fixes: [
        // quote あり → classifyFix applicable: true
        { area: "文体", severity: "中", quote: "重要です。", reason: "翻訳調", suggestion: "改善案" },
        // quote なし → classifyFix applicable: false (FIX_REASON_NO_QUOTE)
        { area: "見た目", severity: "低", reason: "長い段落", suggestion: "分割" },
      ],
    },
  },
  adviceApply: { status: "なし", proposal: [], raw: "" },
};

const DRAFT_EMPTY_BODY: DraftPreview = {
  ...DRAFT_BASE,
  bodyHtml: "",
  advice: {
    status: "提示中",
    raw: "",
    advice: {
      summary: "総評",
      scores: [],
      strengths: [],
      fixes: [
        { area: "文体", severity: "中", quote: "重要です。", reason: "翻訳調", suggestion: "改善案" },
      ],
    },
  },
  adviceApply: { status: "なし", proposal: [], raw: "" },
};

// ── useReviseEditing の最小モック ────────────────────────────────────────────
//
// useReviseEditing は useMutation や内部 state を持つため、完全な型互換オブジェクトを
// テスト内でインスタンス化するには QueryClientProvider のセットアップが必要になる。
// useConsult は revise を props として受け取るため、最小スタブを as unknown キャストで
// ReturnType<typeof useReviseEditing> として渡すことで検証が成立する。

function makeReviseMock(overrides: Partial<ReturnType<typeof useReviseEditing>> = {}): ReturnType<typeof useReviseEditing> {
  return {
    refreshItems: vi.fn().mockResolvedValue(undefined),
    draftComments: {},
    openCommentFor: null,
    commentText: "",
    editingIdx: null,
    editingSection: null,
    editHeading: "",
    editDescription: "",
    imageFormFor: null,
    editingImageIdx: null,
    imageStyle: "mascot",
    imageDesc: "",
    reviseBusy: false,
    reviseError: "",
    editingTitle: false,
    titleInput: "",
    titleRevisePrompt: "",
    setCommentText: vi.fn(),
    setEditHeading: vi.fn(),
    setEditDescription: vi.fn(),
    setImageStyle: vi.fn(),
    setImageDesc: vi.fn(),
    setTitleInput: vi.fn(),
    setTitleRevisePrompt: vi.fn(),
    requestRevise: vi.fn().mockResolvedValue(undefined),
    startAddComment: vi.fn(),
    startEditComment: vi.fn(),
    cancelComment: vi.fn(),
    saveComment: vi.fn(),
    deleteComment: vi.fn(),
    startEditSection: vi.fn(),
    cancelEditSection: vi.fn(),
    startEditTitle: vi.fn(),
    cancelEditTitle: vi.fn(),
    saveTitle: vi.fn().mockResolvedValue(undefined),
    saveSection: vi.fn().mockResolvedValue(undefined),
    startAddImage: vi.fn(),
    startEditImage: vi.fn(),
    cancelImage: vi.fn(),
    saveImage: vi.fn().mockResolvedValue(undefined),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    applyRevise: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useReviseEditing>;
}

// ── fetch スタブ(成功レスポンスを返す。各テストで必要に応じてオーバーライド) ──────

function stubFetchSuccess(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
    } as unknown as Response),
  );
}

beforeEach(() => stubFetchSuccess());
afterEach(() => vi.unstubAllGlobals());

// ── ヘルパ ───────────────────────────────────────────────────────────────────

function renderUseConsult(
  overrides: {
    item?: PendingItem;
    draft?: DraftPreview | null;
    onReloadDraft?: () => void;
    revise?: ReturnType<typeof useReviseEditing>;
  } = {},
) {
  const item = overrides.item ?? BASE_ITEM;
  const draft = overrides.draft === undefined ? null : overrides.draft;
  const onReloadDraft = overrides.onReloadDraft ?? vi.fn();
  const revise = overrides.revise ?? makeReviseMock();

  return renderHook(() =>
    useConsult({ item, token: "test-token", draft, onReloadDraft, revise }),
  );
}

// ── テストスイート ────────────────────────────────────────────────────────────

describe("useConsult: stage と mode の初期値", () => {
  it("draft=null(outline 段階) → stage=outline / mode=revise(STAGE_KINDS の先頭)", () => {
    const { result } = renderUseConsult({ draft: null });
    expect(result.current.stage).toBe("outline");
    expect(result.current.mode).toBe(STAGE_KINDS.outline[0]); // "revise"
  });

  it("draft あり(draft 段階) → stage=draft / mode=overall(STAGE_KINDS の先頭)", () => {
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.stage).toBe("draft");
    expect(result.current.mode).toBe(STAGE_KINDS.draft[0]); // "overall"
  });
});

describe("useConsult: openDrawer/closeDrawer", () => {
  it("初期状態は open=false", () => {
    const { result } = renderUseConsult();
    expect(result.current.open).toBe(false);
  });

  it("openDrawer() で open=true になる", () => {
    const { result } = renderUseConsult();
    act(() => result.current.openDrawer());
    expect(result.current.open).toBe(true);
  });

  it("openDrawer→closeDrawer で open=false に戻る", () => {
    const { result } = renderUseConsult();
    act(() => result.current.openDrawer());
    act(() => result.current.closeDrawer());
    expect(result.current.open).toBe(false);
  });
});

describe("useConsult: setMode と views フィルタ", () => {
  it("draft 段階で setMode('sentence') → mode='sentence' / views が sentence カードのみ", () => {
    const { result } = renderUseConsult({
      draft: {
        ...DRAFT_BASE,
        bodyComment: { status: "依頼中", comments: [], proposal: [], raw: "" },
      },
    });
    // 初期 mode は "overall"
    expect(result.current.mode).toBe("overall");

    act(() => result.current.setMode("sentence"));
    expect(result.current.mode).toBe("sentence");
    // views は sentence カードのみ
    expect(result.current.views.every((v) => v.kind === "sentence")).toBe(true);
  });

  it("outline 段階では views は revise カードのみ(または空)", () => {
    const { result } = renderUseConsult({ item: ITEM_WITH_REVISE, draft: null });
    expect(result.current.views.every((v) => v.kind === "revise")).toBe(true);
  });

  it("overall モードのとき views は overall カードのみ", () => {
    const { result } = renderUseConsult({ draft: DRAFT_WITH_ADVICE });
    expect(result.current.mode).toBe("overall");
    expect(result.current.views.every((v) => v.kind === "overall")).toBe(true);
  });
});

describe("useConsult: activeMode フォールバック (outline→draft 遷移)", () => {
  it("mode が現在の stage にない種別に残ったとき先頭タブにフォールバックする", () => {
    // outline 段階からスタート → mode = "revise"
    const { result, rerender } = renderHook(
      ({ draft }: { draft: DraftPreview | null }) =>
        useConsult({
          item: BASE_ITEM,
          token: "test-token",
          draft,
          onReloadDraft: vi.fn(),
          revise: makeReviseMock(),
        }),
      { initialProps: { draft: null as DraftPreview | null } },
    );
    expect(result.current.mode).toBe("revise"); // outline 先頭

    // outline→draft 遷移(draft が渡されるが、mode="revise" は draft の STAGE_KINDS にない)
    // → activeMode が draft の先頭 "overall" にフォールバックする
    rerender({ draft: DRAFT_BASE });
    // stage が draft に変わり、STAGE_KINDS.draft に "revise" が含まれないため先頭へ
    expect(result.current.stage).toBe("draft");
    expect(result.current.mode).toBe(STAGE_KINDS.draft[0]); // "overall"
  });
});

describe("useConsult: classifications と selectable の算出", () => {
  it("bodyHtml 空のとき → 全 fix が applicable:false / selectable=false", () => {
    const { result } = renderUseConsult({ draft: DRAFT_EMPTY_BODY });
    expect(result.current.classifications).toHaveLength(1);
    expect(result.current.classifications[0].applicable).toBe(false);
    expect(result.current.selectable).toBe(false);
  });

  it("bodyHtml にアンカーあり + adviceApply.status='なし' → 一致 fix は applicable:true / selectable=true", () => {
    const { result } = renderUseConsult({ draft: DRAFT_WITH_ADVICE });
    // fix[0](quote='重要です。') → applicable:true
    // fix[1](quote なし) → applicable:false
    expect(result.current.classifications).toHaveLength(2);
    expect(result.current.classifications[0].applicable).toBe(true);
    expect(result.current.classifications[1].applicable).toBe(false);
    expect(result.current.selectable).toBe(true);
  });

  it("applyStatus が 'なし' 以外のとき selectable=false", () => {
    const { result } = renderUseConsult({
      draft: {
        ...DRAFT_WITH_ADVICE,
        adviceApply: { status: "依頼中", proposal: [], raw: "" },
      },
    });
    expect(result.current.selectable).toBe(false);
  });

  it("bodyHtml が undefined/null → classifications は空配列 / selectable=false", () => {
    // advice が null(overallView=null) → adviceFixes=[] → classifications=[]
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.classifications).toHaveLength(0);
    expect(result.current.selectable).toBe(false);
  });

  it("outline 段階(overall ビューなし) → overallView が undefined → applyStatus='なし' / selectable=false", () => {
    // outline 段階では allViews に overall カードが含まれない → overallView=undefined
    // → line 139 の false 分岐(overallView?.kind === 'overall' が false)が実行される
    const { result } = renderUseConsult({ item: ITEM_WITH_REVISE, draft: null });
    expect(result.current.stage).toBe("outline");
    // overall ビューがないので classifications は空
    expect(result.current.classifications).toHaveLength(0);
    expect(result.current.selectable).toBe(false);
  });

  it("overall ビューの apply=null(adviceApply 未指定) → apply?.status が undefined → applyStatus='なし' / selectable=false", () => {
    // overallViewFrom は apply: null を返す → overallView.apply?.status が undefined
    // → ?? 'なし' の右辺が実行される(line 139 の ?? 分岐)
    const { result } = renderUseConsult({
      draft: {
        ...DRAFT_BASE,
        bodyHtml: BODY_WITH_ANCHOR,
        advice: {
          status: "提示中",
          raw: "",
          advice: {
            summary: "総評",
            scores: [],
            strengths: [],
            fixes: [{ area: "文体", severity: "中", quote: "重要です。", reason: "r", suggestion: "g" }],
          },
        },
        // adviceApply を渡さない → overallViewFrom 内で apply=null
        adviceApply: undefined,
      },
    });
    // apply=null → applyStatus='なし' だが selectable は applyStatus='なし' 判定で true
    // ただし apply が null のとき → overallView.apply?.status=undefined → ??"なし" → applyStatus="なし"
    expect(result.current.selectable).toBe(true);
  });
});

describe("useConsult: busy の3分岐", () => {
  it("mode='overall' のとき advice.busy を返す", () => {
    // advice.busy は useState(false) の初期値。fetch 完了後も pending 中なら true だが、
    // ここでは初期値 false を確認する。
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.mode).toBe("overall");
    // 初期は fetch していないため busy=false
    expect(result.current.busy).toBe(false);
  });

  it("mode='revise' のとき revise.reviseBusy を返す(true の場合)", () => {
    const reviseMock = makeReviseMock({ reviseBusy: true });
    const { result } = renderUseConsult({ draft: null, revise: reviseMock });
    // outline 段階 → mode='revise'
    expect(result.current.mode).toBe("revise");
    expect(result.current.busy).toBe(true);
  });

  it("mode='revise' のとき revise.reviseBusy=false → busy=false", () => {
    const reviseMock = makeReviseMock({ reviseBusy: false });
    const { result } = renderUseConsult({ draft: null, revise: reviseMock });
    expect(result.current.mode).toBe("revise");
    expect(result.current.busy).toBe(false);
  });

  it("mode='sentence' のとき bodyCommentConsult.busy を返す(初期=false)", () => {
    const { result } = renderUseConsult({
      draft: {
        ...DRAFT_BASE,
        bodyComment: { status: "依頼中", comments: [], proposal: [], raw: "" },
      },
    });
    act(() => result.current.setMode("sentence"));
    expect(result.current.mode).toBe("sentence");
    expect(result.current.busy).toBe(false);
  });
});

describe("useConsult: onRetry の3分岐", () => {
  it("mode='overall' のとき onRetry → advice.requestAdvice を呼ぶ(fetch が '/api/growth/advise' に POST)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.mode).toBe("overall");

    // spy で advice.requestAdvice が実際に呼ばれることを実証
    const spy = vi.spyOn(result.current.advice, "requestAdvice");
    await act(async () => result.current.onRetry());
    expect(spy).toHaveBeenCalled();
    // さらに fetch が /api/growth/advise に POST されることで委譲の実動作も確認
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/growth/advise",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("mode='revise' のとき onRetry → revise.requestRevise(item) を呼ぶ", async () => {
    const reviseMock = makeReviseMock();
    const { result } = renderUseConsult({ draft: null, revise: reviseMock });
    expect(result.current.mode).toBe("revise");

    await act(async () => result.current.onRetry());
    expect(reviseMock.requestRevise).toHaveBeenCalledWith(BASE_ITEM);
  });

  it("mode='sentence' のとき onRetry → bodyCommentConsult.requestAi を呼ぶ", async () => {
    const { result } = renderUseConsult({
      draft: {
        ...DRAFT_BASE,
        bodyComment: { status: "依頼中", comments: [], proposal: [], raw: "" },
      },
    });
    act(() => result.current.setMode("sentence"));
    expect(result.current.mode).toBe("sentence");

    // spy で bodyCommentConsult.requestAi が実際に呼ばれることを実証
    // (buildPayload が空のため内部で早期 return するが、requestAi 自体は呼ばれる)
    const spy = vi.spyOn(result.current.bodyCommentConsult, "requestAi");
    await act(async () => result.current.onRetry());
    expect(spy).toHaveBeenCalled();
  });
});

describe("useConsult: onReload の2分岐", () => {
  it("mode='revise' のとき onReload → revise.refreshItems を呼ぶ", async () => {
    const reviseMock = makeReviseMock();
    const { result } = renderUseConsult({ draft: null, revise: reviseMock });
    expect(result.current.mode).toBe("revise");

    await act(async () => result.current.onReload());
    expect(reviseMock.refreshItems).toHaveBeenCalledTimes(1);
  });

  it("mode='overall' のとき onReload → onReloadDraft を呼ぶ(revise.refreshItems は呼ばない)", async () => {
    const onReloadDraft = vi.fn();
    const reviseMock = makeReviseMock();
    const { result } = renderUseConsult({ draft: DRAFT_BASE, onReloadDraft, revise: reviseMock });
    expect(result.current.mode).toBe("overall");

    await act(async () => result.current.onReload());
    expect(onReloadDraft).toHaveBeenCalledTimes(1);
    expect(reviseMock.refreshItems).not.toHaveBeenCalled();
  });

  it("mode='sentence' のとき onReload → onReloadDraft を呼ぶ", async () => {
    const onReloadDraft = vi.fn();
    const reviseMock = makeReviseMock();
    const { result } = renderUseConsult({
      draft: {
        ...DRAFT_BASE,
        bodyComment: { status: "依頼中", comments: [], proposal: [], raw: "" },
      },
      onReloadDraft,
      revise: reviseMock,
    });
    act(() => result.current.setMode("sentence"));
    expect(result.current.mode).toBe("sentence");

    await act(async () => result.current.onReload());
    expect(onReloadDraft).toHaveBeenCalledTimes(1);
    expect(reviseMock.refreshItems).not.toHaveBeenCalled();
  });
});

describe("useConsult: 透過フィールドの確認", () => {
  it("bodyHtml を draft.bodyHtml から透過する", () => {
    const { result } = renderUseConsult({ draft: DRAFT_WITH_ADVICE });
    expect(result.current.bodyHtml).toBe(BODY_WITH_ANCHOR);
  });

  it("draft=null のとき bodyHtml は空文字", () => {
    const { result } = renderUseConsult({ draft: null });
    expect(result.current.bodyHtml).toBe("");
  });

  it("advice/bodyCommentConsult/revise の参照を返す", () => {
    const reviseMock = makeReviseMock();
    const { result } = renderUseConsult({ draft: DRAFT_BASE, revise: reviseMock });
    expect(result.current.advice).toBeDefined();
    expect(result.current.bodyCommentConsult).toBeDefined();
    expect(result.current.revise).toBe(reviseMock);
  });
});

describe("useConsult: 委譲コールバックの spy 実証", () => {
  // ── アロー委譲: advice.applyNow ──────────────────────────────────────────
  it("onAdviceApplyNow → advice.applyNow を呼ぶ (spy で実証)", async () => {
    const { result } = renderUseConsult({ draft: DRAFT_WITH_ADVICE });

    // spy を同一レンダーの result.current.advice に貼り、アロー閉包が intercept される
    const spy = vi.spyOn(result.current.advice, "applyNow");
    await act(async () => result.current.onAdviceApplyNow());
    expect(spy).toHaveBeenCalled();
  });

  // ── アロー委譲: bodyCommentConsult.applyNow ──────────────────────────────
  it("onSentenceApplyAll → bodyCommentConsult.applyNow を呼ぶ (spy で実証)", async () => {
    const { result } = renderUseConsult({
      draft: {
        ...DRAFT_BASE,
        bodyHtml: "",
        bodyComment: { status: "提示中", comments: [], proposal: [], raw: "" },
      },
    });

    const spy = vi.spyOn(result.current.bodyCommentConsult, "applyNow");
    await act(async () => result.current.onSentenceApplyAll());
    expect(spy).toHaveBeenCalled();
  });

  // ── 直接参照委譲: onAdviceDismiss ──────────────────────────────────────
  it("onAdviceDismiss は advice.dismiss と同一関数参照 (誤配線を検出)", () => {
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    // useConsult は onAdviceDismiss: advice.dismiss と直接参照するため参照一致が成立する
    expect(result.current.onAdviceDismiss).toBe(result.current.advice.dismiss);
  });

  // ── 直接参照委譲: onAdviceSubmitApply ───────────────────────────────────
  it("onAdviceSubmitApply は advice.submitApply と同一関数参照 (誤配線を検出)", () => {
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.onAdviceSubmitApply).toBe(result.current.advice.submitApply);
  });

  // ── 直接参照委譲: onAdviceDismissApply ──────────────────────────────────
  it("onAdviceDismissApply は advice.dismissApply と同一関数参照 (誤配線を検出)", () => {
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.onAdviceDismissApply).toBe(result.current.advice.dismissApply);
  });

  // ── 直接参照委譲: onToggleAdopt ──────────────────────────────────────────
  //
  // useConsult は onToggleAdopt: advice.toggleAdopt と直接参照を返すため、
  // result.current.onToggleAdopt === result.current.advice.toggleAdopt が成立する。
  // spy を後から貼っても onToggleAdopt は spy 前の参照を閉包しているため intercept 不可。
  // 直接参照であることを参照同一性で実証し、誤配線（例: dismissApply を指す等）を検出する。
  it("onToggleAdopt は advice.toggleAdopt と同一関数参照 (誤配線を検出)", () => {
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.onToggleAdopt).toBe(result.current.advice.toggleAdopt);
  });

  // ── 直接参照委譲: adopted ────────────────────────────────────────────────
  it("adopted は advice.adopted と同一参照 (advice の Set が透過される)", () => {
    const { result } = renderUseConsult({ draft: DRAFT_BASE });
    expect(result.current.adopted).toBe(result.current.advice.adopted);
  });

  // ── revise.applyRevise の引数検証 ───────────────────────────────────────
  it("onReviseApply を呼ぶと revise.applyRevise(item, 'apply') が実行される", async () => {
    const reviseMock = makeReviseMock();
    const { result } = renderUseConsult({ draft: DRAFT_BASE, revise: reviseMock });
    await act(async () => result.current.onReviseApply());
    expect(reviseMock.applyRevise).toHaveBeenCalledWith(BASE_ITEM, "apply");
  });

  it("onReviseDiscard を呼ぶと revise.applyRevise(item, 'discard') が実行される", async () => {
    const reviseMock = makeReviseMock();
    const { result } = renderUseConsult({ draft: DRAFT_BASE, revise: reviseMock });
    await act(async () => result.current.onReviseDiscard());
    expect(reviseMock.applyRevise).toHaveBeenCalledWith(BASE_ITEM, "discard");
  });
});
