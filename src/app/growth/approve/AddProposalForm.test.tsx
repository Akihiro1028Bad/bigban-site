import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddProposalForm } from "./AddProposalForm";

function mockFetch(response: { ok?: boolean; status?: number; json: unknown } | Error | string) {
  const fn = vi.fn();
  if (response instanceof Error || typeof response === "string") {
    fn.mockRejectedValueOnce(response);
  } else {
    fn.mockResolvedValueOnce({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json,
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

const TOKEN = "ビックマン";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddProposalForm", () => {
  it("施策名・カテゴリ・メモを送信し、onAdded を呼んでフォームを初期化する", async () => {
    const fn = mockFetch({
      json: {
        success: true,
        item: { id: "n1", kind: "proposal", title: "平日昼クーポン", subtitle: "MEO", details: [], score: 0 },
      },
    });
    const onAdded = vi.fn();
    render(<AddProposalForm token={TOKEN} onAdded={onAdded} />);

    await userEvent.type(screen.getByLabelText("施策名"), "平日昼クーポン");
    await userEvent.selectOptions(screen.getByLabelText("カテゴリ"), "MEO");
    await userEvent.type(screen.getByLabelText("想定アクション / メモ"), "LINE配布");
    await userEvent.click(screen.getByRole("button", { name: "追加する" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded).toHaveBeenCalledWith(
      expect.objectContaining({ id: "n1", title: "平日昼クーポン" })
    );
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("/api/growth/proposals");
    // 非ASCIIの合言葉は percent-encode して載せる(ISO-8859-1 制約・authHeaders と対)。
    expect(init.headers.Authorization).toBe(`Bearer ${encodeURIComponent(TOKEN)}`);
    expect(JSON.parse(init.body)).toEqual({
      name: "平日昼クーポン",
      category: "MEO",
      note: "LINE配布",
    });
    expect((screen.getByLabelText("施策名") as HTMLInputElement).value).toBe("");
  });

  it("施策名が空なら送信せずエラーを出す", async () => {
    const fn = mockFetch({ json: { success: true, item: {} } });
    render(<AddProposalForm token={TOKEN} onAdded={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "追加する" }));
    expect(screen.getByRole("alert")).toHaveTextContent("施策名を入力してください。");
    expect(fn).not.toHaveBeenCalled();
  });

  it("API エラーはメッセージを表示する", async () => {
    mockFetch({ ok: false, status: 502, json: { success: false, error: "作成中にエラーが発生しました" } });
    render(<AddProposalForm token={TOKEN} onAdded={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("施策名"), "施策A");
    await userEvent.click(screen.getByRole("button", { name: "追加する" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("作成中にエラーが発生しました")
    );
  });

  it("error の無い失敗(success:false)は既定メッセージ", async () => {
    mockFetch({ json: { success: false } });
    render(<AddProposalForm token={TOKEN} onAdded={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("施策名"), "施策A");
    await userEvent.click(screen.getByRole("button", { name: "追加する" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("追加に失敗しました。"));
  });

  it("ネットワーク例外(非Error)は既定メッセージ", async () => {
    mockFetch("boom");
    render(<AddProposalForm token={TOKEN} onAdded={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("施策名"), "施策A");
    await userEvent.click(screen.getByRole("button", { name: "追加する" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("追加に失敗しました。"));
  });
});
