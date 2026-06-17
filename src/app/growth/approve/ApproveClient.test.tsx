import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApproveClient } from "./ApproveClient";

function mockFetchSequence(
  ...responses: Array<{ ok?: boolean; status?: number; json: unknown } | Error | string>
) {
  const fn = vi.fn();
  responses.forEach((r) => {
    if (r instanceof Error || typeof r === "string") {
      fn.mockRejectedValueOnce(r);
    } else {
      fn.mockResolvedValueOnce({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => r.json,
      });
    }
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const PASS = "ビックマン";
const TOKEN_URL = `/api/growth/approve?token=${encodeURIComponent(PASS)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function login(pass: string = PASS): Promise<void> {
  await userEvent.type(screen.getByLabelText("合言葉"), pass);
  await userEvent.click(screen.getByRole("button", { name: "確認する" }));
}

function proposalItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p1",
    kind: "proposal",
    title: "市川ページ",
    subtitle: "サイト表示内容",
    details: [
      { label: "優先度スコア", value: "8.5" },
      { label: "確度", value: "高" },
    ],
    ...over,
  };
}

describe("ApproveClient", () => {
  it("合言葉画面は入力意図の説明文を表示する(#229)", () => {
    mockFetchSequence();
    render(<ApproveClient />);
    expect(
      screen.getByText("LINE で届いた合言葉を入力してください。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認する" })).toBeInTheDocument();
  });

  it("合言葉入力欄は初期状態でtext型(日本語IMEが効く)", () => {
    mockFetchSequence();
    render(<ApproveClient />);
    expect(screen.getByLabelText("合言葉")).toHaveAttribute("type", "text");
  });

  it("表示/非表示トグルで合言葉の表示を切り替えられる", async () => {
    mockFetchSequence();
    render(<ApproveClient />);
    const input = screen.getByLabelText("合言葉");
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "合言葉を隠す" }));
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "合言葉を表示" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("合言葉未入力なら促してfetchしない", async () => {
    const fn = mockFetchSequence();
    render(<ApproveClient />);
    await userEvent.click(screen.getByRole("button", { name: "確認する" }));
    expect(screen.getByRole("alert")).toHaveTextContent("合言葉を入力してください。");
    expect(fn).not.toHaveBeenCalled();
  });

  it("正しい合言葉で承認待ちを一覧表示し、合言葉をtokenとして送る", async () => {
    const fn = mockFetchSequence({
      json: {
        success: true,
        items: [
          proposalItem(),
          { id: "i1", kind: "idea", title: "猛暑記事", subtitle: "夏の集客", details: [{ label: "優先度", value: "中" }] },
        ],
      },
    });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText("承認待ち 2件")).toBeInTheDocument();
    expect(screen.getByText("市川ページ")).toBeInTheDocument();
    expect(screen.getByText("猛暑記事")).toBeInTheDocument();
    expect(fn.mock.calls[0][0]).toBe(TOKEN_URL);
  });

  it("種別バッジと判断根拠(details)を表示する(#226/#227)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          proposalItem(),
          { id: "i1", kind: "idea", title: "猛暑記事", subtitle: "夏の集客", details: [{ label: "優先度", value: "中" }] },
        ],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認待ち 2件");
    expect(screen.getByText("📋 施策")).toBeInTheDocument();
    expect(screen.getByText("📝 記事")).toBeInTheDocument();
    expect(screen.getByText("優先度スコア")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("確度")).toBeInTheDocument();
  });

  it("details も subtitle も無い項目でも壊れない", async () => {
    mockFetchSequence({
      json: { success: true, items: [{ id: "p1", kind: "proposal", title: "A", subtitle: "" }] },
    });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.getByText("📋 施策")).toBeInTheDocument();
  });

  it("承認/却下の選択がボタンの押下状態に反映される(#227)", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認待ち 1件");

    const approveBtn = screen.getByRole("button", { name: "承認: 市川ページ" });
    expect(approveBtn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(approveBtn);
    expect(approveBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "却下: 市川ページ" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("合言葉が違うと401で導線付きメッセージを出す(#229)", async () => {
    mockFetchSequence({ ok: false, status: 401, json: { success: false, error: "認証に失敗しました" } });
    render(<ApproveClient />);
    await login("ちがう");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("合言葉が違います。");
    expect(alert).toHaveTextContent("LINE");
  });

  it("401以外の失敗はAPIのエラーメッセージを表示する", async () => {
    mockFetchSequence({ ok: false, status: 500, json: { success: false, error: "サーバー設定エラー" } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("サーバー設定エラー");
  });

  it("401以外でerrorが無ければ既定メッセージ", async () => {
    mockFetchSequence({ ok: false, status: 500, json: { success: false } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("ネットワーク例外(非Error)は既定メッセージ", async () => {
    mockFetchSequence("boom");
    render(<ApproveClient />);
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("保存ボタンは未選択なら無効・件数つきラベルになる(#228)", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認待ち 1件");

    const save = screen.getByRole("button", { name: "0件を確定する" });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(screen.getByRole("button", { name: "1件を確定する" })).toBeEnabled();
  });

  it("タップ領域を確保するクラスを付与する(#227)", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認待ち 1件");
    expect(screen.getByRole("button", { name: "承認: 市川ページ" }).className).toMatch(
      /min-h-11/
    );
  });

  it("選択して保存すると反映し、保存済みを一覧から消す", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [
            { id: "p1", kind: "proposal", title: "残す", subtitle: "x", details: [] },
            { id: "p2", kind: "proposal", title: "消える", subtitle: "y", details: [] },
          ],
        },
      },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認待ち 2件");

    await userEvent.click(screen.getByRole("button", { name: "承認: 消える" }));
    await userEvent.click(screen.getByRole("button", { name: "1件を確定する" }));

    expect(await screen.findByText("承認待ち 1件")).toBeInTheDocument();
    expect(screen.getByText("残す")).toBeInTheDocument();
    expect(screen.queryByText("消える")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1件を保存しました。");

    const postCall = fn.mock.calls[1];
    expect(postCall[0]).toBe(TOKEN_URL);
    expect(postCall[1].method).toBe("POST");
    expect(JSON.parse(postCall[1].body)).toEqual({ decisions: [{ id: "p2", decision: "承認" }] });
  });

  it("保存失敗時はエラーメッセージを出す", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem({ title: "A", subtitle: "x" })] } },
      { ok: false, status: 502, json: { success: false, error: "保存エラー" } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認待ち 1件");

    await userEvent.click(screen.getByRole("button", { name: "却下: A" }));
    await userEvent.click(screen.getByRole("button", { name: "1件を確定する" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("保存エラー"));
  });

  it("error の無い保存失敗は既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem({ title: "A", subtitle: "x" })] } },
      { ok: false, status: 502, json: { success: false } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認待ち 1件");

    await userEvent.click(screen.getByRole("button", { name: "承認: A" }));
    await userEvent.click(screen.getByRole("button", { name: "1件を確定する" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("保存に失敗しました。")
    );
  });
});
