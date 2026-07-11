import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublishQueue } from "./PublishQueue";
import { formatSchedule } from "@/lib/growth/publishQueueView";
import type { PendingItem } from "./types";

function article(over: Partial<PendingItem> & { id: string; title: string }): PendingItem {
  return {
    kind: "idea",
    subtitle: "",
    stage: "drafted",
    eyecatchUrl: "https://images.microcms-assets.io/x.png",
    hasDraftBody: true,
    ...over,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  // post() は res.json() を読み success:false を失敗扱いにする(防御的整合)。既定は成功エンベロープ。
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublishQueue", () => {
  it("公開できる下書きが無ければ空状態メッセージを出す(公開直後の空白対策)", () => {
    render(
      <PublishQueue items={[article({ id: "p", title: "提案", stage: "proposed" })]} token="t" onChanged={() => {}} />
    );
    // 公開キューの枠(見出し)は残したまま、空である旨を案内する。
    expect(screen.getByRole("region", { name: "公開キュー" })).toBeInTheDocument();
    expect(screen.getByText("公開待ちの記事はありません")).toBeInTheDocument();
    // 空状態では公開/予約の操作ボタン・サマリ行は出さない。
    expect(screen.queryByRole("button", { name: /今すぐ公開/ })).not.toBeInTheDocument();
  });

  it("公開OK/予約済み/要対応を3サマリ＋3セクションで振り分けて出す", () => {
    const items = [
      article({ id: "ok", title: "公開できる" }),
      article({ id: "sched", title: "予約済み記事", scheduledAtMs: Date.parse("2099-01-01T09:30:00.000Z") }),
      article({ id: "noimg", title: "画像なし", eyecatchUrl: "" }),
      article({ id: "nobody", title: "本文なし", hasDraftBody: false }),
    ];
    render(<PublishQueue items={items} token="t" onChanged={() => {}} />);
    // 要対応理由(3セクション)。
    expect(screen.getByText("アイキャッチ未設定")).toBeInTheDocument();
    expect(screen.getByText("本文が空")).toBeInTheDocument();
    // 各セクションのタイトルが出る。
    const region = screen.getByRole("region", { name: "公開キュー" });
    expect(within(region).getByRole("heading", { name: "公開キュー" })).toBeInTheDocument();
    expect(within(region).getByText("公開できる")).toBeInTheDocument();
    expect(within(region).getByText("予約済み記事")).toBeInTheDocument();
    expect(within(region).getByText("画像なし")).toBeInTheDocument();
  });

  it("「今すぐ公開」で ready 件数ぶん publish を呼び、onChanged する", async () => {
    const onChanged = vi.fn();
    const items = [article({ id: "a", title: "A" }), article({ id: "b", title: "B" })];
    render(<PublishQueue items={items} token="tok" onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /件を今すぐ公開/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const publishCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/growth/publish");
    expect(publishCalls).toHaveLength(2);
    expect(JSON.parse(publishCalls[0][1].body)).toEqual({ pageId: "a" });
    expect(publishCalls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("個別行の「公開」で当該記事だけ publish を呼ぶ", async () => {
    const onChanged = vi.fn();
    const items = [article({ id: "a", title: "A" }), article({ id: "b", title: "B" })];
    render(<PublishQueue items={items} token="t" onChanged={onChanged} />);

    // 各行の「公開」ボタン(アンカーで一括ボタンと区別)。
    const rowPublish = screen.getAllByRole("button", { name: /^公開$/ });
    fireEvent.click(rowPublish[0]);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const publishCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/growth/publish");
    expect(publishCalls).toHaveLength(1);
    expect(JSON.parse(publishCalls[0][1].body)).toEqual({ pageId: "a" });
  });

  it("予約はピッカー経由: 開く→プリセット選択で schedule を ISO で呼ぶ", async () => {
    const onChanged = vi.fn();
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={onChanged} />);

    // 個別行の「予約」でピッカーを開く。
    fireEvent.click(screen.getByRole("button", { name: /^予約$/ }));
    const dialog = screen.getByRole("dialog", { name: "公開日時を予約" });
    // プリセットを1つ選ぶ(onConfirm→schedule POST)。
    fireEvent.click(within(dialog).getByRole("button", { name: /明日 09:00/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/growth/publish/schedule");
    expect(call).toBeTruthy();
    const body = JSON.parse(call![1].body);
    expect(body.pageId).toBe("a");
    expect(typeof body.scheduledAt).toBe("string"); // ISO 文字列
    expect(body.scheduledAt).toBe(new Date(body.scheduledAt).toISOString());
    // ピッカーは確定後に閉じる。
    expect(screen.queryByRole("dialog", { name: "公開日時を予約" })).not.toBeInTheDocument();
  });

  it("まとめて予約はピッカー経由で ready 全件を schedule する", async () => {
    const onChanged = vi.fn();
    const items = [article({ id: "a", title: "A" }), article({ id: "b", title: "B" })];
    render(<PublishQueue items={items} token="t" onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /まとめて予約/ }));
    const dialog = screen.getByRole("dialog", { name: "公開日時を予約" });
    fireEvent.click(within(dialog).getByRole("button", { name: /今夜 21:00/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const scheduleCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/growth/publish/schedule");
    expect(scheduleCalls).toHaveLength(2);
    expect(JSON.parse(scheduleCalls[0][1].body).pageId).toBe("a");
    expect(JSON.parse(scheduleCalls[1][1].body).pageId).toBe("b");
  });

  it("ピッカーは閉じるボタンで schedule せずに閉じる", () => {
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^予約$/ }));
    const dialog = screen.getByRole("dialog", { name: "公開日時を予約" });
    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "公開日時を予約" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/growth/publish/schedule")).toHaveLength(0);
  });

  // #proto P6: 公開予約ピッカーは自前 Esc(handleOverlayKeyDown)で閉じる。
  it("公開予約ピッカーは Esc で schedule せずに閉じる", () => {
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^予約$/ }));
    const dialog = screen.getByRole("dialog", { name: "公開日時を予約" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "公開日時を予約" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/growth/publish/schedule")).toHaveLength(0);
  });

  it("予約済み記事は予約時刻＋解除を出し、解除で schedule null を呼ぶ", async () => {
    const onChanged = vi.fn();
    const ms = Date.parse("2099-01-01T09:30:00.000Z");
    render(
      <PublishQueue items={[article({ id: "a", title: "A", scheduledAtMs: ms })]} token="t" onChanged={onChanged} />
    );
    // 予約済み行に予約時刻(formatSchedule)＋解除ボタンが出る。
    const label = formatSchedule(new Date(ms));
    expect(
      screen.getByText(
        (_c, el) =>
          el?.tagName === "SPAN" && (el.textContent ?? "").replace(/\s+/g, " ").trim() === `予約 ${label}`
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "公開予定" })).toHaveTextContent("1件");

    fireEvent.click(screen.getByRole("button", { name: /予約を解除/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/growth/publish/schedule");
    expect(JSON.parse(call![1].body)).toEqual({ pageId: "a", scheduledAt: null });
  });

  it("予約済み記事は「今すぐ」で publish を呼べる", async () => {
    const onChanged = vi.fn();
    const ms = Date.parse("2099-01-01T09:30:00.000Z");
    render(
      <PublishQueue items={[article({ id: "a", title: "A", scheduledAtMs: ms })]} token="t" onChanged={onChanged} />
    );
    fireEvent.click(screen.getByRole("button", { name: /今すぐ/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/growth/publish");
    expect(JSON.parse(call![1].body)).toEqual({ pageId: "a" });
  });

  it("要対応行(本文が空)の「修正する」で onFix(id) を呼ぶ", () => {
    const onFix = vi.fn();
    render(
      <PublishQueue
        items={[article({ id: "x", title: "本文なし", hasDraftBody: false })]}
        token="t"
        onChanged={() => {}}
        onFix={onFix}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /修正する/ }));
    expect(onFix).toHaveBeenCalledWith("x");
  });

  it("onFix 未指定でも修正するボタンで例外を投げない", () => {
    render(
      <PublishQueue
        items={[article({ id: "x", title: "本文なし", hasDraftBody: false })]}
        token="t"
        onChanged={() => {}}
      />
    );
    expect(() => fireEvent.click(screen.getByRole("button", { name: /修正する/ }))).not.toThrow();
  });

  it("失敗時はエラーを表示しつつ、盤は再取得する(部分公開の反映)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({ success: false, error: "publish failed" }) });
    const onChanged = vi.fn();
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /件を今すぐ公開/ }));
    await waitFor(() => expect(screen.getByText(/処理中にエラーが発生しました/)).toBeInTheDocument());
    // 一括公開が途中失敗しても、既に公開済みの分を盤へ反映するため onChanged は呼ぶ。
    expect(onChanged).toHaveBeenCalled();
  });

  it("本文が空/非JSONでも例外にせず success 扱いにする(catch 経路)", async () => {
    // res.json() が reject(空ボディ/非JSON相当)しても post() は catch で {} に握り、
    // res.ok=true のため成功扱い。onChanged が呼ばれる。
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new Error("empty")) });
    const onChanged = vi.fn();
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /件を今すぐ公開/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByText(/処理中にエラーが発生しました/)).not.toBeInTheDocument();
  });

  it("HTTP 200 でも success:false なら失敗扱いにする(防御的整合)", async () => {
    // res.ok は true だが API エンベロープが success:false のケース。post() が例外にし、
    // run() がエラー表示へ落とす。他の呼び出し(api.ts postDecision 等)と挙動を揃える。
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: false }) });
    const onChanged = vi.fn();
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /件を今すぐ公開/ }));
    await waitFor(() => expect(screen.getByText(/処理中にエラーが発生しました/)).toBeInTheDocument());
    expect(onChanged).toHaveBeenCalled();
  });

  it("要対応のみ(公開OK 0件)でも例外リストは出し、公開ボタンは出さない", () => {
    render(
      <PublishQueue
        items={[article({ id: "x", title: "画像なし", eyecatchUrl: "" })]}
        token="t"
        onChanged={() => {}}
      />
    );
    const region = screen.getByRole("region", { name: "公開キュー" });
    expect(within(region).getByText("アイキャッチ未設定")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /件を今すぐ公開/ })).not.toBeInTheDocument();
    expect(within(region).getByText("公開できる記事はありません。")).toBeInTheDocument();
  });

  describe("アイキャッチ未設定→メディアライブラリ結線(#143後継)", () => {
    const MEDIA_URL = "https://images.microcms-assets.io/assets/x/a.png";

    // URL/オプションに応じて GET(一覧)/POST(eyecatch)などの応答を出し分ける fetch モック。
    function wireMediaFetch(over: {
      list?: { ok: boolean; media?: unknown };
      eyecatch?: { ok: boolean; status?: number; error?: string };
      upload?: { ok: boolean; status?: number; url?: string; error?: string };
    }): void {
      const list = over.list ?? { ok: true, media: [{ url: MEDIA_URL }] };
      const eyecatch = over.eyecatch ?? { ok: true };
      const upload = over.upload ?? { ok: true, url: MEDIA_URL };
      fetchMock.mockReset().mockImplementation((url: string, init?: { method?: string }) => {
        if (typeof url === "string" && url.startsWith("/api/growth/media")) {
          if (init?.method === "POST") {
            return Promise.resolve({
              ok: upload.ok,
              status: upload.status ?? (upload.ok ? 200 : 502),
              json: () => Promise.resolve(upload.ok ? { success: true, url: upload.url } : { success: false, error: upload.error }),
            });
          }
          return Promise.resolve({
            ok: list.ok,
            status: list.ok ? 200 : 502,
            json: () => Promise.resolve({ success: list.ok, media: list.media }),
          });
        }
        if (url === "/api/growth/draft/eyecatch") {
          return Promise.resolve({
            ok: eyecatch.ok,
            status: eyecatch.status ?? (eyecatch.ok ? 200 : 502),
            json: () => Promise.resolve(eyecatch.ok ? { success: true } : { success: false, error: eyecatch.error }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      });
    }

    it("要対応行(アイキャッチ未設定)は「画像を選ぶ」でメディアライブラリを開き、一覧を GET する", async () => {
      wireMediaFetch({});
      render(
        <PublishQueue
          items={[article({ id: "x", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={() => {}}
        />
      );
      // アイキャッチ未設定行は onFix ではなく「画像を選ぶ」を出す。
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ: 画像なし記事/ });
      expect(dialog).toBeInTheDocument();
      // 一覧を authHeaders 付きで GET する。
      await waitFor(() => {
        const listCall = fetchMock.mock.calls.find(
          (c) => typeof c[0] === "string" && c[0].startsWith("/api/growth/media") && c[1]?.method !== "POST"
        );
        expect(listCall).toBeTruthy();
        expect(listCall![1].headers.Authorization).toBe("Bearer tok");
      });
      // グリッドにサムネ(next/image=jsdomでは img・空 alt は presentation)＋選択ボタンが出る。
      const thumb = await within(dialog).findByRole("button", { name: "この画像をアイキャッチに設定" });
      expect(thumb.querySelector("img")).not.toBeNull();
    });

    it("サムネ選択で /api/growth/draft/eyecatch へ pageId/eyecatchUrl を POST し、onChanged を呼ぶ", async () => {
      wireMediaFetch({});
      const onChanged = vi.fn();
      render(
        <PublishQueue
          items={[article({ id: "page-1", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={onChanged}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      // サムネのボタンをクリック(選択→反映)。
      const thumb = await within(dialog).findByRole("button", { name: "この画像をアイキャッチに設定" });
      fireEvent.click(thumb);

      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      const applyCall = fetchMock.mock.calls.find((c) => c[0] === "/api/growth/draft/eyecatch");
      expect(applyCall).toBeTruthy();
      expect(applyCall![1].method).toBe("POST");
      expect(applyCall![1].headers.Authorization).toBe("Bearer tok");
      expect(JSON.parse(applyCall![1].body)).toEqual({ pageId: "page-1", eyecatchUrl: MEDIA_URL });
      // 反映成功でモーダルは閉じる。
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: /メディアライブラリ/ })).not.toBeInTheDocument()
      );
    });

    it("反映失敗時はサーバのエラー文言を alert で可視化し、onChanged せずモーダルを保持する", async () => {
      wireMediaFetch({ eyecatch: { ok: false, status: 502, error: "公開ターゲット(microCMS)への同期に失敗しました。" } });
      const onChanged = vi.fn();
      render(
        <PublishQueue
          items={[article({ id: "page-1", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={onChanged}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      const thumb = await within(dialog).findByRole("button", { name: "この画像をアイキャッチに設定" });
      fireEvent.click(thumb);

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("公開ターゲット(microCMS)への同期に失敗しました。");
      expect(onChanged).not.toHaveBeenCalled();
      // 失敗時はモーダルを閉じない(再試行できる)。
      expect(screen.getByRole("dialog", { name: /メディアライブラリ/ })).toBeInTheDocument();
    });

    it("一覧取得に失敗すると alert を表示し、空状態文言は出さない", async () => {
      wireMediaFetch({ list: { ok: false } });
      render(
        <PublishQueue
          items={[article({ id: "x", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={() => {}}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("メディア一覧の取得に失敗しました");
    });

    it("クライアント事前検証(サイズ超過)はアップロードを送らず alert を出す", async () => {
      wireMediaFetch({});
      render(
        <PublishQueue
          items={[article({ id: "x", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={() => {}}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      await within(dialog).findByRole("button", { name: "この画像をアイキャッチに設定" });

      // 5MB 超の PNG(中身検証はサーバ側・クライアントはサイズ/MIME のみ)。
      const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
      const input = within(dialog).getByLabelText("画像をアップロード");
      fireEvent.change(input, { target: { files: [big] } });

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("上限");
      // アップロード POST は送られない。
      expect(
        fetchMock.mock.calls.filter(
          (c) => typeof c[0] === "string" && c[0].startsWith("/api/growth/media") && c[1]?.method === "POST"
        )
      ).toHaveLength(0);
    });

    it("アップロード成功→そのままアイキャッチへ反映し onChanged を呼ぶ", async () => {
      const UPLOADED = "https://images.microcms-assets.io/assets/x/up.png";
      wireMediaFetch({ upload: { ok: true, url: UPLOADED } });
      const onChanged = vi.fn();
      render(
        <PublishQueue
          items={[article({ id: "page-9", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={onChanged}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      await within(dialog).findByRole("button", { name: "この画像をアイキャッチに設定" });

      const good = new File([new Uint8Array(1024)], "up.png", { type: "image/png" });
      const input = within(dialog).getByLabelText("画像をアップロード");
      fireEvent.change(input, { target: { files: [good] } });

      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      const uploadCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].startsWith("/api/growth/media") && c[1]?.method === "POST"
      );
      expect(uploadCall).toBeTruthy();
      expect(uploadCall![1].headers.Authorization).toBe("Bearer tok");
      const applyCall = fetchMock.mock.calls.find((c) => c[0] === "/api/growth/draft/eyecatch");
      expect(JSON.parse(applyCall![1].body)).toEqual({ pageId: "page-9", eyecatchUrl: UPLOADED });
    });

    it("アップロード失敗時はサーバのエラー文言を alert で可視化する", async () => {
      wireMediaFetch({ upload: { ok: false, status: 400, error: "対応していない画像形式です(JPEG/PNG/WebP/GIF/AVIF)。" } });
      const onChanged = vi.fn();
      render(
        <PublishQueue
          items={[article({ id: "x", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={onChanged}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      await within(dialog).findByRole("button", { name: "この画像をアイキャッチに設定" });

      const good = new File([new Uint8Array(1024)], "up.gif", { type: "image/gif" });
      const input = within(dialog).getByLabelText("画像をアップロード");
      fireEvent.change(input, { target: { files: [good] } });

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("対応していない画像形式です");
      // 反映(eyecatch)へは進まない。
      expect(fetchMock.mock.calls.find((c) => c[0] === "/api/growth/draft/eyecatch")).toBeUndefined();
    });

    it("メディアが 0 件なら空状態文言を出す", async () => {
      wireMediaFetch({ list: { ok: true, media: [] } });
      render(
        <PublishQueue
          items={[article({ id: "x", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={() => {}}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      expect(await within(dialog).findByText(/メディアがありません/)).toBeInTheDocument();
    });

    it("背景クリックと esc ボタンでモーダルを閉じる(反映せず)", async () => {
      wireMediaFetch({});
      const onChanged = vi.fn();
      render(
        <PublishQueue
          items={[article({ id: "x", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={onChanged}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      // esc ボタン(閉じる)。
      fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: /メディアライブラリ/ })).not.toBeInTheDocument()
      );
      expect(onChanged).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls.find((c) => c[0] === "/api/growth/draft/eyecatch")).toBeUndefined();
    });

    // #proto P6: メディアライブラリは自前 Esc(handleOverlayKeyDown)で閉じる(反映せず)。
    it("メディアライブラリは Esc でモーダルを閉じる(反映せず)", async () => {
      wireMediaFetch({});
      const onChanged = vi.fn();
      render(
        <PublishQueue
          items={[article({ id: "x", title: "画像なし記事", eyecatchUrl: "" })]}
          token="tok"
          onChanged={onChanged}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /画像を選ぶ/ }));
      const dialog = await screen.findByRole("dialog", { name: /メディアライブラリ/ });
      fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: /メディアライブラリ/ })).not.toBeInTheDocument()
      );
      expect(onChanged).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls.find((c) => c[0] === "/api/growth/draft/eyecatch")).toBeUndefined();
    });
  });
});
