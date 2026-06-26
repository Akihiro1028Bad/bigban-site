import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw/server";
import { setupMswServer } from "@/test/msw/setup";

import { BOARD_URL, fetchBoard } from "./api";

setupMswServer();

describe("fetchBoard", () => {
  it("success レスポンスから items を返す", async () => {
    server.use(
      http.get(BOARD_URL, () => HttpResponse.json({ success: true, items: [{ id: "i1" }] }))
    );
    await expect(fetchBoard("tok")).resolves.toEqual([{ id: "i1" }]);
  });

  it("Authorization: Bearer ヘッダで token を送る", async () => {
    let auth: string | null = null;
    server.use(
      http.get(BOARD_URL, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ success: true, items: [] });
      })
    );
    await fetchBoard("mytoken");
    expect(auth).toBe("Bearer mytoken");
  });

  it("401 は合言葉エラー", async () => {
    server.use(http.get(BOARD_URL, () => HttpResponse.json({ success: false }, { status: 401 })));
    await expect(fetchBoard("tok")).rejects.toThrow(/合言葉が違います/);
  });

  it("その他失敗は error 文言を使う", async () => {
    server.use(
      http.get(BOARD_URL, () => HttpResponse.json({ success: false, error: "DB 障害" }, { status: 500 }))
    );
    await expect(fetchBoard("tok")).rejects.toThrow("DB 障害");
  });

  it("error 文言が無ければ既定文言", async () => {
    server.use(http.get(BOARD_URL, () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(fetchBoard("tok")).rejects.toThrow("取得に失敗しました。");
  });
});
