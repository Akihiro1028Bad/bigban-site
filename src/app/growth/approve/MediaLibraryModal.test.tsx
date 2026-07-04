import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MediaLibraryModal } from "./MediaLibraryModal";

const ASSET = "https://images.microcms-assets.io/assets/abc/pic.png";
const OLD = "https://images.microcms-assets.io/assets/abc/old.png";
const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

/** GET 一覧は 1 件、POST(反映)は success:true を返す fetch スタブ。POST の body を calls で拾う。 */
function stubFetch(): ReturnType<typeof vi.fn> {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, media: [{ url: ASSET }] }),
      });
    }
    // POST(反映先)。呼び出しは fn.mock.calls から検証する。
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** POST 呼び出し(url, body)を fetch スタブの calls から取り出す。 */
function postCall(fn: ReturnType<typeof vi.fn>): { url: string; body: unknown } {
  const call = fn.mock.calls.find(([, init]) => (init?.method ?? "GET").toUpperCase() === "POST");
  const [url, init] = call as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

describe("MediaLibraryModal 本文画像モード", () => {
  it("既定(eyecatch)は /api/growth/draft/eyecatch へ POST する", async () => {
    const fn = stubFetch();
    const onApplied = vi.fn();
    render(
      <MediaLibraryModal token="" pageId={PAGE_ID} heading="記事" onClose={vi.fn()} onApplied={onApplied} />
    );
    await userEvent.click(await screen.findByRole("button", { name: "この画像をアイキャッチに設定" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const { url, body } = postCall(fn);
    expect(url).toBe("/api/growth/draft/eyecatch");
    expect(body).toEqual({ pageId: PAGE_ID, eyecatchUrl: ASSET });
  });

  it("本文画像モードは /api/growth/draft/body-image へ targetSrc 付きで POST する", async () => {
    const fn = stubFetch();
    const onApplied = vi.fn();
    render(
      <MediaLibraryModal
        token=""
        pageId={PAGE_ID}
        heading="記事"
        mode="body-image"
        targetSrc={OLD}
        onClose={vi.fn()}
        onApplied={onApplied}
      />
    );
    await userEvent.click(await screen.findByRole("button", { name: "この画像を本文画像に設定" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const { url, body } = postCall(fn);
    expect(url).toBe("/api/growth/draft/body-image");
    expect(body).toEqual({ pageId: PAGE_ID, targetSrc: OLD, newUrl: ASSET });
  });
});
