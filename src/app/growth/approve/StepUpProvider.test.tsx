import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepUpProvider, useStepUp } from "./StepUpProvider";

function Harness({ operation }: { operation: () => Promise<Response> }) {
  const { runPrivileged } = useStepUp();
  return (
    <>
      <button type="button" onClick={() => void runPrivileged("publish", operation).catch(() => undefined)}>公開</button>
      <button type="button" onClick={() => void runPrivileged("media", operation).catch(() => undefined)}>メディア</button>
    </>
  );
}

describe("StepUpProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("Provider外の互換contextは操作を直接実行する", async () => {
    const operation = vi.fn().mockResolvedValue(Response.json({ success: true }));
    render(<Harness operation={operation} />);
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    await waitFor(() => expect(operation).toHaveBeenCalledTimes(1));
  });

  it("scope別dialogで成功後に操作を1回実行し、5分内は再利用する", async () => {
    let now = 1_000;
    fetchMock.mockResolvedValue(
      Response.json({ success: true, expiresAt: now + 300_000, scope: "publish" })
    );
    const operation = vi.fn().mockResolvedValue(Response.json({ success: true }));
    render(<StepUpProvider now={() => now}><Harness operation={operation} /></StepUpProvider>);

    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    expect(screen.getByRole("dialog", { name: "重要操作の再認証" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("合言葉"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "再認証する" }));

    await waitFor(() => expect(operation).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ passphrase: "secret", scope: "publish" });
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    await waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "メディア" }));
    expect(screen.getByText(/メディア操作/)).toBeInTheDocument();
    now += 300_001;
  });

  it("再認証失敗時は操作せず入力を消去する", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: false, error: "違います" }, { status: 401 }));
    const operation = vi.fn();
    render(<StepUpProvider><Harness operation={operation} /></StepUpProvider>);
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    fireEvent.change(screen.getByLabelText("合言葉"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button", { name: "再認証する" }).closest("form")!);
    await screen.findByRole("alert");
    expect(screen.getByLabelText("合言葉")).toHaveValue("");
    expect(operation).not.toHaveBeenCalled();
  });

  it("空入力と応答形式不正をdialog内に表示する", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }));
    render(<StepUpProvider><Harness operation={vi.fn()} /></StepUpProvider>);
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    fireEvent.click(screen.getByRole("button", { name: "再認証する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("入力してください");
    fireEvent.change(screen.getByLabelText("合言葉"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "再認証する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("再認証に失敗");
  });

  it("再認証成功直後の操作がSTEP_UP_REQUIREDならdialogを維持する", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true, expiresAt: Date.now() + 300_000 }));
    const operation = vi.fn().mockResolvedValue(Response.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }));
    render(<StepUpProvider><Harness operation={operation} /></StepUpProvider>);
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    fireEvent.change(screen.getByLabelText("合言葉"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "再認証する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("有効期限");
  });

  it("一般の403はstep-up期限切れとして扱わない", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true, expiresAt: Date.now() + 300_000 }));
    const operation = vi.fn().mockResolvedValue(Response.json({ code: "FORBIDDEN" }, { status: 403 }));
    render(<StepUpProvider><Harness operation={operation} /></StepUpProvider>);
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    fireEvent.change(screen.getByLabelText("合言葉"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "再認証する" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    await waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("通信例外時は保留Promiseをrejectしてdialogを閉じる", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    render(<StepUpProvider><Harness operation={vi.fn()} /></StepUpProvider>);
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    fireEvent.change(screen.getByLabelText("合言葉"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "再認証する" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("操作がSTEP_UP_REQUIREDを返したらcacheを破棄してdialogを再表示する", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true, expiresAt: Date.now() + 300_000 }));
    const operation = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ code: "STEP_UP_REQUIRED" }, { status: 403 }));
    render(<StepUpProvider><Harness operation={operation} /></StepUpProvider>);
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    fireEvent.change(screen.getByLabelText("合言葉"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "再認証する" }));
    await waitFor(() => expect(operation).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "公開" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("有効期限");
  });
});
