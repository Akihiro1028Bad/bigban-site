// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "@/lib/growth/notion";
import {
  fetchMediaList,
  MEDIA_ALLOWED_MIME,
  MEDIA_LIST_DEFAULT_LIMIT,
  MEDIA_LIST_MAX_LIMIT,
  MEDIA_MAX_UPLOAD_BYTES,
  parseMediaListParams,
  uploadMediaBlob,
  validateUpload,
} from "@/lib/growth/media";

function res(ok: boolean, body: unknown, status = ok ? 200 : 500): HttpResponse {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("validateUpload", () => {
  it("許可MIME・サイズ内なら ok", () => {
    expect(validateUpload({ size: 1024, type: "image/png" })).toEqual({ ok: true });
    for (const type of MEDIA_ALLOWED_MIME) {
      expect(validateUpload({ size: 10, type }).ok).toBe(true);
    }
  });

  it("空ファイル(size 0)は弾く", () => {
    const r = validateUpload({ size: 0, type: "image/png" });
    expect(r.ok).toBe(false);
  });

  it("上限超過は弾く", () => {
    const r = validateUpload({ size: MEDIA_MAX_UPLOAD_BYTES + 1, type: "image/png" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("5MB") });
  });

  it("未対応MIMEは弾く", () => {
    const r = validateUpload({ size: 100, type: "application/pdf" });
    expect(r.ok).toBe(false);
  });
});

describe("parseMediaListParams", () => {
  function parse(qs: string) {
    return parseMediaListParams(new URLSearchParams(qs));
  }

  it("未指定は既定(limit=30, offset=0)", () => {
    expect(parse("")).toEqual({ limit: MEDIA_LIST_DEFAULT_LIMIT, offset: 0 });
  });

  it("limit は 1..MAX にクランプ、offset は 0 以上", () => {
    expect(parse("limit=50&offset=20")).toEqual({ limit: 50, offset: 20 });
    expect(parse("limit=0").limit).toBe(1); // 下限
    expect(parse("limit=999").limit).toBe(MEDIA_LIST_MAX_LIMIT); // 上限
    expect(parse("offset=-5").offset).toBe(0); // 下限
  });

  it("非数値・空文字は既定に落とす", () => {
    expect(parse("limit=abc&offset=xyz")).toEqual({
      limit: MEDIA_LIST_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(parse("limit=").limit).toBe(MEDIA_LIST_DEFAULT_LIMIT);
  });
});

const OPTS = (fetchFn: FetchFn) => ({
  serviceDomain: "thepicklebang",
  apiKey: "mgmt-key",
  fetchFn,
});

describe("fetchMediaList", () => {
  it("MANAGEMENT エンドポイントへ GET し、media/totalCount を返す", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => res(true, {
        media: [{ url: "https://images.microcms-assets.io/a.png", width: 1200 }],
        totalCount: 1,
        limit: 30,
        offset: 0,
      })
    );
    const result = await fetchMediaList({ limit: 30, offset: 0 }, OPTS(fetchFn));
    expect(result).toEqual({
      media: [{ url: "https://images.microcms-assets.io/a.png" }],
      totalCount: 1,
      limit: 30,
      offset: 0,
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://thepicklebang.microcms-management.io/api/v1/media?limit=30&offset=0"
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-MICROCMS-API-KEY"]).toBe("mgmt-key");
  });

  it("ページング欄が無い応答は引数の limit/offset・件数で補完する", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => res(true, { media: [{ url: "u1" }, { url: "u2" }] }));
    const result = await fetchMediaList({ limit: 10, offset: 5 }, OPTS(fetchFn));
    expect(result).toEqual({
      media: [{ url: "u1" }, { url: "u2" }],
      totalCount: 2,
      limit: 10,
      offset: 5,
    });
  });

  it("HTTP エラーは throw(理由を含む)", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => res(false, "forbidden", 403));
    await expect(fetchMediaList({ limit: 30, offset: 0 }, OPTS(fetchFn))).rejects.toThrow(/403/);
  });
});

describe("uploadMediaBlob", () => {
  it("MANAGEMENT へ multipart POST し、url を返す", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => res(true, { url: "https://images.microcms-assets.io/x.png" }));
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const out = await uploadMediaBlob({ blob, fileName: "x.png" }, OPTS(fetchFn));
    expect(out).toEqual({ url: "https://images.microcms-assets.io/x.png" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://thepicklebang.microcms-management.io/api/v1/media");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("url 欠落の応答は throw", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => res(true, {}));
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    await expect(uploadMediaBlob({ blob, fileName: "a.png" }, OPTS(fetchFn))).rejects.toThrow(/url/);
  });

  it("HTTP エラーは throw", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => res(false, "too large", 413));
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    await expect(uploadMediaBlob({ blob, fileName: "a.png" }, OPTS(fetchFn))).rejects.toThrow(/413/);
  });
});
