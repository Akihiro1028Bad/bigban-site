// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/media", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/media")>();
  return { ...actual, fetchMediaList: vi.fn(), uploadMediaBlob: vi.fn() };
});

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { fetchMediaList, uploadMediaBlob } from "@/lib/growth/media";
import { GET, POST } from "./route";

const BASE = "http://localhost/api/growth/media";

function getReq(token: string | null, qs = ""): Request {
  const url = new URL(BASE + (qs ? `?${qs}` : ""));
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "GET" });
}

function postReq(body: BodyInit, token: string | null = null, headers?: HeadersInit): Request {
  const url = new URL(BASE);
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body, headers });
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(bytes = 8, name = "a.png", type = "image/png"): File {
  const data = new Uint8Array(Math.max(bytes, PNG_SIG.length));
  data.set(PNG_SIG);
  return new File([data], name, { type });
}

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = "secret-token";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_API_KEY = "mgmt-key";
  vi.mocked(fetchMediaList).mockReset();
  vi.mocked(uploadMediaBlob).mockReset();
});

afterEach(() => {
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_API_KEY;
  delete process.env.APPROVE_SECRET;
});

describe("GET /api/growth/media", () => {
  it("一覧を返す(クランプ済み limit/offset で呼ぶ)", async () => {
    vi.mocked(fetchMediaList).mockResolvedValue({
      media: [{ url: "https://images.microcms-assets.io/a.png" }],
      totalCount: 1,
      limit: 30,
      offset: 0,
    });
    const res = await GET(getReq("secret-token", "limit=999&offset=0"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.media).toEqual([{ url: "https://images.microcms-assets.io/a.png" }]);
    const [params] = vi.mocked(fetchMediaList).mock.calls[0];
    expect(params).toEqual({ limit: 100, offset: 0 }); // 上限クランプ
  });

  it("MANAGEMENT キー未設定は 500", async () => {
    delete process.env.MICROCMS_API_KEY;
    const res = await GET(getReq("secret-token"));
    expect(res.status).toBe(500);
    expect(fetchMediaList).not.toHaveBeenCalled();
  });

  it("取得失敗は 502(詳細は返さない)", async () => {
    vi.mocked(fetchMediaList).mockRejectedValue(new Error("mgmt 403: secret"));
    const res = await GET(getReq("secret-token"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/secret/);
  });

  it("token 不一致は 401", async () => {
    const res = await GET(getReq("wrong"));
    expect(res.status).toBe(401);
    expect(fetchMediaList).not.toHaveBeenCalled();
  });

  it("token 未指定は 401", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });

  it("APPROVE_SECRET 未設定は 401", async () => {
    delete process.env.APPROVE_SECRET;
    const res = await GET(getReq("x"));
    expect(res.status).toBe(401);
  });

  it("正しい token なら通る", async () => {
    vi.mocked(fetchMediaList).mockResolvedValue({ media: [], totalCount: 0, limit: 30, offset: 0 });
    const res = await GET(getReq("secret-token"));
    expect(res.status).toBe(200);
  });

  it("認可フラグが無効でも 401 で fail-closed する", async () => {
    flags.authEnabled = false;
    vi.mocked(fetchMediaList).mockResolvedValue({ media: [], totalCount: 0, limit: 30, offset: 0 });
    const res = await GET(getReq("secret-token"));
    expect(res.status).toBe(401);
    expect(fetchMediaList).not.toHaveBeenCalled();
  });
});

describe("POST /api/growth/media", () => {
  function form(file?: File): FormData {
    const fd = new FormData();
    if (file) fd.append("file", file);
    return fd;
  }

  it("アップロードして url を返す", async () => {
    vi.mocked(uploadMediaBlob).mockResolvedValue({ url: "https://images.microcms-assets.io/x.png" });
    const res = await POST(postReq(form(pngFile()), "secret-token"));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ success: true, url: "https://images.microcms-assets.io/x.png" });
    const [input, options] = vi.mocked(uploadMediaBlob).mock.calls[0];
    expect(input.fileName).toBe("a.png");
    expect(options.serviceDomain).toBe("thepicklebang");
  });

  it("ファイル未指定は 400", async () => {
    const res = await POST(postReq(form(), "secret-token"));
    expect(res.status).toBe(400);
    expect(uploadMediaBlob).not.toHaveBeenCalled();
  });

  it("MIME は image/png 申告でも中身が SVG なら 400(#SEC-06 magic byte)", async () => {
    const svg = new File(
      [new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")],
      "evil.png",
      { type: "image/png" }
    );
    const res = await POST(postReq(form(svg), "secret-token"));
    expect(res.status).toBe(400);
    expect(uploadMediaBlob).not.toHaveBeenCalled();
  });

  it("未対応MIMEは 400(検証で弾く)", async () => {
    const res = await POST(postReq(form(pngFile(4, "a.pdf", "application/pdf")), "secret-token"));
    expect(res.status).toBe(400);
    expect(uploadMediaBlob).not.toHaveBeenCalled();
  });

  it("不正なボディ(multipartでない)は 400", async () => {
    const res = await POST(postReq("not-a-form", "secret-token", { "content-type": "application/json" }));
    expect(res.status).toBe(400);
  });

  it("MANAGEMENT キー未設定は 500", async () => {
    delete process.env.MICROCMS_API_KEY;
    const res = await POST(postReq(form(pngFile()), "secret-token"));
    expect(res.status).toBe(500);
  });

  it("アップロード失敗は 502", async () => {
    vi.mocked(uploadMediaBlob).mockRejectedValue(new Error("mgmt down"));
    const res = await POST(postReq(form(pngFile()), "secret-token"));
    expect(res.status).toBe(502);
  });

  it("token 不一致は 401", async () => {
    const res = await POST(postReq(form(pngFile()), "wrong"));
    expect(res.status).toBe(401);
    expect(uploadMediaBlob).not.toHaveBeenCalled();
  });

  it("認可フラグが無効でも 401 で fail-closed する", async () => {
    flags.authEnabled = false;
    const res = await POST(postReq(form(pngFile()), "secret-token"));
    expect(res.status).toBe(401);
    expect(uploadMediaBlob).not.toHaveBeenCalled();
  });
});
