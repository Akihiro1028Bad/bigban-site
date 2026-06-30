/**
 * ReviseSectionView(構成案の手動編集セクション)の挙動テスト(差分B Task 12)。
 *
 * AI修正系を相談ドロワーへ移管した後、手動セクションのコメント編集4コールバック
 * (onStartEditComment/onDeleteComment/onCancelComment/onSaveComment)＋タイトル/セクション編集が
 * 実挙動で到達することを検証する。revise は useReviseEditing 互換のモックを差して exercise する。
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviseSectionView } from "./ReviseSectionView";
import type { useReviseEditing } from "./hooks/useReviseEditing";
import type { PendingItem } from "./types";

type Revise = ReturnType<typeof useReviseEditing>;

const item: PendingItem = {
  id: "i1",
  kind: "idea",
  title: "猛暑記事",
  subtitle: "夏の集客",
  stage: "proposed",
  outline: "## 見出しA\n本文A\n## 見出しB\n本文B",
};

// useReviseEditing 互換の最小モック。状態値は引数で上書きし、関数は vi.fn() を差す。
function makeRevise(over: Partial<Revise> = {}): Revise {
  const base = {
    refreshItems: vi.fn(),
    draftComments: {} as Record<number, string[]>,
    openCommentFor: null as number | null,
    commentText: "",
    editingIdx: null as number | null,
    editingSection: null as number | null,
    editHeading: "",
    editDescription: "",
    imageFormFor: null as number | null,
    editingImageIdx: null as number | null,
    imageStyle: "mascot" as const,
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
    requestRevise: vi.fn(),
    startAddComment: vi.fn(),
    startEditComment: vi.fn(),
    cancelComment: vi.fn(),
    saveComment: vi.fn(),
    deleteComment: vi.fn(),
    startEditSection: vi.fn(),
    cancelEditSection: vi.fn(),
    startEditTitle: vi.fn(),
    cancelEditTitle: vi.fn(),
    saveTitle: vi.fn(),
    saveSection: vi.fn(),
    startAddImage: vi.fn(),
    startEditImage: vi.fn(),
    cancelImage: vi.fn(),
    saveImage: vi.fn(),
    deleteImage: vi.fn(),
  };
  return { ...base, ...over } as Revise;
}

describe("ReviseSectionView", () => {
  it("構成案が無い記事では何も描画しない", () => {
    const { container } = render(
      <ReviseSectionView item={{ ...item, outline: "" }} revise={makeRevise()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("各セクションの見出しを表示する", () => {
    render(<ReviseSectionView item={item} revise={makeRevise()} />);
    expect(screen.getByText("見出しA")).toBeInTheDocument();
    expect(screen.getByText("見出しB")).toBeInTheDocument();
  });

  it("＋コメントで startAddComment(section) を呼ぶ", async () => {
    const user = userEvent.setup();
    const startAddComment = vi.fn();
    render(<ReviseSectionView item={item} revise={makeRevise({ startAddComment })} />);
    await user.click(screen.getByRole("button", { name: "コメントを追加: 見出しA" }));
    expect(startAddComment).toHaveBeenCalledWith(0);
  });

  it("コメント入力欄でキャンセル/保存が cancelComment/saveComment(section) を呼ぶ", async () => {
    const user = userEvent.setup();
    const cancelComment = vi.fn();
    const saveComment = vi.fn();
    render(
      <ReviseSectionView
        item={item}
        revise={makeRevise({ openCommentFor: 1, cancelComment, saveComment })}
      />
    );
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(cancelComment).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "コメントを追加" }));
    expect(saveComment).toHaveBeenCalledWith(1);
  });

  it("既存コメントの編集/削除が startEditComment(section,idx,text)/deleteComment(section,idx) を呼ぶ", async () => {
    const user = userEvent.setup();
    const startEditComment = vi.fn();
    const deleteComment = vi.fn();
    render(
      <ReviseSectionView
        item={item}
        revise={makeRevise({
          draftComments: { 0: ["コメ1", "コメ2"] },
          startEditComment,
          deleteComment,
        })}
      />
    );
    await user.click(screen.getByRole("button", { name: "コメントを編集: 見出しA 2" }));
    expect(startEditComment).toHaveBeenCalledWith(0, 1, "コメ2");
    await user.click(screen.getByRole("button", { name: "コメントを削除: 見出しA 1" }));
    expect(deleteComment).toHaveBeenCalledWith(0, 0);
  });

  it("セクション編集ボタンで startEditSection(i, section) を呼ぶ", async () => {
    const user = userEvent.setup();
    const startEditSection = vi.fn();
    render(<ReviseSectionView item={item} revise={makeRevise({ startEditSection })} />);
    await user.click(screen.getByRole("button", { name: "セクションを編集: 見出しB" }));
    expect(startEditSection).toHaveBeenCalledTimes(1);
    expect(startEditSection.mock.calls[0][0]).toBe(1);
    expect(startEditSection.mock.calls[0][1]).toMatchObject({ heading: "見出しB" });
  });

  it("セクション手動編集フォームの保存で saveSection(item, sections, i) を呼ぶ", async () => {
    const user = userEvent.setup();
    const saveSection = vi.fn();
    render(
      <ReviseSectionView item={item} revise={makeRevise({ editingSection: 0, saveSection })} />
    );
    await user.click(screen.getByRole("button", { name: "この行を保存" }));
    expect(saveSection).toHaveBeenCalledTimes(1);
    expect(saveSection.mock.calls[0][0]).toBe(item);
    expect(saveSection.mock.calls[0][2]).toBe(0);
  });

  it("タイトル直接編集の開始/保存が startEditTitle/saveTitle を呼ぶ", async () => {
    const user = userEvent.setup();
    const startEditTitle = vi.fn();
    render(<ReviseSectionView item={item} revise={makeRevise({ startEditTitle })} />);
    await user.click(screen.getByRole("button", { name: "タイトルを編集: 猛暑記事" }));
    expect(startEditTitle).toHaveBeenCalledWith("猛暑記事");

    const saveTitle = vi.fn();
    render(
      <ReviseSectionView item={item} revise={makeRevise({ editingTitle: true, saveTitle })} />
    );
    await user.click(screen.getByRole("button", { name: "タイトルを保存" }));
    expect(saveTitle).toHaveBeenCalledWith(item);
  });

  it("画像指示の追加で startAddImage(i) を呼ぶ", async () => {
    const user = userEvent.setup();
    const startAddImage = vi.fn();
    render(<ReviseSectionView item={item} revise={makeRevise({ startAddImage })} />);
    await user.click(screen.getByRole("button", { name: "画像を追加: 見出しA" }));
    expect(startAddImage).toHaveBeenCalledWith(0);
  });

  it("画像指示フォームの保存で saveImage を、既存画像の削除で deleteImage を呼ぶ", async () => {
    const user = userEvent.setup();
    const saveImage = vi.fn();
    const deleteImage = vi.fn();
    const withImage = {
      ...item,
      outline: "## 見出しA\n本文A\n[画像:マスコット・コスミック: 夏の屋内コート]",
    };
    render(
      <ReviseSectionView
        item={withImage}
        revise={makeRevise({
          imageFormFor: 0,
          imageDesc: "夏の屋内コート",
          saveImage,
          deleteImage,
        })}
      />
    );
    await user.click(screen.getByRole("button", { name: "画像を削除: 見出しA 1" }));
    expect(deleteImage).toHaveBeenCalledTimes(1);
    expect(deleteImage.mock.calls[0][3]).toBe(0);
    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(saveImage).toHaveBeenCalledTimes(1);
    expect(saveImage.mock.calls[0][0]).toBe(withImage);
  });
});
