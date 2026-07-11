// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { uploadMedia, mimeFromExtension } from "./media";
import type { FetchFn } from "./http";

describe("mimeFromExtension", () => {
  it("主要な画像拡張子を MIME に変換する", () => {
    expect(mimeFromExtension("eyecatch.jpg")).toBe("image/jpeg");
    expect(mimeFromExtension("eyecatch.jpeg")).toBe("image/jpeg");
    expect(mimeFromExtension("photo.PNG")).toBe("image/png");
    expect(mimeFromExtension("art.webp")).toBe("image/webp");
  });

  it("未知の拡張子は octet-stream にフォールバックする", () => {
    expect(mimeFromExtension("file.xyz")).toBe("application/octet-stream");
    expect(mimeFromExtension("noext")).toBe("application/octet-stream");
  });
});

describe("uploadMedia", () => {
  const deps = {
    readFile: vi.fn(async () => Buffer.from("fake-image-bytes")),
  };

  it("管理APIのメディアエンドポイントに X-MICROCMS-API-KEY 付きで POST し、url を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        url: "https://images.microcms-assets.io/assets/x/y/eyecatch.jpg",
      }),
      text: async () => "",
    });

    const url = await uploadMedia("/tmp/eyecatch.jpg", {
      serviceDomain: "thepicklebang",
      apiKey: "mgmt-key",
      fetchFn,
      readFile: deps.readFile,
    });

    expect(url).toBe(
      "https://images.microcms-assets.io/assets/x/y/eyecatch.jpg"
    );
    const [calledUrl, init] = fetchFn.mock.calls[0];
    expect(calledUrl).toBe(
      "https://thepicklebang.microcms-management.io/api/v1/media"
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-MICROCMS-API-KEY"]).toBe(
      "mgmt-key"
    );
    expect(init.body).toBeInstanceOf(FormData);
    expect(deps.readFile).toHaveBeenCalledWith("/tmp/eyecatch.jpg");
  });

  it("API がエラーを返した場合は status を含むエラーを投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({}),
      text: async () => "file too large",
    });

    await expect(
      uploadMedia("/tmp/big.jpg", {
        serviceDomain: "thepicklebang",
        apiKey: "k",
        fetchFn,
        readFile: deps.readFile,
      })
    ).rejects.toThrow(/413/);
  });

  it("レスポンスに url が無い場合はエラーを投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({}),
      text: async () => "",
    });

    await expect(
      uploadMedia("/tmp/x.jpg", {
        serviceDomain: "thepicklebang",
        apiKey: "k",
        fetchFn,
        readFile: deps.readFile,
      })
    ).rejects.toThrow(/url/);
  });
});
