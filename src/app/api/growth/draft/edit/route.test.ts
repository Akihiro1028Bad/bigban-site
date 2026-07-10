// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: vi.fn((cb: () => unknown) => {
    void cb();
  }),
}));

// getPage / updatePageProps を差し替え、buildBodyMirrorProps 等の純関数は実物を使う(#95)。
vi.mock("@/lib/growth/notion", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/notion")>()),
  createPage: vi.fn(),
  getPage: vi.fn(),
  updatePageProps: vi.fn(),
}));

vi.mock("@/lib/growth/content", () => ({
  patchDraft: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { after } from "next/server";

import { LEARNING_LOG_PROPS } from "@/lib/growth/learningLog";
import { BODY_MIRROR_PROP, createPage, getPage, updatePageProps } from "@/lib/growth/notion";
import { patchDraft } from "@/lib/growth/content";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postRequest(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/draft/edit");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: raw ?? JSON.stringify(body) });
}

function pageWith(contentId?: string, title?: string, bodyRegenStatus?: string, media?: string) {
  const properties: Record<string, unknown> = {};
  if (contentId !== undefined) {
    properties["下書きID"] = { type: "rich_text", rich_text: [{ plain_text: contentId }] };
  }
  if (title !== undefined) {
    properties["タイトル案"] = { type: "title", title: [{ plain_text: title }] };
  }
  if (bodyRegenStatus !== undefined) {
    properties["本文画像再生成ステータス"] = { select: { name: bodyRegenStatus } };
  }
  if (media !== undefined) {
    properties["媒体"] = { select: { name: media } };
  }
  return { id: PAGE_ID, url: "", properties };
}

function pageWithBodyMirror(contentId: string, title: string, bodyHtml: string) {
  const page = pageWith(contentId, title);
  (page.properties as Record<string, unknown>)[BODY_MIRROR_PROP] = {
    type: "rich_text",
    rich_text: [{ plain_text: bodyHtml }],
  };
  return page;
}

function richTextContent(prop: unknown): string {
  const value = prop as { rich_text?: Array<{ text?: { content?: string } }> };
  return (value.rich_text ?? []).map((item) => item.text?.content ?? "").join("");
}

function titleContent(prop: unknown): string {
  const value = prop as { title?: Array<{ text?: { content?: string } }> };
  return (value.title ?? []).map((item) => item.text?.content ?? "").join("");
}

function selectName(prop: unknown): string {
  const value = prop as { select?: { name?: string } };
  return value.select?.name ?? "";
}

beforeEach(() => {
  flags.authEnabled = false;
  delete process.env.GROWTH_LEARNING_LOG_DS;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_API_KEY = "content-key";
  vi.mocked(after).mockClear();
  vi.mocked(createPage).mockReset();
  vi.mocked(createPage).mockResolvedValue("learning-log-page");
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageProps).mockReset();
  vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
  vi.mocked(patchDraft).mockReset();
  vi.mocked(patchDraft).mockResolvedValue("g-abc");
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_API_KEY;
  delete process.env.APPROVE_SECRET;
  delete process.env.GROWTH_LEARNING_LOG_DS;
  delete process.env.GROWTH_MICROCMS_ENDPOINT;
});

describe("POST /api/growth/draft/edit", () => {
  it("生成中の記事は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: PAGE_ID,
      url: "",
      properties: { "ステータス": { select: { name: "生成中" } } },
    });
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(409);
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("保存時にサーバで再サニタイズし、危険タグを除去して content キーで patch する", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc", "承認したタイトル"));

    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>本文</p><script>alert(1)</script>" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const [endpoint, contentId, data, opts] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("news");
    expect(contentId).toBe("g-abc");
    const saved = (data as { bodyHtml: string }).bodyHtml;
    expect(saved).toContain("本文");
    expect(saved).not.toContain("<script");
    expect(saved).not.toContain("alert");
    // #176: Notion タイトル案を microCMS 下書きの title にも同期する(承認画面と公開タイトルを一致させる)。
    expect((data as { title?: string }).title).toBe("承認したタイトル");
    expect((opts as { apiKey: string }).apiKey).toBe("content-key");

    // #95: Notion 本文ミラーも同じサニタイズ済みHTMLで更新される。
    const [mirrorPageId, mirrorProps] = vi.mocked(updatePageProps).mock.calls[0];
    expect(mirrorPageId).toBe(PAGE_ID);
    const mirror = (mirrorProps as Record<string, { rich_text: Array<{ text: { content: string } }> }>)[
      BODY_MIRROR_PROP
    ];
    expect(mirror.rich_text.map((r) => r.text.content).join("")).toBe(saved);
  });

  it("媒体=ニュースなら GROWTH_MICROCMS_ENDPOINT=columns でも news 下書きを更新する", async () => {
    process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
    vi.mocked(getPage).mockResolvedValue(pageWith("g-news", "ニュース記事", undefined, "ニュース"));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>本文</p>" }));
    expect(res.status).toBe(200);

    const [endpoint, contentId] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("news");
    expect(contentId).toBe("g-news");
  });

  it("媒体=コラムなら GROWTH_MICROCMS_ENDPOINT=columns の columns 下書きを更新する", async () => {
    process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
    vi.mocked(getPage).mockResolvedValue(pageWith("g-column", "コラム記事", undefined, "コラム"));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>本文</p>" }));
    expect(res.status).toBe(200);

    const [endpoint, contentId] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("columns");
    expect(contentId).toBe("g-column");
  });

  it.each(["依頼中", "処理中"])("本文画像再生成が %s なら 409 で保存を弾く", async (status) => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc", "承認したタイトル", status));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>本文</p>" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: "画像生成の処理中です。完了後にもう一度保存してください。",
    });
    expect(updatePageProps).not.toHaveBeenCalled();
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it.each(["なし", "失敗"])("本文画像再生成が %s なら従来どおり保存できる", async (status) => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc", "承認したタイトル", status));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>本文</p>" }));
    expect(res.status).toBe(200);
    expect(updatePageProps).toHaveBeenCalledTimes(1);
    expect(patchDraft).toHaveBeenCalledTimes(1);
  });

  it("Notion タイトル案が空なら title を送らない(本文だけ patch・#176)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc", "   "));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(200);
    const [, , data] = vi.mocked(patchDraft).mock.calls[0];
    expect(data as Record<string, unknown>).not.toHaveProperty("title");
    expect((data as { bodyHtml?: string }).bodyHtml).toContain("x");
  });

  it("Notion ミラー更新が失敗したら 502(microCMS を叩かない / #95)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));
    vi.mocked(updatePageProps).mockRejectedValue(new Error("notion write down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Notion/);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("下書き未作成(contentId 無し)は 404", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith());
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(404);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("contentId が不正形式なら 404(patch しない)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("bad/../id"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(404);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("bodyHtml が空は 400", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "   " }));
    expect(res.status).toBe(400);
  });

  it("bodyHtml が文字列でないと 400", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: 123 }));
    expect(res.status).toBe(400);
  });

  it("本文が大きすぎる(上限超過)は 400(patch しない)", async () => {
    const huge = "<p>" + "あ".repeat(500_001) + "</p>";
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: huge }));
    expect(res.status).toBe(400);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postRequest(null, { pageId: "nope", bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(400);
  });

  it("不正な JSON は 400", async () => {
    const res = await POST(postRequest(null, undefined, "{not json"));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(500);
  });

  it("MICROCMS_API_KEY 未設定は 500(管理キーにフォールバックしない)", async () => {
    delete process.env.MICROCMS_API_KEY;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(500);
  });

  it("patchDraft が失敗したら 502", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));
    vi.mocked(patchDraft).mockRejectedValue(new Error("microcms down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(502);
  });

  it("patchDraft 失敗時は Notion ミラーを旧本文へロールバックする(#C3: 公開stale 防止)", async () => {
    const page = pageWith("g-abc", "t");
    (page.properties as Record<string, unknown>)[BODY_MIRROR_PROP] = {
      type: "rich_text",
      rich_text: [{ plain_text: "<p>旧本文</p>" }],
    };
    vi.mocked(getPage).mockResolvedValue(page);
    vi.mocked(patchDraft).mockRejectedValue(new Error("microcms down"));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>新本文</p>" }));
    expect(res.status).toBe(502);

    // 1回目=新本文で更新 → microCMS 失敗 → 2回目=旧本文へロールバック。
    expect(vi.mocked(updatePageProps)).toHaveBeenCalledTimes(2);
    const join = (props: unknown): string =>
      (props as Record<string, { rich_text: Array<{ text: { content: string } }> }>)[
        BODY_MIRROR_PROP
      ].rich_text
        .map((r) => r.text.content)
        .join("");
    expect(join(vi.mocked(updatePageProps).mock.calls[0][1])).toContain("新本文");
    expect(join(vi.mocked(updatePageProps).mock.calls[1][1])).toBe("<p>旧本文</p>");
  });

  it("ロールバック(2回目のミラー更新)も失敗しても 502(沈黙させない・#C3)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));
    vi.mocked(updatePageProps).mockReset();
    vi.mocked(updatePageProps)
      .mockResolvedValueOnce(PAGE_ID)
      .mockRejectedValueOnce(new Error("rollback fail"));
    vi.mocked(patchDraft).mockRejectedValue(new Error("microcms down"));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(502);
    expect(vi.mocked(updatePageProps)).toHaveBeenCalledTimes(2);
  });

  it("getPage が失敗したら 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(502);
  });

  it("認可ON+トークン不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await POST(postRequest("wrong", { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(401);
  });

  it("認可ON+トークン未指定は 401(長さ不一致)", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(401);
  });

  it("認可ON+APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postRequest("anything", { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(401);
  });

  it("認可ON+正しいトークンは通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));
    const res = await POST(postRequest("right", { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(200);
  });

  it("保存成功後に after で手動編集の学習ログを追記する", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>新本文です。</p>" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(after).toHaveBeenCalledTimes(1);
    expect(createPage).toHaveBeenCalledTimes(1);
    const [dataSourceId, props, options] = vi.mocked(createPage).mock.calls[0];
    expect(dataSourceId).toBe("ds-log");
    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("編集");
    expect(titleContent(props[LEARNING_LOG_PROPS.event])).toContain("編集:");
    expect(richTextContent(props[LEARNING_LOG_PROPS.articleTitle])).toBe("承認したタイトル");
    expect(richTextContent(props[LEARNING_LOG_PROPS.pageId])).toBe(PAGE_ID);
    expect(richTextContent(props[LEARNING_LOG_PROPS.summary])).toContain("旧本文です");
    expect(richTextContent(props[LEARNING_LOG_PROPS.summary])).toContain("新本文です");
    expect((options as { token: string }).token).toBe("secret_notion");
  });

  it("advise-apply は採用観点ごとに after で採否の学習ログを追記する", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );

    const res = await POST(
      postRequest(null, {
        pageId: PAGE_ID,
        bodyHtml: "<p>新本文です。</p>",
        source: "advise-apply",
        adoptedAspects: ["冗長", "敬体乱れ"],
      })
    );

    expect(res.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(createPage).toHaveBeenCalledTimes(2));
    const firstProps = vi.mocked(createPage).mock.calls[0][1];
    const secondProps = vi.mocked(createPage).mock.calls[1][1];
    expect(selectName(firstProps[LEARNING_LOG_PROPS.kind])).toBe("採否");
    expect(selectName(secondProps[LEARNING_LOG_PROPS.kind])).toBe("採否");
    expect(richTextContent(firstProps[LEARNING_LOG_PROPS.target])).toBe("冗長");
    expect(richTextContent(secondProps[LEARNING_LOG_PROPS.target])).toBe("敬体乱れ");
    expect(richTextContent(firstProps[LEARNING_LOG_PROPS.summary])).toBe("採用観点: 冗長");
    expect(richTextContent(secondProps[LEARNING_LOG_PROPS.summary])).toBe("採用観点: 敬体乱れ");
  });

  it("advise-apply で新規 block が発生する本文は 409 で保存しない", async () => {
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror(
        "g-abc",
        "承認したタイトル",
        "<p>旧本文です。※この記事はAIが作成した下書きです。公開前に内容をご確認ください。</p>"
      )
    );

    const res = await POST(
      postRequest(null, {
        pageId: PAGE_ID,
        bodyHtml: "<p>新本文です。</p>",
        source: "advise-apply",
        adoptedAspects: ["簡潔化"],
      })
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("公開前チェック");
    expect(updatePageProps).not.toHaveBeenCalled();
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("adoptedFixes があれば fix ごとに指摘・変更前後を要約に残して採否を追記する", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );

    const res = await POST(
      postRequest(null, {
        pageId: PAGE_ID,
        bodyHtml: "<p>新本文です。</p>",
        source: "advise-apply",
        adoptedAspects: ["読みやすさ"],
        adoptedFixes: [
          {
            aspect: "読みやすさ",
            detail: "指摘: 冗長 / 提案: 短くする",
            before: "<p>ここは冗長で読みにくい段落です。</p>",
            after: "<p>ここは簡潔です。</p>",
          },
        ],
      })
    );

    expect(res.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
    const props = vi.mocked(createPage).mock.calls[0][1];
    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("採否");
    expect(richTextContent(props[LEARNING_LOG_PROPS.target])).toBe("読みやすさ");
    const summary = richTextContent(props[LEARNING_LOG_PROPS.summary]);
    expect(summary).toContain("[読みやすさ] 指摘: 冗長 / 提案: 短くする");
    expect(summary).toContain("変更前: ここは冗長で読みにくい段落です。");
    expect(summary).toContain("変更後: ここは簡潔です。");
  });

  it("adoptedFixes は adoptedAspects より優先される", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );

    const res = await POST(
      postRequest(null, {
        pageId: PAGE_ID,
        bodyHtml: "<p>新本文です。</p>",
        source: "advise-apply",
        adoptedAspects: ["A", "B", "C"],
        adoptedFixes: [
          { aspect: "只1件", detail: "d", before: "<p>b</p>", after: "<p>a</p>" },
        ],
      })
    );

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
    expect(richTextContent(vi.mocked(createPage).mock.calls[0][1][LEARNING_LOG_PROPS.target])).toBe(
      "只1件"
    );
  });

  it("adoptedFixes が壊れた形なら adoptedAspects 挙動へフォールバックする", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );

    const res = await POST(
      postRequest(null, {
        pageId: PAGE_ID,
        bodyHtml: "<p>新本文です。</p>",
        source: "advise-apply",
        adoptedAspects: ["冗長"],
        adoptedFixes: [{ aspect: 1, detail: "d", before: "b", after: "a" }],
      })
    );

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
    const props = vi.mocked(createPage).mock.calls[0][1];
    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("採否");
    expect(richTextContent(props[LEARNING_LOG_PROPS.summary])).toBe("採用観点: 冗長");
  });

  it("source 付きでも adoptedAspects が空なら手動編集として学習ログを追記する", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );

    const res = await POST(
      postRequest(null, {
        pageId: PAGE_ID,
        bodyHtml: "<p>新本文です。</p>",
        source: "advise-apply",
        adoptedAspects: [],
      })
    );

    expect(res.status).toBe(200);
    expect(createPage).toHaveBeenCalledTimes(1);
    const props = vi.mocked(createPage).mock.calls[0][1];
    expect(selectName(props[LEARNING_LOG_PROPS.kind])).toBe("編集");
  });

  it("本文が無変更なら学習ログ追記を登録しない", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>同じ本文です。</p>")
    );

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>同じ本文です。</p>" }));

    expect(res.status).toBe(200);
    expect(after).not.toHaveBeenCalled();
    expect(createPage).not.toHaveBeenCalled();
  });

  it("学習ログ DS 未設定なら保存は成功し追記を登録しない", async () => {
    delete process.env.GROWTH_LEARNING_LOG_DS;
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>新本文です。</p>" }));

    expect(res.status).toBe(200);
    expect(after).not.toHaveBeenCalled();
    expect(createPage).not.toHaveBeenCalled();
  });

  it("学習ログ追記が失敗しても保存レスポンスは 200 を返す", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );
    vi.mocked(createPage).mockRejectedValue(new Error("learning log down"));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>新本文です。</p>" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(after).toHaveBeenCalledTimes(1);
    expect(createPage).toHaveBeenCalledTimes(1);
  });

  it("採否の学習ログ追記が失敗しても保存レスポンスは 200 を返す", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue(
      pageWithBodyMirror("g-abc", "承認したタイトル", "<p>旧本文です。</p>")
    );
    vi.mocked(createPage).mockRejectedValue(new Error("learning log down"));

    const res = await POST(
      postRequest(null, {
        pageId: PAGE_ID,
        bodyHtml: "<p>新本文です。</p>",
        source: "advise-apply",
        adoptedAspects: ["冗長"],
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(after).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
  });

  it("保存失敗時は学習ログ追記を登録しない", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "ds-log";
    vi.mocked(getPage).mockResolvedValue({
      id: PAGE_ID,
      url: "",
      properties: { "ステータス": { select: { name: "生成中" } } },
    });

    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>新本文です。</p>" }));

    expect(res.status).toBe(409);
    expect(after).not.toHaveBeenCalled();
    expect(createPage).not.toHaveBeenCalled();
  });
});
