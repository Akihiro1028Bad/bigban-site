import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { handleOverlayKeyDown } from "./overlayKeyDown";

/** テスト用の最小 KeyboardEvent ダブル。stopPropagation を spy で観測する。 */
function makeEvent(
  key: string,
  modifiers: Partial<Pick<KeyboardEvent<HTMLElement>, "metaKey" | "ctrlKey" | "altKey">> = {},
): { event: KeyboardEvent<HTMLElement>; stopPropagation: ReturnType<typeof vi.fn> } {
  const stopPropagation = vi.fn();
  const event = {
    key,
    metaKey: modifiers.metaKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    stopPropagation,
  } as unknown as KeyboardEvent<HTMLElement>;
  return { event, stopPropagation };
}

describe("handleOverlayKeyDown", () => {
  it("Escape で onClose を呼び、伝播を止める", () => {
    const onClose = vi.fn();
    const { event, stopPropagation } = makeEvent("Escape");
    handleOverlayKeyDown(event, onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("修飾なし単一キー(a)は伝播だけ止め、onClose は呼ばない", () => {
    const onClose = vi.fn();
    const { event, stopPropagation } = makeEvent("a");
    handleOverlayKeyDown(event, onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("Tab はフォーカストラップへ委ねる(伝播を止めない・閉じない)", () => {
    const onClose = vi.fn();
    const { event, stopPropagation } = makeEvent("Tab");
    handleOverlayKeyDown(event, onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("修飾キー付き(⌘K)は中央処理へ通す(伝播を止めない)", () => {
    const onClose = vi.fn();
    const { event, stopPropagation } = makeEvent("k", { metaKey: true });
    handleOverlayKeyDown(event, onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("Ctrl 修飾も中央処理へ通す", () => {
    const { event, stopPropagation } = makeEvent("k", { ctrlKey: true });
    handleOverlayKeyDown(event, vi.fn());
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("Alt 修飾も中央処理へ通す", () => {
    const { event, stopPropagation } = makeEvent("j", { altKey: true });
    handleOverlayKeyDown(event, vi.fn());
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
