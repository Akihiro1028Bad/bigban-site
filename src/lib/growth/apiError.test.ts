// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { growthApiError, missingNotionProperty } from "./apiError";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("missingNotionProperty", () => {
  it("'X is not a property that exists' からプロパティ名を抽出する", () => {
    expect(
      missingNotionProperty(new Error("アドバイス反映指示 is not a property that exists"))
    ).toBe("アドバイス反映指示");
  });

  it("'property \"X\" does not exist' からプロパティ名を抽出する", () => {
    expect(missingNotionProperty(new Error('property "本文コメント指示" does not exist'))).toBe(
      "本文コメント指示"
    );
  });

  it("プロパティ欠落以外のエラーは null", () => {
    expect(missingNotionProperty(new Error("network down"))).toBeNull();
  });

  it("Error 以外(文字列等)も扱える", () => {
    expect(missingNotionProperty("X is not a property that exists")).toBe("X");
    expect(missingNotionProperty(null)).toBeNull();
  });
});

describe("growthApiError", () => {
  it("真因を必ず console.error に出す(沈黙させない)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.APPROVE_SECRET = "very-secret";
    const err = new Error("boom Bearer abc very-secret <p>html</p>");
    growthApiError("advise/apply", err, "反映依頼の登録に失敗しました");
    const logged = String(spy.mock.calls[0]?.[0]);
    expect(logged).toContain("[growth/advise/apply]");
    expect(logged).not.toContain("very-secret");
    expect(logged).not.toContain("Bearer abc");
    expect(logged).not.toContain("<p>");
    delete process.env.APPROVE_SECRET;
  });

  it("Notion プロパティ欠落は 500 ＋ どのプロパティかを返す", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = growthApiError(
      "advise/apply",
      new Error("アドバイス反映ステータス is not a property that exists"),
      "反映依頼の登録に失敗しました"
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("アドバイス反映ステータス");
    expect(res.body.error).toContain("追加してください");
  });

  it("その他のエラーは fallback の 502", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = growthApiError("revise", new Error("timeout"), "修正依頼の登録に失敗しました");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ success: false, error: "修正依頼の登録に失敗しました" });
  });

  it("Error 以外の例外値も安全な診断文字列として扱う", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = growthApiError("revise", "plain failure", "修正依頼の登録に失敗しました");
    expect(res.status).toBe(502);
    expect(String(spy.mock.calls[0]?.[0])).toContain("plain failure");
  });
});
