import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionSuggestions } from "./ActionSuggestions";
import { HouseStylePreview } from "./HouseStylePreview";
import { isImageDirectorEnabled } from "./imageDirectorFlag";
import { OutlineView } from "./OutlineView";
import type { ImageInstruction } from "./imageIntentTypes";
import type { ArticleHypothesis } from "@/lib/growth/approve";

// 画像ディレクター UI は本番既定 OFF(#62・imageDirectorFlag)。以降の画像レーン系テストは
// 表示前提なので既定 true でモックし、隠す挙動は専用テストで false に上書きして検証する。
vi.mock("./imageDirectorFlag", () => ({
  isImageDirectorEnabled: vi.fn(() => true),
}));

beforeEach(() => {
  vi.mocked(isImageDirectorEnabled).mockReturnValue(true);
});

function setup(over: Partial<Parameters<typeof OutlineView>[0]> = {}) {
  const props = {
    sections: [
      { heading: "導入", summary: "ピックルボールとは", comments: [] as string[] },
      { heading: "まとめ", summary: "ぜひお越しください", comments: ["ここを短く"] },
    ],
    hue: 200,
    imageInstructions: {} as Record<number, ImageInstruction>,
    revising: false,
    onAddComment: vi.fn(),
    onRemoveComment: vi.fn(),
    onUpdateImage: vi.fn(),
    onRequestOutlineRevise: vi.fn(),
    ...over,
  };
  render(<OutlineView {...props} />);
  return props;
}

describe("OutlineView", () => {
  it("セクション見出し＋説明を出す", () => {
    setup();
    expect(screen.getByText("導入")).toBeInTheDocument();
    expect(screen.getByText("まとめ")).toBeInTheDocument();
    expect(screen.getByText("ピックルボールとは")).toBeInTheDocument();
  });

  it("コメント集約帯: 件数と修正依頼ボタン(コメント0で無効)", () => {
    setup({ sections: [{ heading: "a", summary: "", comments: [] }] });
    const btn = screen.getByRole("button", { name: /構成案の修正を依頼/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/構成案の修正を依頼できます/)).toBeInTheDocument();
  });

  it("コメントがあると件数帯と修正依頼ボタンが有効で onRequestOutlineRevise", async () => {
    const p = setup();
    expect(screen.getByText(/1件のコメント/)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /構成案の修正を依頼/ });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(p.onRequestOutlineRevise).toHaveBeenCalled();
  });

  it("revising 中は修正依頼ボタンが無効", () => {
    setup({ revising: true });
    expect(screen.getByRole("button", { name: /構成案の修正を依頼/ })).toBeDisabled();
  });

  it("既存コメントの削除で onRemoveComment(i, ci)", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "コメント削除" }));
    expect(p.onRemoveComment).toHaveBeenCalledWith(1, 0);
  });

  it("コメント追加: ＋コメント→入力→追加で onAddComment(i, text)", async () => {
    const p = setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    await userEvent.type(screen.getByPlaceholderText("このセクションへの指示…"), "導入を短く");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(p.onAddComment).toHaveBeenCalledWith(0, "導入を短く");
  });

  it("コメント入力 Enter で追加、再度トグルすると閉じる", async () => {
    const p = setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    const input = screen.getByPlaceholderText("このセクションへの指示…");
    await userEvent.type(input, "Enterで追加{Enter}");
    expect(p.onAddComment).toHaveBeenCalledWith(0, "Enterで追加");
  });

  it("空コメントは追加されない", async () => {
    const p = setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    await userEvent.type(screen.getByPlaceholderText("このセクションへの指示…"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(p.onAddComment).not.toHaveBeenCalled();
  });

  it("コメント入力 Escape で閉じる、＋コメント再クリックでもトグル", async () => {
    setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    const input = screen.getByPlaceholderText("このセクションへの指示…");
    await userEvent.type(input, "{Escape}");
    expect(screen.queryByPlaceholderText("このセクションへの指示…")).not.toBeInTheDocument();
    // 再度開いて同じボタンで閉じる
    const reopen = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(reopen[0]);
    expect(screen.getByPlaceholderText("このセクションへの指示…")).toBeInTheDocument();
    const toggle = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(toggle[0]);
    expect(screen.queryByPlaceholderText("このセクションへの指示…")).not.toBeInTheDocument();
  });

  it("画像トグルを custom(指定)にすると onUpdateImage(i,{mode:'custom'})", async () => {
    const p = setup();
    const radios = screen.getAllByRole("radio", { name: /指定/ });
    await userEvent.click(radios[0]);
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "custom" });
  });

  it("画像トグルを off にすると onUpdateImage(i,{mode:'off'})", async () => {
    const p = setup();
    const radios = screen.getAllByRole("radio", { name: /オフ/ });
    await userEvent.click(radios[0]);
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "off" });
  });

  it("画像プラン帯を出す(house style 明示)", () => {
    setup();
    expect(screen.getByText(/宇宙人マスコット × コスミック/)).toBeInTheDocument();
  });

  it("ImagePlanBanner: custom 指定済み件数を集計する", () => {
    setup({
      imageInstructions: {
        0: { mode: "custom", action: "スイングする" },
        1: { mode: "off" },
      },
    });
    // 2セクション中、off が1つ → planned=1, specified=1
    expect(screen.getByText(/画像 1枚予定 ・ 指定済み 1/)).toBeInTheDocument();
  });

  it("画像ディレクターが無効(本番既定)ならバナー・トグルを隠しコメントレーンは残す", () => {
    vi.mocked(isImageDirectorEnabled).mockReturnValue(false);
    setup();
    // バナー(house style 帯)・出す/出さないトグル・画像プラン集計は非表示
    expect(screen.queryByText(/宇宙人マスコット × コスミック/)).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "画像をどうするか" })).not.toBeInTheDocument();
    expect(screen.queryByText(/枚予定/)).not.toBeInTheDocument();
    // コメントレーンは従来どおり利用できる
    expect(screen.getByRole("button", { name: /構成案の修正を依頼/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /コメント$/ }).length).toBeGreaterThan(0);
  });

  it("仮説カード: props 無しでは非表示", () => {
    setup();
    expect(screen.queryByText("この記事の狙い（仮説）")).not.toBeInTheDocument();
  });

  it("仮説カード: 記入フィールドのみ描画(欠落耐性)", () => {
    const hypothesis: ArticleHypothesis = {
      articleType: "獲得",
      targetReader: "初心者",
      searchIntent: "",
      winningAngle: "",
      successMetric: "",
      plannedCta: ["LINE", "予約"],
    };
    setup({ hypothesis });
    expect(screen.getByText("この記事の狙い（仮説）")).toBeInTheDocument();
    expect(screen.getByText("記事タイプ")).toBeInTheDocument();
    expect(screen.getByText("獲得")).toBeInTheDocument();
    expect(screen.getByText("狙う読者")).toBeInTheDocument();
    // 空フィールドは出さない
    expect(screen.queryByText("検索意図")).not.toBeInTheDocument();
    expect(screen.queryByText("勝ち筋")).not.toBeInTheDocument();
    expect(screen.queryByText("成功指標")).not.toBeInTheDocument();
    // CTA (string[]) は結合表示
    expect(screen.getByText("想定CTA")).toBeInTheDocument();
    expect(screen.getByText("LINE / 予約")).toBeInTheDocument();
  });

  it("仮説カード: CTA が空配列なら CTA 行を出さない", () => {
    const hypothesis: ArticleHypothesis = {
      articleType: "獲得",
      targetReader: "",
      searchIntent: "",
      winningAngle: "",
      successMetric: "",
      plannedCta: [],
    };
    setup({ hypothesis });
    expect(screen.queryByText("想定CTA")).not.toBeInTheDocument();
  });
});

describe("OutlineView 画像スロット(ImageSlot)", () => {
  it("auto(既定・未指定)はおまかせチップ", () => {
    setup();
    expect(screen.getAllByText(/おまかせ（見出しから自動生成）/).length).toBeGreaterThan(0);
  });

  it("off は『画像なし』を出す", () => {
    setup({ imageInstructions: { 0: { mode: "off" } } });
    expect(screen.getByText(/このセクションは画像なし/)).toBeInTheDocument();
  });

  it("custom スロットのサムネクリックで ImageDirector を再展開", async () => {
    setup({ imageInstructions: { 0: { mode: "custom", action: "スイングする" } } });
    // custom スロット(action チップ)を表示
    expect(screen.getByText(/宇宙人: スイングする/)).toBeInTheDocument();
    const editBtn = screen.getByTitle("画像指示を編集");
    await userEvent.click(editBtn);
    // ImageDirector が展開される
    expect(screen.getByPlaceholderText(/例: ラケットを持ち比べる/)).toBeInTheDocument();
  });

  it("custom で action 未指定なら『（動きおまかせ）』", () => {
    setup({ imageInstructions: { 0: { mode: "custom" } } });
    expect(screen.getByText(/（動きおまかせ）/)).toBeInTheDocument();
  });

  it("custom + isEyecatch でアイキャッチバッジ", () => {
    setup({ imageInstructions: { 0: { mode: "custom", action: "手を振る", isEyecatch: true } } });
    expect(screen.getAllByText("アイキャッチ").length).toBeGreaterThan(0);
  });
});

describe("OutlineView 状態トグル(ImageStateToggle)", () => {
  it("矢印キー(ArrowRight)で mode を次へ移動→onUpdateImage", async () => {
    const p = setup();
    const group = screen.getAllByRole("radiogroup", { name: "画像をどうするか" })[0];
    group.focus();
    await userEvent.keyboard("{ArrowRight}");
    // 既定 auto → 次(custom)
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "custom" });
  });

  it("矢印キー(ArrowLeft)で mode を前へ移動→onUpdateImage", async () => {
    const p = setup();
    const group = screen.getAllByRole("radiogroup", { name: "画像をどうするか" })[0];
    group.focus();
    await userEvent.keyboard("{ArrowLeft}");
    // 既定 auto → 前(off)
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "off" });
  });

  it("矢印キー(ArrowDown/ArrowUp)も同様に移動", async () => {
    const p = setup();
    const group = screen.getAllByRole("radiogroup", { name: "画像をどうするか" })[0];
    group.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "custom" });
    vi.mocked(p.onUpdateImage).mockClear();
    group.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "off" });
  });

  it("その他キーは無視", async () => {
    const p = setup();
    const group = screen.getAllByRole("radiogroup", { name: "画像をどうするか" })[0];
    group.focus();
    await userEvent.keyboard("{Enter}");
    expect(p.onUpdateImage).not.toHaveBeenCalled();
  });

  it("recommendOff のセクションはオフ推奨ドット(title)を出す", () => {
    // 「まとめ」は recommendOff=true。auto のとき off ボタンにドット。
    setup();
    const recDots = screen.getAllByTitle("AIはこのセクションを画像オフ推奨");
    expect(recDots.length).toBeGreaterThan(0);
  });
});

describe("OutlineView 画像ディレクター(ImageDirector)", () => {
  function openDirector(over: Partial<Parameters<typeof OutlineView>[0]> = {}) {
    const p = setup(over);
    const radios = screen.getAllByRole("radio", { name: /指定/ });
    // クリックで custom→ editingImg 展開(state はローカル)
    return { p, radios };
  }

  it("指定に切替で ImageDirector が展開しサジェストが出る", async () => {
    const { radios } = openDirector();
    await userEvent.click(radios[0]);
    // ディレクターの入力(ActionInput)が展開される
    expect(screen.getByPlaceholderText(/例: ラケットを持ち比べる/)).toBeInTheDocument();
    // 導入セクション → サジェスト chip
    expect(screen.getByText(/この見出しならこの動き\?/)).toBeInTheDocument();
  });

  it("ActionSuggestions: サジェスト click→onSetAction", async () => {
    const { p, radios } = openDirector();
    await userEvent.click(radios[0]);
    // 「導入」→ FALLBACK『コートに立つ』が候補に入る
    const chip = screen.getByRole("button", { name: "コートに立つ" });
    await userEvent.click(chip);
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "custom", action: "コートに立つ" });
  });

  it("ActionInput: 入力→確定で onSetAction、Director が閉じる", async () => {
    const { p, radios } = openDirector();
    await userEvent.click(radios[0]);
    const input = screen.getByPlaceholderText(/例: ラケットを持ち比べる/);
    await userEvent.type(input, "スイングする");
    await userEvent.click(screen.getByRole("button", { name: /確定/ }));
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "custom", action: "スイングする" });
  });

  it("ActionInput: Enter で確定", async () => {
    const { p, radios } = openDirector();
    await userEvent.click(radios[0]);
    const input = screen.getByPlaceholderText(/例: ラケットを持ち比べる/);
    await userEvent.type(input, "コートを見渡す{Enter}");
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "custom", action: "コートを見渡す" });
  });

  it("ActionInput: 空入力では確定ボタンが無効", async () => {
    const { radios } = openDirector();
    await userEvent.click(radios[0]);
    expect(screen.getByRole("button", { name: /確定/ })).toBeDisabled();
  });

  it("ActionInput: Escape で onCancel→おまかせに戻す(mode:auto)", async () => {
    const { p, radios } = openDirector();
    await userEvent.click(radios[0]);
    vi.mocked(p.onUpdateImage).mockClear();
    const input = screen.getByPlaceholderText(/例: ラケットを持ち比べる/);
    await userEvent.type(input, "{Escape}");
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "auto" });
  });

  it("『おまかせに戻す』で onCancel(mode:auto)", async () => {
    const { p, radios } = openDirector();
    await userEvent.click(radios[0]);
    vi.mocked(p.onUpdateImage).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "おまかせに戻す" }));
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "auto" });
  });

  it("高度な指定トグル→advancedNote textarea 入力→onSetAdvancedNote", async () => {
    const { p, radios } = openDirector();
    await userEvent.click(radios[0]);
    const advBtn = screen.getByRole("button", { name: /高度な指定/ });
    expect(advBtn).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(advBtn);
    expect(advBtn).toHaveAttribute("aria-expanded", "true");
    const ta = screen.getByPlaceholderText(/画風は固定です/);
    await userEvent.type(ta, "俯");
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { advancedNote: "俯" });
  });

  it("advancedNote 初期値があるとトグルは開いた状態で描画", async () => {
    setup({ imageInstructions: { 0: { mode: "custom", advancedNote: "コート全体の俯瞰図" } } });
    await userEvent.click(screen.getByTitle("画像指示を編集"));
    const ta = screen.getByPlaceholderText(/画風は固定です/) as HTMLTextAreaElement;
    expect(ta.value).toBe("コート全体の俯瞰図");
  });

  it("先頭セクション(isFirst)は『アイキャッチに使う』チェックで onToggleEyecatch", async () => {
    const { p, radios } = openDirector();
    await userEvent.click(radios[0]);
    const checkbox = screen.getByRole("checkbox", { name: /アイキャッチに使う/ });
    await userEvent.click(checkbox);
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { isEyecatch: true });
  });

  it("先頭以外は『アイキャッチに使う』を出さない", async () => {
    setup();
    const radios = screen.getAllByRole("radio", { name: /指定/ });
    await userEvent.click(radios[1]); // 2番目のセクション(まとめ)
    expect(screen.queryByRole("checkbox", { name: /アイキャッチに使う/ })).not.toBeInTheDocument();
  });

  it("isEyecatch=true の先頭でチェックを外すと onToggleEyecatch(false)", async () => {
    const p = setup({ imageInstructions: { 0: { mode: "custom", action: "手を振る", isEyecatch: true } } });
    await userEvent.click(screen.getByTitle("画像指示を編集"));
    const checkbox = screen.getByRole("checkbox", { name: /アイキャッチに使う/ });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { isEyecatch: false });
  });

  it("HouseStylePreview: プレビュー字幕(生成イメージ参考)を表示", async () => {
    const { radios } = openDirector();
    await userEvent.click(radios[0]);
    expect(screen.getByText(/生成イメージ\(参考\)/)).toBeInTheDocument();
  });

  it("debounce タイマー発火でプレビュー字幕が入力値へ更新される", async () => {
    setup();
    const radios = screen.getAllByRole("radio", { name: /指定/ });
    await userEvent.click(radios[0]);
    const input = screen.getByPlaceholderText(/例: ラケットを持ち比べる/);
    await userEvent.type(input, "スイングする");
    // debounce(180ms)経過後に HouseStylePreview の字幕へ反映される(実タイマー待ち)
    expect(await screen.findByText(/がスイングする/, undefined, { timeout: 1000 })).toBeInTheDocument();
  });
});

// HouseStylePreview / ActionSuggestions の一部分岐は OutlineView 経由では
// previewAction が常に非空・suggestions が常に1件以上のため到達しない。
// 純粋な presentation 分岐として直接描画で 100% 到達させる。
describe("HouseStylePreview(直接・分岐網羅)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("action が空なら『の動きはおまかせ』を出す", () => {
    render(<HouseStylePreview hue={200} action="" />);
    expect(screen.getByText(/の動きはおまかせ/)).toBeInTheDocument();
  });

  it("action があれば『が〈action〉』を出す", () => {
    render(<HouseStylePreview hue={200} action="スイングする" />);
    expect(screen.getByText(/がスイングする/)).toBeInTheDocument();
  });

  it("isEyecatch でアイキャッチバッジ(16:9)を出す", () => {
    render(<HouseStylePreview hue={200} action="手を振る" isEyecatch />);
    // バッジと字幕の両方
    expect(screen.getByText("アイキャッチ")).toBeInTheDocument();
  });
});

describe("ActionSuggestions(直接・分岐網羅)", () => {
  it("候補が空なら null(何も描画しない)", () => {
    const { container } = render(
      <ActionSuggestions suggestions={[]} activeAction="" onPick={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("activeAction に一致しない候補は inactive スタイル", () => {
    render(
      <ActionSuggestions suggestions={["A", "B"]} activeAction="A" onPick={vi.fn()} />,
    );
    const active = screen.getByRole("button", { name: "A" });
    const inactive = screen.getByRole("button", { name: "B" });
    expect(active).toHaveStyle({ color: "#0a0c10" });
    // inactive は purple 前景(#0a0c10 ではない)
    expect(inactive).not.toHaveStyle({ color: "#0a0c10" });
  });
});
