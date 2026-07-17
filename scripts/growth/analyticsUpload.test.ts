import { describe, expect, it, vi } from "vitest";

import { analyticsSnapshotUploader } from "./analyticsUpload";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("analyticsSnapshotUploader", () => {
  it("URLとトークンが揃う時だけBearer付きPOSTを返す", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 202 }));
    const upload = analyticsSnapshotUploader(
      { GROWTH_ANALYTICS_UPLOAD_URL: "https://example.test/snapshot", GROWTH_ANALYTICS_INGEST_TOKEN: TOKEN },
      fetchFn,
      vi.fn()
    );

    expect(upload).toBeDefined();
    if (!upload) throw new Error("アップロード関数が未作成です");
    await upload('{"schemaVersion":1}');

    expect(fetchFn).toHaveBeenCalledWith("https://example.test/snapshot", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: '{"schemaVersion":1}',
      signal: expect.any(AbortSignal),
    });
  });

  it("アップロード先またはトークンが未設定なら1行ログでスキップする", () => {
    const log = vi.fn();
    expect(analyticsSnapshotUploader({ GROWTH_ANALYTICS_UPLOAD_URL: "https://example.test/snapshot" }, vi.fn(), log)).toBeUndefined();
    expect(analyticsSnapshotUploader({ GROWTH_ANALYTICS_INGEST_TOKEN: TOKEN }, vi.fn(), log)).toBeUndefined();
    expect(log).toHaveBeenCalledWith("[ingest] 経営ボードのアップロード設定が未設定のためスキップ");
  });

  it("応答が失敗なら秘密値を含まないエラーにする", async () => {
    const upload = analyticsSnapshotUploader(
      { GROWTH_ANALYTICS_UPLOAD_URL: "https://example.test/snapshot", GROWTH_ANALYTICS_INGEST_TOKEN: TOKEN },
      async () => ({ ok: false, status: 500 }),
      vi.fn()
    );
    expect(upload).toBeDefined();
    if (!upload) throw new Error("アップロード関数が未作成です");
    await expect(upload("{}")).rejects.toThrow("経営ボードへのアップロードに失敗しました(HTTP 500)");
  });

  it("タイムアウトによるfetch失敗を既存の失敗警告経路へ伝える", async () => {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    const upload = analyticsSnapshotUploader(
      { GROWTH_ANALYTICS_UPLOAD_URL: "https://example.test/snapshot", GROWTH_ANALYTICS_INGEST_TOKEN: TOKEN },
      async () => { throw timeout; },
      vi.fn()
    );

    expect(upload).toBeDefined();
    if (!upload) throw new Error("アップロード関数が未作成です");
    await expect(upload("{}")).rejects.toBe(timeout);
  });
});
