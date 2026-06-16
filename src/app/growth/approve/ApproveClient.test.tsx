import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApproveClient } from "./ApproveClient";

function mockFetchSequence(...responses: Array<{ ok?: boolean; json: unknown } | Error | string>) {
  const fn = vi.fn();
  responses.forEach((r) => {
    if (r instanceof Error || typeof r === "string") {
      fn.mockRejectedValueOnce(r);
    } else {
      fn.mockResolvedValueOnce({ ok: r.ok ?? true, json: async () => r.json });
    }
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const TOKEN = "tok";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApproveClient", () => {
  it("token が空ならエラー表示してfetchしない", () => {
    const fn = mockFetchSequence();
    render(<ApproveClient token="" />);
    expect(screen.getByRole("alert")).toHaveTextContent("リンクが正しくありません。");
    expect(fn).not.toHaveBeenCalled();
  });

  it("承認待ちを一覧表示する", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          { id: "p1", kind: "proposal", title: "市川ページ", subtitle: "サイト表示内容" },
          { id: "i1", kind: "idea", title: "猛暑記事", subtitle: "夏の集客" },
        ],
      },
    });
    render(<ApproveClient token={TOKEN} />);
    expect(await screen.findByText("承認待ち 2件")).toBeInTheDocument();
    expect(screen.getByText("市川ページ")).toBeInTheDocument();
    expect(screen.getByText("猛暑記事")).toBeInTheDocument();
  });

  it("API のエラーメッセージを表示する", async () => {
    mockFetchSequence({ ok: false, json: { success: false, error: "認証に失敗しました" } });
    render(<ApproveClient token={TOKEN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("認証に失敗しました");
  });

  it("error が無い失敗応答は既定メッセージ", async () => {
    mockFetchSequence({ ok: false, json: { success: false } });
    render(<ApproveClient token={TOKEN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("ネットワーク例外(非Error)は既定メッセージ", async () => {
    mockFetchSequence("boom");
    render(<ApproveClient token={TOKEN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("選択せず保存すると促しメッセージを出す", async () => {
    mockFetchSequence({ json: { success: true, items: [{ id: "p1", kind: "proposal", title: "A", subtitle: "x" }] } });
    render(<ApproveClient token={TOKEN} />);
    await screen.findByText("承認待ち 1件");
    await userEvent.click(screen.getByRole("button", { name: "まとめて保存" }));
    expect(screen.getByRole("status")).toHaveTextContent("承認または却下を選んでください。");
  });

  it("選択して保存すると反映し、保存済みを一覧から消す", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [
            { id: "p1", kind: "proposal", title: "残す", subtitle: "x" },
            { id: "p2", kind: "proposal", title: "消える", subtitle: "y" },
          ],
        },
      },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient token={TOKEN} />);
    await screen.findByText("承認待ち 2件");

    await userEvent.click(screen.getByRole("button", { name: "承認: 消える" }));
    await userEvent.click(screen.getByRole("button", { name: "まとめて保存" }));

    expect(await screen.findByText("承認待ち 1件")).toBeInTheDocument();
    expect(screen.getByText("残す")).toBeInTheDocument();
    expect(screen.queryByText("消える")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1件を保存しました。");

    const postCall = fn.mock.calls[1];
    expect(postCall[1].method).toBe("POST");
    expect(JSON.parse(postCall[1].body)).toEqual({ decisions: [{ id: "p2", decision: "承認" }] });
  });

  it("保存失敗時はエラーメッセージを出す", async () => {
    mockFetchSequence(
      { json: { success: true, items: [{ id: "p1", kind: "proposal", title: "A", subtitle: "x" }] } },
      { ok: false, json: { success: false, error: "保存エラー" } }
    );
    render(<ApproveClient token={TOKEN} />);
    await screen.findByText("承認待ち 1件");

    await userEvent.click(screen.getByRole("button", { name: "却下: A" }));
    await userEvent.click(screen.getByRole("button", { name: "まとめて保存" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("保存エラー"));
  });

  it("error の無い保存失敗は既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [{ id: "p1", kind: "proposal", title: "A", subtitle: "x" }] } },
      { ok: false, json: { success: false } }
    );
    render(<ApproveClient token={TOKEN} />);
    await screen.findByText("承認待ち 1件");

    await userEvent.click(screen.getByRole("button", { name: "承認: A" }));
    await userEvent.click(screen.getByRole("button", { name: "まとめて保存" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("保存に失敗しました。")
    );
  });
});
