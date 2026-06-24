import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EyecatchPicker } from "./EyecatchPicker";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const A1 = "https://images.microcms-assets.io/assets/a/1.png";
const A2 = "https://images.microcms-assets.io/assets/a/2.png";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  // 本番は readJsonObject 経由で res.text() を読むため text を供給する。
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mockFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setup(regenStatus?: "なし" | "依頼中" | "処理中" | "失敗") {
  const onReplaced = vi.fn();
  render(
    <EyecatchPicker pageId={PAGE_ID} token="" onReplaced={onReplaced} regenStatus={regenStatus} />
  );
  return { onReplaced };
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EyecatchPicker", () => {
  it("差し替えボタンでメディア一覧を読み込み、グリッド表示する", async () => {
    mockFetch(jsonResponse({ success: true, media: [{ url: A1 }, { url: A2 }] }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));

    const grid = await screen.findByRole("group", { name: "メディアから選択" });
    expect(within(grid).getAllByRole("button", { name: /アイキャッチに設定/ })).toHaveLength(2);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      "/api/growth/media"
    );
  });

  it("メディアを選ぶとアイキャッチを差し替え、onReplaced を呼ぶ", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true, media: [{ url: A1 }] }),
      jsonResponse({ success: true })
    );
    const { onReplaced } = setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "アイキャッチに設定 1" }));

    await waitFor(() => expect(onReplaced).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toContain("/api/growth/draft/eyecatch");
    expect(JSON.parse(init.body)).toEqual({ pageId: PAGE_ID, eyecatchUrl: A1 });
  });

  it("ファイルをアップロードすると、そのままアイキャッチに設定する", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true, media: [] }), // 初期一覧(空)
      jsonResponse({ success: true, url: A2 }), // アップロード
      jsonResponse({ success: true }) // eyecatch 差し替え
    );
    const { onReplaced } = setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await screen.findByText("メディアがまだありません。");

    const file = new File([new Uint8Array([1, 2, 3])], "new.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画像をアップロード"), file);

    await waitFor(() => expect(onReplaced).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[1][0]).toContain("/api/growth/media"); // upload
    expect(fetchFn.mock.calls[1][1].method).toBe("POST");
    const eyecatchBody = JSON.parse(fetchFn.mock.calls[2][1].body);
    expect(eyecatchBody).toEqual({ pageId: PAGE_ID, eyecatchUrl: A2 });
  });

  it("一覧取得に失敗したらエラーを出し、再試行できる", async () => {
    mockFetch(
      jsonResponse({ success: false, error: "x" }, false, 502),
      jsonResponse({ success: true, media: [{ url: A1 }] })
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/取得に失敗/);

    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByRole("button", { name: "アイキャッチに設定 1" })).toBeInTheDocument();
  });

  it("差し替えに失敗したらエラーを表示する", async () => {
    mockFetch(
      jsonResponse({ success: true, media: [{ url: A1 }] }),
      jsonResponse({ success: false, error: "差し替え失敗" }, false, 502)
    );
    const { onReplaced } = setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "アイキャッチに設定 1" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("差し替え失敗");
    expect(onReplaced).not.toHaveBeenCalled();
  });

  it("アップロード失敗(HTTPエラー)はエラーを表示し、差し替えしない", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true, media: [] }),
      jsonResponse({ success: false, error: "アップロード失敗" }, false, 502)
    );
    const { onReplaced } = setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画像をアップロード"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent("アップロード失敗");
    expect(onReplaced).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(2); // eyecatch までは進まない
  });

  it("アップロード応答が success:false(本文あり)でもフォールバック文言を出す", async () => {
    mockFetch(
      jsonResponse({ success: true, media: [] }),
      jsonResponse({ success: false }) // ok:true・error 無し
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画像をアップロード"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("アップロードに失敗しました。");
  });

  it("アップロード成功でも url が欠落していれば差し替えしない", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true, media: [] }),
      jsonResponse({ success: true }) // url 無し
    );
    const { onReplaced } = setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画像をアップロード"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("アップロードに失敗しました。");
    expect(onReplaced).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("ファイル未選択の change は何もしない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true, media: [] }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const input = screen.getByLabelText("画像をアップロード");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { files: [] } });
    expect(fetchFn).toHaveBeenCalledTimes(1); // 一覧のみ
  });

  it("一覧が success:false(HTTPは200)でもエラー表示する", async () => {
    mockFetch(jsonResponse({ success: false })); // ok:true・success:false
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/取得に失敗/);
  });

  it("media 欄が無い応答は空グリッド扱い", async () => {
    mockFetch(jsonResponse({ success: true })); // media 無し
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    expect(await screen.findByText("メディアがまだありません。")).toBeInTheDocument();
  });

  it("差し替えが success:false(本文あり)ならフォールバック文言", async () => {
    mockFetch(
      jsonResponse({ success: true, media: [{ url: A1 }] }),
      jsonResponse({ success: false }) // ok:true・error 無し
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "アイキャッチに設定 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("差し替えに失敗しました。");
  });

  it("差し替えで fetch が非Errorでrejectしてもフォールバック文言", async () => {
    const fn = vi.fn();
    fn.mockResolvedValueOnce(jsonResponse({ success: true, media: [{ url: A1 }] }));
    fn.mockRejectedValueOnce("network boom"); // 非 Error
    vi.stubGlobal("fetch", fn);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "アイキャッチに設定 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("差し替えに失敗しました。");
  });

  it("キャンセルでピッカーを閉じる", async () => {
    mockFetch(jsonResponse({ success: true, media: [{ url: A1 }] }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチを差し替え" }));
    await screen.findByRole("group", { name: "メディアから選択" });
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("group", { name: "メディアから選択" })).not.toBeInTheDocument();
  });

  it("AIで再生成: 指示を添えて依頼し、完了メッセージを出す(#144)", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチをAIで再生成" }));
    await screen.findByRole("group", { name: "アイキャッチをAIで再生成" });
    await userEvent.type(
      screen.getByLabelText("再生成の指示（任意・空ならおまかせ）"),
      "夏らしく",
    );
    await userEvent.click(screen.getByRole("button", { name: "再生成を依頼" }));

    expect(await screen.findByText(/再生成を依頼しました/)).toBeInTheDocument();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/growth/eyecatch/regen");
    expect(JSON.parse(init.body)).toEqual({ pageId: PAGE_ID, instruction: "夏らしく" });
  });

  it("AIで再生成: 指示なし(空)でも依頼できる(#144)", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチをAIで再生成" }));
    await userEvent.click(await screen.findByRole("button", { name: "再生成を依頼" }));
    await screen.findByText(/再生成を依頼しました/);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ pageId: PAGE_ID, instruction: "" });
  });

  it("AIで再生成: 依頼失敗はエラーを表示する(#144)", async () => {
    mockFetch(jsonResponse({ success: false, error: "処理中です" }, false, 409));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチをAIで再生成" }));
    await userEvent.click(await screen.findByRole("button", { name: "再生成を依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("処理中です");
  });

  it("AIで再生成: 失敗応答に理由が無ければフォールバック文言(#144)", async () => {
    mockFetch(jsonResponse({ success: false }, false, 502));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチをAIで再生成" }));
    await userEvent.click(await screen.findByRole("button", { name: "再生成を依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("再生成の依頼に失敗しました。");
  });

  it("AIで再生成: キャンセルで閉じる(#144)", async () => {
    mockFetch();
    setup();
    await userEvent.click(screen.getByRole("button", { name: "アイキャッチをAIで再生成" }));
    await screen.findByRole("group", { name: "アイキャッチをAIで再生成" });
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("group", { name: "アイキャッチをAIで再生成" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "アイキャッチをAIで再生成" })).toBeInTheDocument();
  });

  it("再生成 依頼中/処理中: 永続バッジを出し再生成ボタンを無効化する(#166)", () => {
    mockFetch();
    setup("処理中");
    expect(screen.getByRole("status")).toHaveTextContent("AI再生成 処理中");
    expect(screen.getByRole("button", { name: "アイキャッチをAIで再生成" })).toBeDisabled();
  });

  it("再生成 失敗: 失敗バッジを出し再依頼できる(#166)", () => {
    mockFetch();
    setup("失敗");
    expect(screen.getByRole("status")).toHaveTextContent("AI再生成に失敗しました");
    expect(screen.getByRole("button", { name: "アイキャッチをAIで再生成" })).toBeEnabled();
  });

  it("再生成 なし: バッジを出さず再生成ボタンは有効(#166)", () => {
    mockFetch();
    setup("なし");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "アイキャッチをAIで再生成" })).toBeEnabled();
  });
});
