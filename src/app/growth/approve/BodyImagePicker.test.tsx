import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BodyImagePicker } from "./BodyImagePicker";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const IMG1 = "https://images.microcms-assets.io/assets/a/1.png";
const IMG2 = "https://images.microcms-assets.io/assets/b/2.png";
const MEDIA = "https://images.microcms-assets.io/assets/c/new.png";
const BODY = `<p>導入</p><figure><img src="${IMG1}" alt="図1"></figure><figure><img src="${IMG2}" alt="図2"></figure>`;

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
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

function setup(bodyHtml = BODY) {
  const onSaved = vi.fn();
  render(<BodyImagePicker pageId={PAGE_ID} token="" bodyHtml={bodyHtml} onSaved={onSaved} />);
  return { onSaved };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("BodyImagePicker", () => {
  it("本文画像が無ければ何も描画しない", () => {
    const { container } = render(
      <BodyImagePicker pageId={PAGE_ID} token="" bodyHtml="<p>本文だけ</p>" onSaved={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("本文画像を一覧し、差し替えボタンを出す", () => {
    setup();
    expect(screen.getByRole("button", { name: "本文画像1を差し替え" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本文画像2を差し替え" })).toBeInTheDocument();
  });

  it("差し替え→メディア選択で該当画像を差し替え保存し、onSaved を呼ぶ", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true, media: [{ url: MEDIA }] }), // メディア一覧
      jsonResponse({ success: true }), // draft/edit 保存
    );
    const { onSaved } = setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像2を差し替え" }));
    const grid = await screen.findByRole("group", { name: "メディアから選択" });
    await userEvent.click(within(grid).getByRole("button", { name: "この画像に差し替え 1" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toContain("/api/growth/draft/edit");
    const sent = JSON.parse(init.body);
    expect(sent.pageId).toBe(PAGE_ID);
    // 2枚目(図2)の src だけが差し替わり、1枚目は保持される
    expect(sent.bodyHtml).toContain(`<img src="${MEDIA}" alt="図2">`);
    expect(sent.bodyHtml).toContain(`<img src="${IMG1}" alt="図1">`);
  });

  it("アップロード→そのまま該当画像を差し替える", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true, media: [] }), // 一覧(空)
      jsonResponse({ success: true, url: MEDIA }), // アップロード
      jsonResponse({ success: true }), // 保存
    );
    const { onSaved } = setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画像をアップロード"), file);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[1][0]).toContain("/api/growth/media"); // upload
    const sent = JSON.parse(fetchFn.mock.calls[2][1].body);
    expect(sent.bodyHtml).toContain(`<img src="${MEDIA}" alt="図1">`);
  });

  it("メディア取得失敗→エラーと再読み込み", async () => {
    mockFetch(
      jsonResponse({ success: false }, false, 502),
      jsonResponse({ success: true, media: [{ url: MEDIA }] }),
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/取得に失敗/);
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByRole("button", { name: "この画像に差し替え 1" })).toBeInTheDocument();
  });

  it("保存失敗はエラーを出し onSaved を呼ばない", async () => {
    const { onSaved } = (() => {
      mockFetch(
        jsonResponse({ success: true, media: [{ url: MEDIA }] }),
        jsonResponse({ success: false, error: "保存失敗" }, false, 502),
      );
      return setup();
    })();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "この画像に差し替え 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失敗");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("アップロード失敗(本文あり無し)はフォールバック文言で止まる", async () => {
    mockFetch(
      jsonResponse({ success: true, media: [] }),
      jsonResponse({ success: false }, false, 500), // upload 失敗・error 無し
    );
    const { onSaved } = setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画像をアップロード"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("アップロードに失敗しました。");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("アップロード成功でも url 欠落なら差し替えない", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true, media: [] }),
      jsonResponse({ success: true }), // url 無し
    );
    const { onSaved } = setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("画像をアップロード"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("アップロードに失敗しました。");
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("ファイル未選択の change は何もしない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true, media: [] }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await screen.findByText("メディアがまだありません。");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText("画像をアップロード"), { target: { files: [] } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("キャンセルでグリッドを閉じる", async () => {
    mockFetch(jsonResponse({ success: true, media: [{ url: MEDIA }] }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await screen.findByRole("group", { name: "メディアから選択" });
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("group", { name: "メディアから選択" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本文画像1を差し替え" })).toBeInTheDocument();
  });

  it("説明(alt)が無い画像は『（説明なし）』を出す", () => {
    setup(`<figure><img src="${IMG1}"></figure>`);
    expect(screen.getByText("（説明なし）")).toBeInTheDocument();
  });

  it("一覧が success:false(200)でもエラー扱い", async () => {
    mockFetch(jsonResponse({ success: false })); // ok:true・success:false
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/取得に失敗/);
  });

  it("media 欄が無い応答は空グリッド扱い", async () => {
    mockFetch(jsonResponse({ success: true })); // media 無し
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    expect(await screen.findByText("メディアがまだありません。")).toBeInTheDocument();
  });

  it("保存が success:false(本文あり無し)ならフォールバック文言", async () => {
    mockFetch(
      jsonResponse({ success: true, media: [{ url: MEDIA }] }),
      jsonResponse({ success: false }), // ok:true・error 無し
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "この画像に差し替え 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("差し替えの保存に失敗しました。");
  });

  it("microCMS 以外の URL は保存せずエラー(クライアント防御 M-1)", async () => {
    const evil = "https://evil.com/x.png";
    const fetchFn = mockFetch(jsonResponse({ success: true, media: [{ url: evil }] }));
    const { onSaved } = setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "この画像に差し替え 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("無効な画像URL");
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1); // 一覧のみ・保存しない
  });

  it("保存で fetch が非Errorでrejectしてもフォールバック文言", async () => {
    const fn = vi.fn();
    fn.mockResolvedValueOnce(jsonResponse({ success: true, media: [{ url: MEDIA }] }));
    fn.mockRejectedValueOnce("boom"); // 非 Error
    vi.stubGlobal("fetch", fn);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    await userEvent.click(await screen.findByRole("button", { name: "この画像に差し替え 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("差し替えの保存に失敗しました。");
  });
});

describe("BodyImagePicker AI再生成(#156)", () => {
  it("各画像にAI再生成ボタンを出す", () => {
    setup();
    expect(screen.getByRole("button", { name: "本文画像1をAIで再生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本文画像2をAIで再生成" })).toBeInTheDocument();
  });

  it("再生成を依頼すると対象src・指示(trim)で POST し、依頼メッセージを出す", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像2をAIで再生成" }));
    await userEvent.type(screen.getByLabelText(/再生成の指示/), "  図解で  ");
    await userEvent.click(screen.getByRole("button", { name: "再生成を依頼" }));

    expect(await screen.findByRole("status")).toHaveTextContent("AI再生成を依頼しました。");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/growth/body-image/regen");
    const sent = JSON.parse(init.body);
    expect(sent.pageId).toBe(PAGE_ID);
    expect(sent.targetSrc).toBe(IMG2); // 2枚目を対象
    expect(sent.instruction).toBe("図解で"); // trim される
    // 依頼後はパネルが閉じ、再生成ボタンが戻る
    expect(screen.getByRole("button", { name: "本文画像2をAIで再生成" })).toBeInTheDocument();
  });

  it("指示が空でも依頼できる", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1をAIで再生成" }));
    await userEvent.click(screen.getByRole("button", { name: "再生成を依頼" }));
    await screen.findByRole("status");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).instruction).toBe("");
  });

  it("依頼失敗(error あり)はその文言を出す", async () => {
    mockFetch(jsonResponse({ success: false, error: "処理中です" }, false, 409));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1をAIで再生成" }));
    await userEvent.click(screen.getByRole("button", { name: "再生成を依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("処理中です");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("依頼失敗(error なし)はフォールバック文言", async () => {
    mockFetch(jsonResponse({ success: false })); // ok:true・error 無し
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1をAIで再生成" }));
    await userEvent.click(screen.getByRole("button", { name: "再生成を依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("再生成の依頼に失敗しました。");
  });

  it("fetch が非Errorでrejectしてもフォールバック文言", async () => {
    const fn = vi.fn();
    fn.mockRejectedValueOnce("boom");
    vi.stubGlobal("fetch", fn);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1をAIで再生成" }));
    await userEvent.click(screen.getByRole("button", { name: "再生成を依頼" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("再生成の依頼に失敗しました。");
  });

  it("キャンセルで再生成パネルを閉じる", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1をAIで再生成" }));
    expect(screen.getByRole("group", { name: "AIで再生成" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("group", { name: "AIで再生成" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本文画像1をAIで再生成" })).toBeInTheDocument();
  });

  it("差し替えと再生成は排他(再生成を開くと差し替えグリッドは出ない)", async () => {
    mockFetch(jsonResponse({ success: true, media: [{ url: MEDIA }] }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1を差し替え" }));
    expect(await screen.findByRole("group", { name: "メディアから選択" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "本文画像2をAIで再生成" }));
    expect(screen.getByRole("group", { name: "AIで再生成" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "メディアから選択" })).not.toBeInTheDocument();
  });

  it("再生成を開くと差し替えは閉じ、差し替えを開くと再生成は閉じる", async () => {
    mockFetch(jsonResponse({ success: true, media: [{ url: MEDIA }] }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "本文画像1をAIで再生成" }));
    expect(screen.getByRole("group", { name: "AIで再生成" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "本文画像2を差し替え" }));
    expect(await screen.findByRole("group", { name: "メディアから選択" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "AIで再生成" })).not.toBeInTheDocument();
  });
});
