import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ImagesView, PreviewView, PromptView } from "./DetailViews";
import type { DraftState } from "./draftTypes";

// #75: draftState を組み立てる小ヘルパ(ready は最小フィールドのみ)。
function ready(bodyHtml: string, body = "", eyecatch?: string): DraftState {
  return { status: "ready", draft: { title: "T", displayMode: "html", bodyHtml, body, eyecatch } };
}

beforeAll(() => {
  // DevicePreview が使う ResizeObserver は jsdom 未実装のため no-op モックを注入する。
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverMock {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
  }
});

describe("PromptView", () => {
  it("生成メモと参照を出す", () => {
    render(<PromptView prompt="この記事の狙い" refs={[{ title: "施設ページ", source: "/facility" }]} />);
    expect(screen.getByText("この記事の狙い")).toBeInTheDocument();
    expect(screen.getByText("施設ページ")).toBeInTheDocument();
  });

  it("refs が無くても生成メモは出る", () => {
    render(<PromptView prompt="狙いのみ" />);
    expect(screen.getByText("狙いのみ")).toBeInTheDocument();
  });

  it("Markdown の生成メモは整形表示する(#212)", () => {
    const { container } = render(<PromptView prompt={"## 見出し\n\n- **A**\n- B"} />);
    // 生成メモ本体(prose コンテナ)の中だけを検証する(冒頭の説明ボックスと混ざらないように)。
    const memo = container.querySelector(".prompt-markdown");
    if (!memo) throw new Error("memo container not found");
    expect(memo).not.toHaveClass("approve-article");
    // 見出し・箇条書き・強調が HTML 要素として整形される(リテラルの ## / ** は残らない)。
    expect(memo.querySelector("h2")).toHaveTextContent("見出し");
    expect(memo.querySelector("ul")).toBeInTheDocument();
    expect(memo.querySelectorAll("li").length).toBe(2);
    expect(memo.querySelector("strong")).toHaveTextContent("A");
    expect(screen.queryByText(/##/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });
});

describe("PreviewView", () => {
  it("generating は shimmer と段階ラベルを出す(進捗%は出さない)", () => {
    render(
      <PreviewView stage="generating" generatingStep="本文を生成中" draftState={{ status: "idle" }} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />,
    );
    expect(screen.getByText("本文を生成中")).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("generating で stuck バナーを出す", () => {
    render(
      <PreviewView stage="generating" stuck draftState={{ status: "idle" }} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />,
    );
    expect(screen.getByText(/生成が滞留しています/)).toBeInTheDocument();
  });

  it("未作成(idle)は空状態を出す", () => {
    render(<PreviewView stage="draft_review" draftState={{ status: "idle" }} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />);
    expect(screen.getByText("まだ下書きは生成されていません")).toBeInTheDocument();
  });

  it("loading はローディングを出す", () => {
    render(<PreviewView stage="draft_review" draftState={{ status: "loading" }} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("empty は見つかりませんでしたを出す", () => {
    render(<PreviewView stage="draft_review" draftState={{ status: "empty" }} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />);
    expect(screen.getByText(/見つかりませんでした/)).toBeInTheDocument();
  });

  it("error はメッセージと再読み込みを出し、押すと onReloadDraft を呼ぶ", async () => {
    const onReloadDraft = vi.fn();
    render(
      <PreviewView stage="draft_review" draftState={{ status: "error", error: "取得NG" }} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={onReloadDraft} />,
    );
    expect(screen.getByText("取得NG")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onReloadDraft).toHaveBeenCalled();
  });

  it("bodyHtml が空でも body にフォールバックしてプレビューへ渡す", () => {
    render(<PreviewView stage="draft_review" draftState={ready("", "<p>リッチ本文</p>")} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />);
    expect(screen.getByTitle("公開後プレビュー")).toHaveAttribute("data-preview-html", "<p>リッチ本文</p>");
  });

  it("ready はメタ編集＋デバイスプレビューを出す", () => {
    render(<PreviewView stage="draft_review" draftState={ready("<p>本文</p>")} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />);
    expect(screen.getByText(/メタディスクリプション/)).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "プレビュー端末" })).toBeInTheDocument();
  });

  it("アイキャッチ有りは端末プレビューの html にヒーロー img を含める", () => {
    render(
      <PreviewView
        stage="draft_review"
        draftState={ready("<p>本文</p>", "", "https://img.example/hero.webp")}
        slug="a1"
        onSaveMeta={vi.fn()}
        onReloadDraft={vi.fn()}
      />,
    );
    const html = screen.getByTitle("公開後プレビュー").getAttribute("data-preview-html") ?? "";
    expect(html).toContain('<img src="https://img.example/hero.webp"');
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<p>本文</p>"));
  });

  it("アイキャッチ無しは html がそのまま(ヒーロー無し)", () => {
    render(<PreviewView stage="draft_review" draftState={ready("<p>本文</p>")} slug="a1" onSaveMeta={vi.fn()} onReloadDraft={vi.fn()} />);
    expect(screen.getByTitle("公開後プレビュー")).toHaveAttribute("data-preview-html", "<p>本文</p>");
  });

  it("独立した96pxサムネはプレビュータブに描画しない", () => {
    render(
      <PreviewView
        stage="draft_review"
        draftState={ready("<p>本文</p>", "", "https://img.example/hero.webp")}
        slug="a1"
        onSaveMeta={vi.fn()}
        onReloadDraft={vi.fn()}
      />,
    );
    expect(screen.queryByAltText("アイキャッチ")).not.toBeInTheDocument();
  });

  it("メタが120字超で警告を出し、保存で onSaveMeta を呼ぶ", async () => {
    const onSaveMeta = vi.fn();
    render(
      <PreviewView
        stage="draft_review"
        draftState={ready("<p>本文</p>")}
        slug="a1"
        metaDescription={"あ".repeat(121)}
        onSaveMeta={onSaveMeta}
        onReloadDraft={vi.fn()}
      />,
    );
    expect(screen.getByText(/120字を超えると/)).toBeInTheDocument();
    const ta = screen.getByPlaceholderText(/検索結果に出る説明文/);
    await userEvent.type(ta, "x");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(onSaveMeta).toHaveBeenCalled();
  });

  it("本文から自動生成で excerpt を埋める", async () => {
    render(
      <PreviewView
        stage="draft_review"
        draftState={ready(`<p>${"本文テキスト".repeat(40)}</p>`)}
        slug="a1"
        onSaveMeta={vi.fn()}
        onReloadDraft={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /本文から自動生成/ }));
    const ta = screen.getByPlaceholderText(/検索結果に出る説明文/) as HTMLTextAreaElement;
    expect(ta.value.length).toBeGreaterThan(0);
    expect(ta.value.endsWith("…")).toBe(true);
  });
});

describe("ImagesView", () => {
  const base = {
    hue: 200,
    hasEyecatch: true,
    bodyImages: 2,
    itemId: "a1",
    regenKeys: new Set<string>(),
    onPickEyecatch: vi.fn(),
    onRegenEyecatch: vi.fn(),
    onAddBodyImage: vi.fn(),
    onPickBodyImage: vi.fn(),
    onRegenBodyImage: vi.fn(),
  };

  it("アイキャッチと本文画像の枚数を出す", () => {
    render(<ImagesView {...base} />);
    expect(screen.getByText("アイキャッチ")).toBeInTheDocument();
    expect(screen.getByText(/本文画像 \(2\)/)).toBeInTheDocument();
  });

  it("アイキャッチ未設定で警告を出す", () => {
    render(<ImagesView {...base} hasEyecatch={false} />);
    expect(screen.getByText(/未設定 — 公開にはアイキャッチが必要です/)).toBeInTheDocument();
  });

  it("本文画像0で『ありません』", () => {
    render(<ImagesView {...base} bodyImages={0} />);
    expect(screen.getByText("本文画像はありません。")).toBeInTheDocument();
  });

  it("再生成ボタンで onRegenBodyImage(index)", async () => {
    render(<ImagesView {...base} />);
    const regen = screen.getAllByTitle("AIで再生成");
    await userEvent.click(regen[1]);
    expect(base.onRegenBodyImage).toHaveBeenCalled();
  });

  it("再生成中はアイキャッチにオーバーレイを出す", () => {
    render(<ImagesView {...base} regenKeys={new Set(["a1:eyecatch"])} />);
    expect(screen.getByText("生成中…")).toBeInTheDocument();
  });
});
