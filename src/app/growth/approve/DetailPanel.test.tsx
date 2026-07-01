/**
 * DetailPanel(2段タブ・#proto P3b 本番移植)のテスト。
 * クラスタ tablist(構成案/プレビュー/素材)・素材の内訳(画像/プロンプト)・フッター主操作・
 * block チェックでの承認無効・公開済みバッジ・編集中バッジ・行コメント slot・モバイル戻る を担保する。
 * Task 9 で本 file は exclude するため、主要分岐が壊れていないことの担保として残す。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DetailPanel } from "./DetailPanel";
import type { DraftState } from "./draftTypes";
import type { PendingItem } from "./types";

beforeAll(() => {
  // プレビュータブの DevicePreview が使う ResizeObserver は jsdom 未実装のため no-op モックを注入する。
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverMock {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  }
});

function pi(over: Partial<PendingItem> = {}): PendingItem {
  return {
    id: "a1",
    kind: "idea",
    title: "記事タイトル",
    subtitle: "",
    stage: "drafted",
    ...over,
  } as PendingItem;
}

const draftReady: DraftState = {
  status: "ready",
  draft: { title: "t", displayMode: "html", bodyHtml: "<h2>見出し</h2><p>本文</p>", body: "本文" },
};

function setup(over: Partial<Parameters<typeof DetailPanel>[0]> = {}) {
  const props = {
    item: pi(),
    stage: "draft_review" as const,
    tab: "preview" as const,
    editing: false,
    draftState: draftReady,
    prompt: "メモ",
    hue: 200,
    slug: "a1",
    regenKeys: new Set<string>(),
    sections: [],
    imageInstructions: {},
    revising: false,
    onBack: vi.fn(),
    onTabChange: vi.fn(),
    onApprove: vi.fn(),
    onRevise: vi.fn(),
    onReject: vi.fn(),
    onRevert: vi.fn(),
    onEdit: vi.fn(),
    onPickEyecatch: vi.fn(),
    onRegenEyecatch: vi.fn(),
    onPickBodyImage: vi.fn(),
    onRegenBodyImage: vi.fn(),
    onAddComment: vi.fn(),
    onRemoveComment: vi.fn(),
    onUpdateImage: vi.fn(),
    onRequestOutlineRevise: vi.fn(),
    onSaveMeta: vi.fn(),
    ...over,
  };
  render(<DetailPanel {...props} />);
  return props;
}

describe("DetailPanel(2段タブ)", () => {
  it("クラスタ tablist(構成案/プレビュー/素材)を出す", () => {
    setup();
    expect(screen.getByRole("tab", { name: /構成案/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /プレビュー/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /素材/ })).toBeInTheDocument();
  });

  it("クラスタ切替で onTabChange(リーフ) を呼ぶ", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("tab", { name: /構成案/ }));
    expect(p.onTabChange).toHaveBeenCalledWith("outline");
  });

  it("素材クラスタは子タブ(画像/プロンプト)を出す", () => {
    setup({ tab: "images" });
    // 素材クラスタ選択中は内訳 tablist が出る。
    expect(screen.getByRole("tablist", { name: /素材の内訳/ })).toBeInTheDocument();
  });

  it("footer: 承認/却下/AIに相談を出し、AIに相談で onRevise", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /AIに相談/ }));
    expect(p.onRevise).toHaveBeenCalled();
  });

  it("draft_review は『構成からやり直す』を出し onRevert", async () => {
    const p = setup({ stage: "draft_review" });
    await userEvent.click(screen.getByRole("button", { name: /構成からやり直す/ }));
    expect(p.onRevert).toHaveBeenCalled();
  });

  it("block チェックがあると承認ボタンが無効", () => {
    // 免責文なし本文＝AI免責文 block になる想定。
    setup({ stage: "draft_review" });
    expect(screen.getByRole("button", { name: /承認して公開予約|構成案を承認/ })).toBeDisabled();
  });

  it("published/scheduled は公開済みバッジで主操作を出さない", () => {
    setup({ stage: "published", item: pi({ stage: "published" }) });
    // StageChip ラベルとフッター確定バッジの両方に「公開済み」が出る。主操作(AIに相談)を出さないことを担保。
    expect(screen.getAllByText("公開済み").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /AIに相談/ })).not.toBeInTheDocument();
  });

  it("editing で編集中バッジを出す(DraftEditWorkspace は描画しない)", () => {
    setup({ editing: true });
    expect(screen.getByText("編集中")).toBeInTheDocument();
  });

  it("consultSentenceMode で inlineComments を前面に出す", () => {
    setup({ consultSentenceMode: true, inlineComments: <div>行コメントUI</div> });
    expect(screen.getByText("行コメントUI")).toBeInTheDocument();
  });

  it("onBack で一覧へ戻る(モバイル)", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /一覧/ }));
    expect(p.onBack).toHaveBeenCalled();
  });
});
