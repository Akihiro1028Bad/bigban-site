import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DRAFT_READY_MESSAGE_TYPE,
  PREVIEW_MESSAGE_TYPE,
} from "@/lib/growth/draftPreview";

import { DraftFrameClient } from "./DraftFrameClient";

function dispatchMessage(data: unknown, origin: string): void {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}

describe("DraftFrameClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("初期表示は空(本文がありません)", () => {
    render(<DraftFrameClient />);
    expect(screen.getByText("本文がありません。")).toBeInTheDocument();
  });

  it("マウント時に親へ ready(handshake)を送る", () => {
    const postSpy = vi.spyOn(window.parent, "postMessage");
    render(<DraftFrameClient />);
    expect(postSpy).toHaveBeenCalledWith(
      { type: DRAFT_READY_MESSAGE_TYPE },
      window.location.origin,
    );
  });

  it("自オリジンからの正規メッセージを本番スタイルで描画する", async () => {
    render(<DraftFrameClient />);
    dispatchMessage(
      { type: PREVIEW_MESSAGE_TYPE, html: "<p>届いた本文</p>" },
      window.location.origin,
    );
    expect(await screen.findByText("届いた本文")).toBeInTheDocument();
  });

  it("異なるオリジンのメッセージは無視する", async () => {
    render(<DraftFrameClient />);
    dispatchMessage(
      { type: PREVIEW_MESSAGE_TYPE, html: "<p>悪意の本文</p>" },
      "https://evil.example",
    );
    // 反映されない(空のまま)
    await waitFor(() => {
      expect(screen.queryByText("悪意の本文")).not.toBeInTheDocument();
    });
    expect(screen.getByText("本文がありません。")).toBeInTheDocument();
  });

  it("不正な形式のメッセージは無視する", async () => {
    render(<DraftFrameClient />);
    dispatchMessage({ type: "other", html: "<p>無効</p>" }, window.location.origin);
    await waitFor(() => {
      expect(screen.queryByText("無効")).not.toBeInTheDocument();
    });
  });
});
