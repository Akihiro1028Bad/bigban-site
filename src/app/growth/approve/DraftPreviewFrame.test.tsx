import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DRAFT_READY_MESSAGE_TYPE,
  PREVIEW_MESSAGE_TYPE,
} from "@/lib/growth/draftPreview";

import { DraftPreviewFrame } from "./DraftPreviewFrame";

/**
 * handshake(#F2)の実挙動テスト。DraftPreviewFrame はカバレッジ対象外だが、
 * onLoad 単発 post のレースを潰す handshake ロジックは jsdom で実際の window
 * message イベントをシミュレートして検証する(子 → ready → 親が最新 html を post)。
 *
 * jsdom は iframe.contentWindow を提供し MessageEvent.source も伝搬するため、
 * 「自 iframe からの ready のみ受理」「ready 後の html 変化で再 post」を実挙動で確認できる。
 */

function contentWindowOf(container: HTMLElement): Window {
  const iframe = container.querySelector("iframe");
  if (!iframe?.contentWindow) throw new Error("iframe contentWindow not found");
  return iframe.contentWindow;
}

function dispatchReady(source: Window | null, origin: string): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: DRAFT_READY_MESSAGE_TYPE },
      origin,
      source,
    }),
  );
}

describe("DraftPreviewFrame (handshake #F2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("子からの ready 受信で最新 html を iframe へ post する", () => {
    const { container } = render(
      <DraftPreviewFrame html="<p>本文A</p>" title="preview" />,
    );
    const cw = contentWindowOf(container);
    const spy = vi.spyOn(cw, "postMessage");

    dispatchReady(cw, window.location.origin);

    expect(spy).toHaveBeenCalledWith(
      { type: PREVIEW_MESSAGE_TYPE, html: "<p>本文A</p>" },
      window.location.origin,
    );
  });

  it("ready 前に html が変わっても、ready 受信時に最新 html を送る", () => {
    const { container, rerender } = render(
      <DraftPreviewFrame html="<p>古い</p>" title="preview" />,
    );
    const cw = contentWindowOf(container);
    const spy = vi.spyOn(cw, "postMessage");

    // ready 前に html を更新(この時点では post されない)
    rerender(<DraftPreviewFrame html="<p>最新</p>" title="preview" />);
    expect(spy).not.toHaveBeenCalled();

    // ready 受信時には最新の html が送られる(stale closure なし)
    dispatchReady(cw, window.location.origin);
    expect(spy).toHaveBeenCalledWith(
      { type: PREVIEW_MESSAGE_TYPE, html: "<p>最新</p>" },
      window.location.origin,
    );
  });

  it("ready 後の html 変化で再 post する(ライブ更新)", () => {
    const { container, rerender } = render(
      <DraftPreviewFrame html="<p>v1</p>" title="preview" />,
    );
    const cw = contentWindowOf(container);
    const spy = vi.spyOn(cw, "postMessage");

    dispatchReady(cw, window.location.origin);
    expect(spy).toHaveBeenLastCalledWith(
      { type: PREVIEW_MESSAGE_TYPE, html: "<p>v1</p>" },
      window.location.origin,
    );

    rerender(<DraftPreviewFrame html="<p>v2</p>" title="preview" />);
    expect(spy).toHaveBeenLastCalledWith(
      { type: PREVIEW_MESSAGE_TYPE, html: "<p>v2</p>" },
      window.location.origin,
    );
  });

  it("別 frame(source 不一致)からの ready は無視する", () => {
    const { container } = render(
      <DraftPreviewFrame html="<p>本文</p>" title="preview" />,
    );
    const cw = contentWindowOf(container);
    const spy = vi.spyOn(cw, "postMessage");

    // 無関係な source(親 window)からの ready は自 iframe 宛でないため無視。
    dispatchReady(window, window.location.origin);
    expect(spy).not.toHaveBeenCalled();
  });

  it("異なるオリジンからの ready は無視する", () => {
    const { container } = render(
      <DraftPreviewFrame html="<p>本文</p>" title="preview" />,
    );
    const cw = contentWindowOf(container);
    const spy = vi.spyOn(cw, "postMessage");

    dispatchReady(cw, "https://evil.example");
    expect(spy).not.toHaveBeenCalled();
  });

  it("ready でない message は無視する", () => {
    const { container } = render(
      <DraftPreviewFrame html="<p>本文</p>" title="preview" />,
    );
    const cw = contentWindowOf(container);
    const spy = vi.spyOn(cw, "postMessage");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "other" },
        origin: window.location.origin,
        source: cw,
      }),
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
