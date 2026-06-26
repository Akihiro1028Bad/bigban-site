import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublishQueue } from "./PublishQueue";

interface Article {
  id: string;
  title: string;
  stage: string;
  eyecatchUrl?: string;
  hasDraftBody?: boolean;
  scheduledAtMs?: number | null;
}

function article(over: Partial<Article> & { id: string; title: string }): Article {
  return {
    stage: "drafted",
    eyecatchUrl: "https://images.microcms-assets.io/x.png",
    hasDraftBody: true,
    ...over,
  };
}

/** 既定は折りたたみ。トグルを押して中身を開く。 */
function expand(): void {
  fireEvent.click(screen.getByRole("button", { name: /公開キュー/ }));
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

  it("公開OKと要対応を理由付きで分けて出す", () => {
    const items = [
      article({ id: "ok", title: "公開できる" }),
      article({ id: "noimg", title: "画像なし", eyecatchUrl: "" }),
      article({ id: "nobody", title: "本文なし", hasDraftBody: false }),
    ];
    render(<PublishQueue items={items} token="t" onChanged={() => {}} />);
    expect(screen.getByText(/公開OK 1 件 \/ 要対応 2 件/)).toBeInTheDocument();
    expand();
    expect(screen.getByText("アイキャッチ未設定")).toBeInTheDocument();
    expect(screen.getByText("本文が空")).toBeInTheDocument();
  });

  it("「今すぐ公開」で ready 件数ぶん publish を呼び、onChanged する", async () => {
    const onChanged = vi.fn();
    const items = [article({ id: "a", title: "A" }), article({ id: "b", title: "B" })];
    render(<PublishQueue items={items} token="tok" onChanged={onChanged} />);
    expand();

    fireEvent.click(screen.getByRole("button", { name: /今すぐ公開/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    const publishCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/growth/publish");
    expect(publishCalls).toHaveLength(2);
    expect(JSON.parse(publishCalls[0][1].body)).toEqual({ pageId: "a" });
    expect(publishCalls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("予約時刻が未入力なら予約ボタンは無効、入力すると schedule を呼ぶ", async () => {
    const onChanged = vi.fn();
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={onChanged} />);
    expand();

    const scheduleBtn = screen.getByRole("button", { name: /この時刻に予約/ });
    expect(scheduleBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/予約時刻/), { target: { value: "2099-01-01T09:30" } });
    expect(scheduleBtn).toBeEnabled();
    fireEvent.click(scheduleBtn);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/growth/publish/schedule");
    expect(call).toBeTruthy();
    const body = JSON.parse(call![1].body);
    expect(body.pageId).toBe("a");
    expect(typeof body.scheduledAt).toBe("string"); // ISO 文字列
  });

  it("予約済み記事は予約時刻＋解除を出し、解除で schedule null を呼ぶ", async () => {
    const onChanged = vi.fn();
    const ms = Date.parse("2099-01-01T09:30:00.000Z");
    render(
      <PublishQueue items={[article({ id: "a", title: "A", scheduledAtMs: ms })]} token="t" onChanged={onChanged} />
    );
    expand();
    expect(screen.getByText(/予約 2099-01-01 09:30 UTC/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "解除" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/growth/publish/schedule");
    expect(JSON.parse(call![1].body)).toEqual({ pageId: "a", scheduledAt: null });
  });

  it("失敗時はエラーを表示し onChanged は呼ばない", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    const onChanged = vi.fn();
    render(<PublishQueue items={[article({ id: "a", title: "A" })]} token="t" onChanged={onChanged} />);
    expand();

    fireEvent.click(screen.getByRole("button", { name: /今すぐ公開/ }));
    await waitFor(() => expect(screen.getByText(/処理中にエラーが発生しました/)).toBeInTheDocument());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("要対応のみ(公開OK 0件)でも例外リストは出す", () => {
    render(
      <PublishQueue
        items={[article({ id: "x", title: "画像なし", eyecatchUrl: "" })]}
        token="t"
        onChanged={() => {}}
      />
    );
    expand();
    const region = screen.getByRole("region", { name: "公開キュー" });
    expect(within(region).getByText("アイキャッチ未設定")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /今すぐ公開/ })).not.toBeInTheDocument();
  });
});
