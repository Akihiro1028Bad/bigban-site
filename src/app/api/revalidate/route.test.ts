import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const revalidateTagMock = vi.fn();
const revalidatePathMock = vi.fn();
// 第2引数 (cacheLife profile) も検証対象にしたいので、すべての引数を
// そのままモックに転送する。誤って "default" など stale-while-revalidate 系の
// プロファイルに戻された場合に検知できるようにする。
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const SECRET = "s3cret";

function hmac(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function makeRequest(body: unknown, signature?: string) {
  const text = JSON.stringify(body);
  const sig = signature ?? hmac(text);
  return new Request("http://localhost/api/revalidate", {
    method: "POST",
    headers: new Headers({ "x-microcms-signature": sig }),
    body: text,
  });
}

describe("/api/revalidate POST", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    revalidatePathMock.mockClear();
    vi.stubEnv("MICROCMS_WEBHOOK_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("HMAC不一致で401", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ api: "news" }, "00".repeat(32)),
    );
    expect(res.status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("署名ヘッダー欠落で401", async () => {
    const text = JSON.stringify({ api: "news" });
    const req = new Request("http://localhost/api/revalidate", {
      method: "POST",
      body: text,
    });
    const { POST } = await import("./route");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("news+id で news/news-{id}-ja/news-{id}-en の3タグ + 即時無効化プロファイル", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ api: "news", id: "abc" }));
    expect(res.status).toBe(200);
    // 3 タグそれぞれが { expire: 0 } (即時無効化) で呼ばれることを検証する。
    // "default" や "max" などの stale-while-revalidate 系プロファイルに
    // 戻された場合はここで失敗させる。
    expect(revalidateTagMock).toHaveBeenCalledWith("news", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith("news-abc-ja", {
      expire: 0,
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("news-abc-en", {
      expire: 0,
    });
  });

  it("api!=許可リスト はスキップ", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ api: "other" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { skipped: boolean }).toEqual(
      expect.objectContaining({ skipped: true }),
    );
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("columns+id で columns/columns-{id}-ja/columns-{id}-en を即時無効化", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ api: "columns", id: "abc" }));
    expect(res.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith("columns", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith("columns-abc-ja", {
      expire: 0,
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("columns-abc-en", {
      expire: 0,
    });
    // columns 更新は news タグに触れない (相互干渉なし)。
    expect(revalidateTagMock).not.toHaveBeenCalledWith("news", { expire: 0 });
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("column-categories は自タグと columns タグを連鎖 expire する (§5.3)", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ api: "column-categories", id: "start" }));
    expect(res.status).toBe(200);
    // カテゴリ名/色の変更を一覧へ反映するため columns も連鎖無効化する。
    expect(revalidateTagMock).toHaveBeenCalledWith("column-categories", {
      expire: 0,
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("columns", { expire: 0 });
    // カテゴリ更新に id 別の columns-{id} タグは無関係なので触らない。
    expect(revalidateTagMock).not.toHaveBeenCalledWith("columns-start-ja", {
      expire: 0,
    });
  });

  it("id無しでも news タグが即時無効化プロファイルで呼ばれる", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ api: "news" }));
    expect(res.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith("news", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
  });

  it("news 通知時にトップページ含む全ルートを revalidatePath('/', 'layout') で再生成する", async () => {
    // tag 依存が記録されていない page (Suspense 境界の中で fetch している
    // トップページ等) でも確実に再生成するため、layout レベルで path
    // invalidation を発火させる。
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ api: "news", id: "abc" }));
    expect(res.status).toBe(200);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("api!=news のときは revalidatePath を呼ばない", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ api: "other" }));
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("不正body(JSON parse失敗) で400", async () => {
    const text = "not-json";
    const sig = hmac(text);
    const req = new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: new Headers({ "x-microcms-signature": sig }),
      body: text,
    });
    const { POST } = await import("./route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("schema違反(api欠落)で400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ broken: true }));
    expect(res.status).toBe(400);
  });

  it("secret環境変数未設定で500", async () => {
    vi.unstubAllEnvs();
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ api: "news" }, "00".repeat(32)));
    expect(res.status).toBe(500);
  });

  it("署名が非hex文字 (timingSafeEqual内例外) でも 401 で安全に弾く", async () => {
    const { POST } = await import("./route");
    // 64 文字だが非 hex (z は 16 進外) → Buffer.from(.., 'hex') が長さ不一致を返し
    // timingSafeEqual が throw → safeEqualHex の catch ブランチに落ちる
    const res = await POST(makeRequest({ api: "news" }, "zz".repeat(32)));
    expect(res.status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
