import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 合言葉認証フラグはテストごとに切り替える。既定の各テストは「有効(=現行のゲート)」で検証し、
// 無効(一時措置)の挙動は専用 describe で flags.authEnabled=false にして検証する。
const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
  isCmsNewsEnabled: () => false,
}));

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

beforeEach(() => {
  flags.authEnabled = true;
});

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

  it("種別バッジを一覧に表示し、判断根拠(details)は詳細パネルで見る(#226/#227)", async () => {
    mockFetchSequence({
      json: { success: true, items: [proposalItem(), ideaItem()] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    // バッジは一覧の各行に出る
    expect(screen.getByText("📋 施策")).toBeInTheDocument();
    expect(screen.getByText("📝 記事")).toBeInTheDocument();
    // 数値根拠は一覧には出さず、詳細パネルに入れる(#275 高密度化)
    expect(screen.queryByText("優先度スコア")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("優先度スコア")).toBeInTheDocument();
    expect(within(dialog).getByText("8.5")).toBeInTheDocument();
    expect(within(dialog).getByText("確度")).toBeInTheDocument();
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

describe("ApproveClient 施策の手動追加(#255)", () => {
  it("施策を追加すると一覧の先頭に承認待ちで増える", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      {
        json: {
          success: true,
          item: {
            id: "n1",
            kind: "proposal",
            title: "手動の施策",
            subtitle: "MEO",
            details: [],
            score: 0,
          },
        },
      }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("施策名"), "手動の施策");
    await userEvent.click(screen.getByRole("button", { name: "追加する" }));

    expect(await screen.findByText("手動の施策")).toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 2件")).toBeInTheDocument();
  });

  it("0件の空状態からも施策を追加できる", async () => {
    mockFetchSequence({ json: { success: true, items: [] } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText(/承認待ちはありません/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加する" })).toBeInTheDocument();
  });
});

describe("ApproveClient フォーカス管理(#240)", () => {
  it("承認後は取り消すボタンへフォーカスが移る", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByRole("button", { name: "取り消す: 市川ページ" })).toHaveFocus();
  });

  it("取り消し後は承認ボタンへフォーカスが戻る", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));
    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toHaveFocus();
  });
});

describe("ApproveClient 合言葉エラーのA11y(#244)", () => {
  it("エラーは入力欄に aria-describedby/aria-invalid で関連付く", async () => {
    mockFetchSequence({ ok: false, status: 401, json: { success: false, error: "認証に失敗しました" } });
    render(<ApproveClient />);
    const input = screen.getByLabelText("合言葉");
    expect(input).not.toHaveAttribute("aria-invalid");

    await login("ちがう");
    await screen.findByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "passphrase-error");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "passphrase-error");
  });

  it("エラー時に入力欄へフォーカスが戻る", async () => {
    mockFetchSequence({ ok: false, status: 401, json: { success: false, error: "x" } });
    render(<ApproveClient />);
    const input = screen.getByLabelText("合言葉");
    await login("ちがう");
    await screen.findByRole("alert");
    expect(input).toHaveFocus();
  });

  it("未入力エラーでも入力欄へフォーカスが戻る", async () => {
    mockFetchSequence();
    render(<ApproveClient />);
    await userEvent.click(screen.getByRole("button", { name: "確認する" }));
    expect(screen.getByLabelText("合言葉")).toHaveFocus();
  });
});

describe("ApproveClient セクション分割/ソート(#242)", () => {
  it("施策/記事をセクション見出しで分け、優先度降順に並べる", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          { id: "p1", kind: "proposal", title: "低スコア施策", subtitle: "", details: [], score: 2 },
          { id: "p2", kind: "proposal", title: "高スコア施策", subtitle: "", details: [], score: 9 },
          { id: "i1", kind: "idea", title: "記事A", subtitle: "", details: [], score: 1 },
        ],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("高スコア施策");

    expect(screen.getByRole("heading", { name: "施策" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "記事" })).toBeInTheDocument();
    const titles = screen.getAllByText(/スコア施策/).map((el) => el.textContent);
    expect(titles).toEqual(["高スコア施策", "低スコア施策"]);
  });

  it("施策のみのときは記事セクションを出さない", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [{ id: "p1", kind: "proposal", title: "施策のみ", subtitle: "", details: [], score: 1 }],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("施策のみ");
    expect(screen.getByRole("heading", { name: "施策" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "記事" })).not.toBeInTheDocument();
  });

  it("記事のみのときは施策セクションを出さない", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [{ id: "i1", kind: "idea", title: "記事のみ", subtitle: "", details: [], score: 1 }],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("記事のみ");
    expect(screen.getByRole("heading", { name: "記事" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "施策" })).not.toBeInTheDocument();
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

describe("ApproveClient master-detail/詳細パネル(#275)", () => {
  it("一覧は高密度化し、詳細はインライン展開せず『詳細』ボタンを出す", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.queryByText("詳細を見る")).not.toBeInTheDocument();
    expect(screen.queryByText("優先度スコア")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "詳細: 市川ページ" })).toBeInTheDocument();
  });

  it("詳細ボタンでパネルを開き、閉じるボタンで閉じる", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("市川ページ")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("背景(オーバーレイ)クリックでパネルを閉じる", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "オーバーレイを閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("パネルから承認するとその場で保存し、パネルが閉じる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "承認" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "承認" }],
    });
  });

  it("パネルから却下もできる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "却下" }));

    expect(await screen.findByText("却下しました")).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "却下" }],
    });
  });

  it("処理済みの詳細パネルから承認待ちへ戻せる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await screen.findByText("承認しました");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "承認待ちに戻す" }));

    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "未処理" }],
    });
  });

  it("記事の詳細パネルには下書き生成スロット(準備中)とAI壁打ち枠がある", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "下書きを生成" })).toBeDisabled();
    expect(within(dialog).getByLabelText("AI壁打ち（準備中）")).toBeDisabled();
  });

  it("施策の詳細パネルには下書き生成スロットを出さない(AI壁打ち枠は出す)", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: "下書きを生成" })
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("AI壁打ち（準備中）")).toBeInTheDocument();
  });

  it("details も subtitle も無い項目でも詳細パネルを開ける", async () => {
    mockFetchSequence({
      json: { success: true, items: [{ id: "p1", kind: "proposal", title: "A", subtitle: "" }] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("A");
    await userEvent.click(screen.getByRole("button", { name: "詳細: A" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("ApproveClient 構成案修正(#42)", () => {
  async function openIdeaPanel() {
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    return screen.findByRole("dialog");
  }

  it("構成案を行ごとに表示し、コメントして修正を依頼できる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## 見出しA\n## 見出しB" })] } },
      { json: { success: true } }
    );
    const dialog = await openIdeaPanel();

    expect(within(dialog).getByText("## 見出しA")).toBeInTheDocument();
    expect(within(dialog).getByText("## 見出しB")).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText("コメント: ## 見出しA"),
      "3つを箇条書きで"
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "修正を依頼" }));

    expect(await within(dialog).findByText(/修正を依頼しました/)).toBeInTheDocument();
    const post = fn.mock.calls[1];
    expect(post[0]).toBe("/api/growth/revise");
    expect(post[1].method).toBe("POST");
    expect(JSON.parse(post[1].body)).toEqual({
      pageId: "i1",
      comments: [{ line: "## 見出しA", comment: "3つを箇条書きで" }],
    });
  });

  it("コメントが無いまま依頼すると促し、送信しない", async () => {
    const fn = mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A" })] },
    });
    const dialog = await openIdeaPanel();

    await userEvent.click(within(dialog).getByRole("button", { name: "修正を依頼" }));
    expect(await within(dialog).findByText(/コメントを1件以上/)).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(1); // login のみ・POST なし
  });

  it("修正処理中(409)は専用メッセージを出す", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 409, json: { success: false, error: "x" } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.type(within(dialog).getByLabelText("コメント: ## A"), "直して");
    await userEvent.click(within(dialog).getByRole("button", { name: "修正を依頼" }));
    expect(await within(dialog).findByText(/修正処理中/)).toBeInTheDocument();
  });

  it("既に修正中(reviseStatus)の記事はフォームを出さず依頼済みを示す", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "処理中" })] },
    });
    const dialog = await openIdeaPanel();
    expect(within(dialog).getByText(/最大5分/)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "修正を依頼" })
    ).not.toBeInTheDocument();
  });

  it("API エラー(error付き)はその内容を表示する", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 500, json: { success: false, error: "サーバー設定エラー" } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.type(within(dialog).getByLabelText("コメント: ## A"), "直して");
    await userEvent.click(within(dialog).getByRole("button", { name: "修正を依頼" }));
    expect(await within(dialog).findByText("サーバー設定エラー")).toBeInTheDocument();
  });

  it("error の無い失敗は既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { json: { success: false } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.type(within(dialog).getByLabelText("コメント: ## A"), "直して");
    await userEvent.click(within(dialog).getByRole("button", { name: "修正を依頼" }));
    expect(await within(dialog).findByText("修正依頼に失敗しました。")).toBeInTheDocument();
  });

  it("構成案が無い記事では修正セクションを出さない", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    const dialog = await openIdeaPanel();
    expect(
      within(dialog).queryByRole("button", { name: "修正を依頼" })
    ).not.toBeInTheDocument();
  });
});

describe("ApproveClient 合言葉認証オフ(#36 一時措置)", () => {
  beforeEach(() => {
    flags.authEnabled = false;
  });

  it("ゲートを出さず、合言葉なし(token空)で承認待ちを直接取得・表示する", async () => {
    const fn = mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);

    expect(await screen.findByText("市川ページ")).toBeInTheDocument();
    // 合言葉入力欄(ゲート)は出さない
    expect(screen.queryByLabelText("合言葉")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確認する" })).not.toBeInTheDocument();
    // token を付けずに取得する(空 token)
    expect(fn.mock.calls[0][0]).toBe("/api/growth/approve?token=");
  });

  it("承認の保存も token なし(空)で送る", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(fn.mock.calls[1][0]).toBe("/api/growth/approve?token=");
  });

  it("自動取得が失敗したらエラーと再読み込みを出し、再取得で復帰する", async () => {
    mockFetchSequence(
      { ok: false, status: 500, json: { success: false, error: "サーバー設定エラー" } },
      { json: { success: true, items: [proposalItem()] } }
    );
    render(<ApproveClient />);

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバー設定エラー");
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByText("市川ページ")).toBeInTheDocument();
  });
});
