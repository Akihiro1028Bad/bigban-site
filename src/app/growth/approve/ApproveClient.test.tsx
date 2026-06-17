import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

function ideaItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "i1",
    kind: "idea",
    title: "猛暑記事",
    subtitle: "夏の集客",
    details: [{ label: "優先度", value: "中" }],
    ...over,
  };
}

describe("ApproveClient 合言葉画面", () => {
  it("入力意図の説明文を表示する(#229)", () => {
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
      json: { success: true, items: [proposalItem(), ideaItem()] },
    });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText("市川ページ")).toBeInTheDocument();
    expect(screen.getByText("猛暑記事")).toBeInTheDocument();
    expect(fn.mock.calls[0][0]).toBe(TOKEN_URL);
  });

  it("種別バッジと判断根拠(details)を表示する(#226/#227)", async () => {
    mockFetchSequence({
      json: { success: true, items: [proposalItem(), ideaItem()] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
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
});

describe("ApproveClient 即時保存(#235)", () => {
  it("確定ボタンは無く、進捗(処理済み)を表示する", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.queryByRole("button", { name: /確定/ })).not.toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();
  });

  it("承認を押すとその場で1件保存し、保存済み表示と取り消すを出す", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り消す: 市川ページ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "承認: 市川ページ" })).not.toBeInTheDocument();
    expect(screen.getByText("処理済み 1 / 1件")).toBeInTheDocument();

    const post = fn.mock.calls[1];
    expect(post[0]).toBe(TOKEN_URL);
    expect(post[1].method).toBe("POST");
    expect(JSON.parse(post[1].body)).toEqual({ decisions: [{ id: "p1", decision: "承認" }] });
  });

  it("却下を押すと却下で保存する", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "却下: 市川ページ" }));

    expect(await screen.findByText("却下しました")).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "却下" }],
    });
  });

  it("取り消すで施策を承認待ち(未処理)へ戻し、選択し直せる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));

    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "未処理" }],
    });
  });

  it("記事の取り消しは提案中へ戻す", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");

    await userEvent.click(screen.getByRole("button", { name: "承認: 猛暑記事" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 猛暑記事" }));

    await screen.findByRole("button", { name: "承認: 猛暑記事" });
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "i1", decision: "提案中" }],
    });
  });

  it("保存失敗時はカードに赤エラーと再試行を出し、選択前の状態を保つ(#239)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { ok: false, status: 502, json: { success: false, error: "保存エラー" } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));

    expect(await screen.findByText("保存エラー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();
  });

  it("error の無い保存失敗は既定メッセージ(success:false)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: false } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "却下: 市川ページ" }));
    expect(await screen.findByText("保存に失敗しました。")).toBeInTheDocument();
  });

  it("保存中の例外(非Error)は既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      "boom"
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText("保存に失敗しました。")).toBeInTheDocument();
  });

  it("再試行で保存をやり直せる(#239)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { ok: false, status: 502, json: { success: false, error: "保存エラー" } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "再試行: 市川ページ" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.queryByText("保存エラー")).not.toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "承認" }],
    });
  });

  it("1件の保存失敗は他カードに波及しない(#239)", async () => {
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [proposalItem(), proposalItem({ id: "p2", title: "他カード" })],
        },
      },
      { ok: false, status: 502, json: { success: false, error: "保存エラー" } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await screen.findByText("保存エラー");
    await userEvent.click(screen.getByRole("button", { name: "承認: 他カード" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByText("処理済み 1 / 2件")).toBeInTheDocument();
  });

  it("取り消し失敗時はカードに赤エラーを出し、保存済みのまま残す(#239)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { ok: false, status: 502, json: { success: false, error: "戻せませんでした" } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));

    expect(await screen.findByText("戻せませんでした")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り消す: 市川ページ" })).toBeInTheDocument();
  });

  it("取り消しの再試行で承認待ちへ戻せる(#239)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { ok: false, status: 502, json: { success: false, error: "戻せませんでした" } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));
    await screen.findByText("戻せませんでした");
    await userEvent.click(screen.getByRole("button", { name: "再試行: 市川ページ" }));

    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[3][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "未処理" }],
    });
  });

  it("タップ領域を確保するクラスを付与する(#227)", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.getByRole("button", { name: "承認: 市川ページ" }).className).toMatch(
      /min-h-11/
    );
  });
});

describe("ApproveClient 公開タイミングの明示(#237)", () => {
  it("承認＝制作キュー追加・この場では非公開の補足を表示する", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.getByText(/この場では公開されません/)).toBeInTheDocument();
  });

  it("完了表示に公開タイミングの注記を含む", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText(/公開はまだされません/)).toBeInTheDocument();
  });
});

describe("ApproveClient 空状態/完了(#236)", () => {
  it("承認待ち0件のとき空状態を表示し、操作ボタンを出さない", async () => {
    mockFetchSequence({ json: { success: true, items: [] } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText(/承認待ちはありません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /確定/ })).not.toBeInTheDocument();
  });

  it("全件処理すると完了メッセージを表示する", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText(/すべて処理しました/)).toBeInTheDocument();
  });

  it("一部未処理なら完了メッセージは出ない", async () => {
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [proposalItem(), proposalItem({ id: "p2", title: "他カード" })],
        },
      },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await screen.findByText("承認しました");
    expect(screen.queryByText(/すべて処理しました/)).not.toBeInTheDocument();
  });
});
