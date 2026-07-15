// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "@/lib/growth/notion";
import {
  detectImageMime,
  fetchMediaList,
  isMicrocmsAssetUrl,
  MEDIA_ALLOWED_MIME,
  MEDIA_LIST_DEFAULT_LIMIT,
  MEDIA_LIST_MAX_LIMIT,
  MEDIA_MAX_UPLOAD_BYTES,
  parseMediaListParams,
  sanitizeFileName,
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

  it("head が画像のマジックバイトなら ok(#SEC-06)", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateUpload({ size: 100, type: "image/png", head: png })).toEqual({ ok: true });
  });

  it("申告は画像でも中身が画像でない(SVG偽装)なら弾く(#SEC-06)", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>");
    const r = validateUpload({ size: 100, type: "image/png", head: svg });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("偽装") });
  });

  it("申告MIMEとマジックバイトの画像形式が違う場合は弾く", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateUpload({ size: 100, type: "image/jpeg", head: png })).toEqual({
      ok: false,
      error: expect.stringContaining("一致"),
    });
  });
});

describe("detectImageMime", () => {
  const sig = (bytes: number[]): Uint8Array => new Uint8Array(bytes);
  it("各画像形式のマジックバイトを判定する", () => {
    expect(detectImageMime(sig([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectImageMime(sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMime(sig([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    expect(detectImageMime(sig([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe(
      "image/webp"
    );
    expect(detectImageMime(sig([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]))).toBe(
      "image/avif"
    );
  });
  it("画像でない(SVG/HTML/ゼロ)は null", () => {
    expect(detectImageMime(new TextEncoder().encode("<svg "))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode("<!DOCTYPE html>"))).toBeNull();
    expect(detectImageMime(sig([0, 0, 0, 0]))).toBeNull();
  });
});

describe("isMicrocmsAssetUrl", () => {
  it("microCMS アセット(https・*.microcms-assets.io)のみ true", () => {
    expect(isMicrocmsAssetUrl("https://images.microcms-assets.io/abc/x.png")).toBe(true);
  });

  it("非文字列・不正URL・http・別ホストは false", () => {
    expect(isMicrocmsAssetUrl(123)).toBe(false);
    expect(isMicrocmsAssetUrl("not a url")).toBe(false);
    expect(isMicrocmsAssetUrl("http://images.microcms-assets.io/x.png")).toBe(false); // http
    expect(isMicrocmsAssetUrl("https://evil.com/x.png")).toBe(false);
  });

  it("サフィックス偽装ホスト・別サブドメインは false(厳密ホスト一致)", () => {
    expect(isMicrocmsAssetUrl("https://images.microcms-assets.io.evil.com/x.png")).toBe(false);
    expect(isMicrocmsAssetUrl("https://other.microcms-assets.io/x.png")).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("通常のファイル名はそのまま(英数・._-)", () => {
    expect(sanitizeFileName("eyecatch_01.png")).toBe("eyecatch_01.png");
  });

  it("パス区切りを除いて basename にする(トラバーサル防御)", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("a\\b\\c.png")).toBe("c.png");
  });

  it("危険文字・制御文字・空白は _ に置換する", () => {
    expect(sanitizeFileName("a b;rm -rf.png")).toBe("a_b_rm_-rf.png");
    expect(sanitizeFileName("x y.png")).toBe("x_y.png");
  });

  it("先頭ドットを除き、200文字に切り詰める", () => {
    expect(sanitizeFileName("...hidden.png")).toBe("hidden.png");
    expect(sanitizeFileName("a".repeat(300) + ".png").length).toBe(200);
  });

  it("空になる場合は upload にフォールバック", () => {
    expect(sanitizeFileName("")).toBe("upload");
    expect(sanitizeFileName("///")).toBe("upload");
    expect(sanitizeFileName("...")).toBe("upload");
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
    const error = await fetchMediaList({ limit: 30, offset: 0 }, OPTS(fetchFn)).catch((reason: unknown) => reason);
    expect((error as Error).message).toMatch(/403/);
    expect((error as Error).message).not.toContain("forbidden");
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
    const error = await uploadMediaBlob({ blob, fileName: "a.png" }, OPTS(fetchFn)).catch((reason: unknown) => reason);
    expect((error as Error).message).toMatch(/413/);
    expect((error as Error).message).not.toContain("too large");
  });
});
