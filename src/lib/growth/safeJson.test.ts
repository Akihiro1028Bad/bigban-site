import { describe, expect, it } from "vitest";

import { readJsonObject } from "./safeJson";

describe("readJsonObject", () => {
  it("正常な JSON オブジェクトをそのまま返す", async () => {
    const res = new Response(JSON.stringify({ success: true, items: [1, 2] }), {
      status: 200,
    });
    expect(await readJsonObject(res)).toEqual({ success: true, items: [1, 2] });
  });

  it("空ボディ(本文ゼロの 500)は {} を返し例外を投げない", async () => {
    const res = new Response("", { status: 500 });
    await expect(readJsonObject(res)).resolves.toEqual({});
  });

  it("非 JSON(HTML エラーページ等)は {} を返す", async () => {
    const res = new Response("<html>Internal Server Error</html>", { status: 500 });
    await expect(readJsonObject(res)).resolves.toEqual({});
  });

  it("JSON だがオブジェクトでない(配列)は {} を返す", async () => {
    const res = new Response(JSON.stringify([1, 2, 3]), { status: 200 });
    await expect(readJsonObject(res)).resolves.toEqual({});
  });

  it("JSON だがオブジェクトでない(プリミティブ)は {} を返す", async () => {
    const res = new Response(JSON.stringify(42), { status: 200 });
    await expect(readJsonObject(res)).resolves.toEqual({});
  });

  it("JSON の null は {} を返す", async () => {
    const res = new Response(JSON.stringify(null), { status: 200 });
    await expect(readJsonObject(res)).resolves.toEqual({});
  });
});
