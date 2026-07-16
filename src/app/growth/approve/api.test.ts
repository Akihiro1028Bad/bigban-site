import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw/server";
import { setupMswServer } from "@/test/msw/setup";

import {
  BOARD_URL,
  fetchBoard,
  fetchModelSettings,
  fetchOps,
  fetchProposalArtifact,
  fetchPrompts,
  postDecision,
  putModelSetting,
  postRevert,
  postRevise,
  postReviseApply,
  postReviseEdit,
  PROMPTS_URL,
  OPS_URL,
  MODEL_SETTINGS_URL,
  PROPOSAL_ARTIFACT_URL,
  SessionExpiredError,
} from "./api";

setupMswServer();

describe("AIモデル設定API", () => {
  it("GETで設定・カタログ・推論強度を返す", async () => {
    const payload = {
      success: true,
      storageAvailable: true,
      warning: null,
      settings: [{ id: "weekly" }],
      catalog: [{ id: "gpt-5.6-sol" }],
      efforts: { codex: ["high"], claude: ["high"] },
    };
    server.use(http.get(MODEL_SETTINGS_URL, () => HttpResponse.json(payload)));
    await expect(fetchModelSettings("tok")).resolves.toEqual({
      storageAvailable: true,
      warning: null,
      settings: payload.settings,
      catalog: payload.catalog,
      efforts: payload.efforts,
    });
  });

  it("GETの配列欠落は空配列へ落とし、失敗はerror文言を返す", async () => {
    server.use(
      http.get(MODEL_SETTINGS_URL, () =>
        HttpResponse.json({ success: true, efforts: { codex: [], claude: [] } }),
      ),
    );
    await expect(fetchModelSettings("tok")).resolves.toEqual({
      storageAvailable: false,
      warning: null,
      settings: [],
      catalog: [],
      efforts: { codex: [], claude: [] },
    });
    server.use(
      http.get(MODEL_SETTINGS_URL, () =>
        HttpResponse.json({ success: false, error: "設定NG" }, { status: 500 }),
      ),
    );
    await expect(fetchModelSettings("tok")).rejects.toThrow("設定NG");
  });

  it("GETはwarning文字列を保持し、失敗文言欠落時は既定エラーを返す", async () => {
    server.use(
      http.get(MODEL_SETTINGS_URL, () =>
        HttpResponse.json({ success: true, warning: "Notion未設定", efforts: {} }),
      ),
    );
    await expect(fetchModelSettings("tok")).resolves.toMatchObject({ warning: "Notion未設定" });
    server.use(
      http.get(MODEL_SETTINGS_URL, () =>
        HttpResponse.json({ success: false }, { status: 500 }),
      ),
    );
    await expect(fetchModelSettings("tok")).rejects.toThrow("AIモデル設定の取得に失敗しました。");
  });

  it("PUTで1工程を保存し、レスポンス設定を返す", async () => {
    let body: unknown;
    const setting = {
      phaseId: "weekly" as const,
      provider: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "xhigh" as const,
    };
    server.use(
      http.put(MODEL_SETTINGS_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, setting: { ...setting, id: "weekly" } });
      }),
    );
    await expect(putModelSetting("tok", setting)).resolves.toMatchObject({ id: "weekly" });
    expect(body).toEqual(setting);
  });

  it("PUT失敗・setting欠落は既定エラー", async () => {
    const setting = {
      phaseId: "weekly" as const,
      provider: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "xhigh" as const,
    };
    server.use(http.put(MODEL_SETTINGS_URL, () => HttpResponse.json({ success: true })));
    await expect(putModelSetting("tok", setting)).rejects.toThrow("AIモデル設定の保存に失敗しました。");
  });
});

describe("fetchBoard", () => {
  it("success レスポンスから items を返す", async () => {
    server.use(
      http.get(BOARD_URL, () => HttpResponse.json({ success: true, items: [{ id: "i1" }] }))
    );
    await expect(fetchBoard("tok")).resolves.toEqual([{ id: "i1" }]);
  });

  it("Cookie認証用ヘッダを送りAuthorizationを付けない", async () => {
    let auth: string | null = null;
    server.use(
      http.get(BOARD_URL, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ success: true, items: [] });
      })
    );
    await fetchBoard("mytoken");
    expect(auth).toBeNull();
  });

  it("401 は再ログイン遷移に使えるセッション切れエラー", async () => {
    server.use(http.get(BOARD_URL, () => HttpResponse.json({ success: false }, { status: 401 })));
    await expect(fetchBoard("tok")).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(fetchBoard("tok")).rejects.toThrow(/セッションの有効期限/);
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

describe("postRevert", () => {
  const REVERT_URL = "/api/growth/approve/revert";

  it("pageId でPOSTしCookie認証用ヘッダを送る", async () => {
    let auth: string | null = null;
    let body: unknown;
    server.use(
      http.post(REVERT_URL, async ({ request }) => {
        auth = request.headers.get("authorization");
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    await postRevert("tok", "i1");
    expect(body).toEqual({ pageId: "i1" });
    expect(auth).toBeNull();
  });

  it("409 は段階エラー文言", async () => {
    server.use(http.post(REVERT_URL, () => HttpResponse.json({ success: false }, { status: 409 })));
    await expect(postRevert("t", "i1")).rejects.toThrow("生成中・公開済み");
  });

  it("その他失敗は error 文言、無ければ既定文言", async () => {
    server.use(http.post(REVERT_URL, () => HttpResponse.json({ success: false, error: "RVNG" }, { status: 500 })));
    await expect(postRevert("t", "i1")).rejects.toThrow("RVNG");
    server.use(http.post(REVERT_URL, () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(postRevert("t", "i1")).rejects.toThrow("提案中に戻せませんでした。");
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
          warnings: ["任意資料 docs/x.md を読み込めませんでした。"],
          groups: [{ group: "分析", phases: [] }],
        })
      )
    );
    await expect(fetchPrompts("tok")).resolves.toEqual({
      facilityContext: "{}",
      warnings: ["任意資料 docs/x.md を読み込めませんでした。"],
      groups: [{ group: "分析", phases: [] }],
    });
  });

  it("facilityContext/warnings/groups 欠落時は null / 空配列に既定化する", async () => {
    server.use(http.get(PROMPTS_URL, () => HttpResponse.json({ success: true })));
    await expect(fetchPrompts("tok")).resolves.toEqual({
      facilityContext: null,
      warnings: [],
      groups: [],
    });
  });

  it("Cookie認証用ヘッダを送りAuthorizationを付けない", async () => {
    let auth: string | null = null;
    server.use(
      http.get(PROMPTS_URL, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ success: true, facilityContext: null, groups: [] });
      })
    );
    await fetchPrompts("mytoken");
    expect(auth).toBeNull();
  });

  it("401 は合言葉エラー", async () => {
    server.use(http.get(PROMPTS_URL, () => HttpResponse.json({ success: false }, { status: 401 })));
    await expect(fetchPrompts("tok")).rejects.toThrow(/セッションの有効期限/);
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

describe("fetchOps", () => {
  it("success レスポンスから ops を返す", async () => {
    const ops = {
      setupMissing: true,
      worker: { status: "unknown", workerId: null, lastHeartbeatAt: null, currentJob: null },
      currentTargets: [],
      recentRuns: [],
      recentFailures: [],
      reconcileFindings: [],
    };
    server.use(http.get(OPS_URL, () => HttpResponse.json({ success: true, ops })));
    await expect(fetchOps("tok")).resolves.toEqual(ops);
  });

  it("401 は合言葉エラー、その他は error/既定文言", async () => {
    server.use(http.get(OPS_URL, () => HttpResponse.json({ success: false }, { status: 401 })));
    await expect(fetchOps("tok")).rejects.toThrow(/セッションの有効期限/);
    server.use(http.get(OPS_URL, () => HttpResponse.json({ success: false, error: "OPS NG" }, { status: 500 })));
    await expect(fetchOps("tok")).rejects.toThrow("OPS NG");
    server.use(http.get(OPS_URL, () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(fetchOps("tok")).rejects.toThrow("運用状態の取得に失敗しました。");
  });
});

describe("fetchProposalArtifact", () => {
  it("blocks 配列を返し、欠落時は空配列にする", async () => {
    server.use(http.get(PROPOSAL_ARTIFACT_URL, () => HttpResponse.json({ success: true, blocks: [{ id: "b1" }] })));
    await expect(fetchProposalArtifact("tok", "p1")).resolves.toEqual([{ id: "b1" }]);
    server.use(http.get(PROPOSAL_ARTIFACT_URL, () => HttpResponse.json({ success: true })));
    await expect(fetchProposalArtifact("tok", "p1")).resolves.toEqual([]);
  });

  it("失敗は error 文言、無ければ既定文言", async () => {
    server.use(http.get(PROPOSAL_ARTIFACT_URL, () => HttpResponse.json({ success: false, error: "成果物NG" }, { status: 500 })));
    await expect(fetchProposalArtifact("tok", "p1")).rejects.toThrow("成果物NG");
    server.use(http.get(PROPOSAL_ARTIFACT_URL, () => HttpResponse.json({ success: false }, { status: 500 })));
    await expect(fetchProposalArtifact("tok", "p1")).rejects.toThrow("成果物の取得に失敗しました。");
  });
});
