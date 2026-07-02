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
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublishQueue", () => {
  it("下書きが無ければ何も描画しない", () => {
    const { container } = render(
      <PublishQueue items={[article({ id: "p", title: "提案", stage: "proposed" })]} token="t" onChanged={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
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

  it("要対応行の「修正する」で onFix(id) を呼ぶ", () => {
    const onFix = vi.fn();
    render(
      <PublishQueue
        items={[article({ id: "x", title: "画像なし", eyecatchUrl: "" })]}
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
        items={[article({ id: "x", title: "画像なし", eyecatchUrl: "" })]}
        token="t"
        onChanged={() => {}}
      />
    );
    expect(() => fireEvent.click(screen.getByRole("button", { name: /修正する/ }))).not.toThrow();
  });

  it("失敗時はエラーを表示しつつ、盤は再取得する(部分公開の反映)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    const onChanged = vi.fn();
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /件を今すぐ公開/ }));
    await waitFor(() => expect(screen.getByText(/処理中にエラーが発生しました/)).toBeInTheDocument());
    // 一括公開が途中失敗しても、既に公開済みの分を盤へ反映するため onChanged は呼ぶ。
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
});
