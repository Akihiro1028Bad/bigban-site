import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw/server";
import { setupMswServer } from "@/test/msw/setup";

import {
  BOARD_URL,
  fetchBoard,
  fetchPrompts,
  postDecision,
  postPublish,
  postRevise,
  postReviseApply,
  postReviseEdit,
  PROMPTS_URL,
} from "./api";

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

describe("postDecision", () => {
  it("decisions ボディで POST し成功で解決", async () => {
    let body: unknown;
    server.use(
      http.post(BOARD_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await postDecision("tok", "i1", "承認");
    expect(body).toEqual({ decisions: [{ id: "i1", decision: "承認" }] });
  });

  it("失敗は error 文言、無ければ既定文言", async () => {
    server.use(http.post(BOARD_URL, () => HttpResponse.json({ success: false, error: "NG" }, { status: 500 })));
    await expect(postDecision("t", "i1", "承認")).rejects.toThrow("NG");
    server.use(http.post(BOARD_URL, () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(postDecision("t", "i1", "承認")).rejects.toThrow("保存に失敗しました。");
  });
});

describe("postPublish", () => {
  it("pageId で POST し Authorization ヘッダを送る", async () => {
    let auth: string | null = null;
    let body: unknown;
    server.use(
      http.post("/api/growth/publish", async ({ request }) => {
        auth = request.headers.get("authorization");
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await postPublish("tok", "p1");
    expect(body).toEqual({ pageId: "p1" });
    expect(auth).toBe("Bearer tok");
  });

  it("失敗は error 文言、無ければ既定文言", async () => {
    server.use(http.post("/api/growth/publish", () => HttpResponse.json({ success: false, error: "PUBNG" }, { status: 409 })));
    await expect(postPublish("t", "p1")).rejects.toThrow("PUBNG");
    server.use(http.post("/api/growth/publish", () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(postPublish("t", "p1")).rejects.toThrow("公開に失敗しました。");
  });
});

describe("postRevise", () => {
  it("成功で解決し body を送る", async () => {
    let body: unknown;
    server.use(
      http.post("/api/growth/revise", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await postRevise("t", { pageId: "i1", comments: [{ line: "H2", comment: "直して" }] });
    expect(body).toEqual({ pageId: "i1", comments: [{ line: "H2", comment: "直して" }] });
  });
  it("409 は処理中、その他は error/既定文言", async () => {
    server.use(http.post("/api/growth/revise", () => HttpResponse.json({ success: false }, { status: 409 })));
    await expect(postRevise("t", { pageId: "i1", comments: [] })).rejects.toThrow("修正処理中");
    server.use(http.post("/api/growth/revise", () => HttpResponse.json({ success: false, error: "X" }, { status: 500 })));
    await expect(postRevise("t", { pageId: "i1", comments: [] })).rejects.toThrow("X");
    server.use(http.post("/api/growth/revise", () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(postRevise("t", { pageId: "i1", comments: [] })).rejects.toThrow("修正依頼に失敗しました。");
  });
});

describe("postReviseEdit", () => {
  it("pageId＋payload を送り成功で解決", async () => {
    let body: unknown;
    server.use(
      http.post("/api/growth/revise/edit", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await postReviseEdit("t", "i1", { outline: "## A" });
    expect(body).toEqual({ pageId: "i1", outline: "## A" });
  });
  it("409 は AI 処理中、その他は error/既定文言", async () => {
    server.use(http.post("/api/growth/revise/edit", () => HttpResponse.json({ success: false }, { status: 409 })));
    await expect(postReviseEdit("t", "i1", {})).rejects.toThrow("AI修正処理中");
    server.use(http.post("/api/growth/revise/edit", () => HttpResponse.json({ success: false, error: "Y" }, { status: 500 })));
    await expect(postReviseEdit("t", "i1", {})).rejects.toThrow("Y");
    server.use(http.post("/api/growth/revise/edit", () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(postReviseEdit("t", "i1", {})).rejects.toThrow("保存に失敗しました。");
  });
});

describe("postReviseApply", () => {
  it("action を送り成功で解決", async () => {
    let body: unknown;
    server.use(
      http.post("/api/growth/revise/apply", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await postReviseApply("t", "i1", "apply");
    expect(body).toEqual({ pageId: "i1", action: "apply" });
  });
  it("失敗は error/既定文言", async () => {
    server.use(http.post("/api/growth/revise/apply", () => HttpResponse.json({ success: false, error: "Z" }, { status: 500 })));
    await expect(postReviseApply("t", "i1", "discard")).rejects.toThrow("Z");
    server.use(http.post("/api/growth/revise/apply", () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(postReviseApply("t", "i1", "discard")).rejects.toThrow("更新に失敗しました。");
  });
});

describe("fetchPrompts", () => {
  it("success から facilityContext と groups を返す", async () => {
    server.use(
      http.get(PROMPTS_URL, () =>
        HttpResponse.json({
          success: true,
          facilityContext: "{}",
          groups: [{ group: "分析", phases: [] }],
        })
      )
    );
    await expect(fetchPrompts("tok")).resolves.toEqual({
      facilityContext: "{}",
      groups: [{ group: "分析", phases: [] }],
    });
  });

  it("facilityContext/groups 欠落時は null / 空配列に既定化する", async () => {
    server.use(http.get(PROMPTS_URL, () => HttpResponse.json({ success: true })));
    await expect(fetchPrompts("tok")).resolves.toEqual({ facilityContext: null, groups: [] });
  });

  it("Authorization: Bearer ヘッダで token を送る", async () => {
    let auth: string | null = null;
    server.use(
      http.get(PROMPTS_URL, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ success: true, facilityContext: null, groups: [] });
      })
    );
    await fetchPrompts("mytoken");
    expect(auth).toBe("Bearer mytoken");
  });

  it("401 は合言葉エラー", async () => {
    server.use(http.get(PROMPTS_URL, () => HttpResponse.json({ success: false }, { status: 401 })));
    await expect(fetchPrompts("tok")).rejects.toThrow(/合言葉が違います/);
  });

  it("その他失敗は error 文言、無ければ既定文言", async () => {
    server.use(
      http.get(PROMPTS_URL, () => HttpResponse.json({ success: false, error: "読込障害" }, { status: 500 }))
    );
    await expect(fetchPrompts("tok")).rejects.toThrow("読込障害");
    server.use(http.get(PROMPTS_URL, () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(fetchPrompts("tok")).rejects.toThrow("取得に失敗しました。");
  });
});
