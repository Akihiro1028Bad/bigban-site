import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import { DevicePreview } from "./DevicePreview";

beforeAll(() => {
  // jsdom は ResizeObserver 未実装のため no-op モックを注入する。
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

describe("DevicePreview", () => {
  it("3端末のタブを出し、既定はスマホ選択", () => {
    render(<DevicePreview html="<p>本文</p>" slug="a1" />);
    expect(
      screen.getByRole("tablist", { name: "プレビュー端末" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /スマホ/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /タブレット/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /PC/ })).toBeInTheDocument();
  });

  it("端末タブ切替で aria-selected が移る", async () => {
    render(<DevicePreview html="<p>本文</p>" slug="a1" />);
    await userEvent.click(screen.getByRole("tab", { name: /PC/ }));
    expect(screen.getByRole("tab", { name: /PC/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /スマホ/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("本番プレビュー frame(iframe)を描画し、URL に slug を出す", () => {
    render(<DevicePreview html="<p>本文</p>" slug="a1" />);
    expect(screen.getByTitle("公開後プレビュー")).toBeInTheDocument();
    expect(
      screen.getByText(/thepicklebangtheory\.com\/ja\/news\/a1/),
    ).toBeInTheDocument();
  });
});
