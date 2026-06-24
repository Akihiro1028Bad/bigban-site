// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  ADVISE_BUSY_STATUSES,
  ADVISE_PROPS,
  ADVISE_STATUSES,
  type Advice,
  type AdviceRow,
  adviceRowFromPage,
  adviceStatusOf,
  adviceViewOf,
  buildAdviceClearProps,
  buildAdviceFailMessage,
  buildAdviceFailProps,
  buildAdvicePresentMessage,
  buildAdvicePresentProps,
  buildAdviceProcessingProps,
  buildAdviceRequestProps,
  parseAdvice,
  selectStaleAdviceIds,
  serializeAdvice,
} from "./advise";

const VALID_ADVICE: Advice = {
  summary: "検索意図は捉えているが具体性が弱い。",
  scores: [
    { axis: "検索意図", score: 4 },
    { axis: "具体性", score: 2, note: "数値や手順が少ない" },
  ],
  strengths: ["導入が読者の悩みに寄り添っている"],
  fixes: [
    {
      area: "文体",
      severity: "中",
      quote: "〜することが重要です。",
      reason: "翻訳調で説明的。",
      suggestion: "「〜だと続けやすい」と体験ベースに言い換える。",
    },
  ],
};

describe("ADVISE 定数", () => {
  it("プロパティ名・ステータス・busy 集合を提供する", () => {
    expect(ADVISE_PROPS).toEqual({
      instruction: "アドバイス指示",
      status: "アドバイスステータス",
      result: "アドバイス結果",
      requestedAt: "アドバイス依頼時刻",
    });
    expect(ADVISE_STATUSES).toEqual(["なし", "依頼中", "処理中", "提示中", "失敗"]);
    expect(ADVISE_BUSY_STATUSES).toEqual(["依頼中", "処理中", "提示中"]);
  });
});

describe("parseAdvice / serializeAdvice", () => {
  it("妥当なアドバイス JSON を往復できる", () => {
    const json = serializeAdvice(VALID_ADVICE);
    expect(parseAdvice(json)).toEqual(VALID_ADVICE);
  });

  it("壊れた JSON は null(throw しない)", () => {
    expect(parseAdvice("{壊れ")).toBeNull();
  });

  it("スキーマ不一致(必須欠落・型違い)は null", () => {
    expect(parseAdvice(JSON.stringify({ summary: "x" }))).toBeNull(); // scores等欠落
    expect(parseAdvice(JSON.stringify({ ...VALID_ADVICE, scores: [{ axis: "x", score: 9 }] }))).toBeNull(); // 0-5外
    expect(
      parseAdvice(JSON.stringify({ ...VALID_ADVICE, fixes: [{ area: "文体", severity: "致命", reason: "r", suggestion: "s" }] }))
    ).toBeNull(); // severity 不正
  });

  it("serializeAdvice は不正なら throw(沈黙させない)", () => {
    expect(() => serializeAdvice({ summary: "x" })).toThrow();
  });
});

describe("依頼・状態遷移プロパティ", () => {
  it("buildAdviceRequestProps: 指示・依頼中・依頼時刻・結果クリア", () => {
    const props = buildAdviceRequestProps("見た目も見て", "2026-06-24T01:00:00.000Z");
    expect(props).toEqual({
      "アドバイス指示": { rich_text: [{ text: { content: "見た目も見て" } }] },
      "アドバイス結果": { rich_text: [] },
      "アドバイスステータス": { select: { name: "依頼中" } },
      "アドバイス依頼時刻": { date: { start: "2026-06-24T01:00:00.000Z" } },
    });
  });

  it("指示が空なら instruction の rich_text は空", () => {
    expect(buildAdviceRequestProps("", "2026-06-24T01:00:00.000Z")["アドバイス指示"]).toEqual({
      rich_text: [],
    });
  });

  it("buildAdviceProcessingProps はロック(処理中)", () => {
    expect(buildAdviceProcessingProps()).toEqual({
      "アドバイスステータス": { select: { name: "処理中" } },
    });
  });

  it("buildAdvicePresentProps は結果を書き提示中にする", () => {
    const props = buildAdvicePresentProps('{"a":1}');
    expect(props).toEqual({
      "アドバイス結果": { rich_text: [{ text: { content: '{"a":1}' } }] },
      "アドバイスステータス": { select: { name: "提示中" } },
    });
  });

  it("buildAdviceFailProps は失敗にして理由を結果へ", () => {
    expect(buildAdviceFailProps("OpenAI 503")).toEqual({
      "アドバイスステータス": { select: { name: "失敗" } },
      "アドバイス結果": { rich_text: [{ text: { content: "OpenAI 503" } }] },
    });
  });

  it("buildAdviceClearProps は指示・結果・ステータスをクリア", () => {
    expect(buildAdviceClearProps()).toEqual({
      "アドバイスステータス": { select: { name: "なし" } },
      "アドバイス指示": { rich_text: [] },
      "アドバイス結果": { rich_text: [] },
    });
  });
});

describe("adviceStatusOf / adviceViewOf", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("未設定・想定外ステータスはなし", () => {
    expect(adviceStatusOf(page({}))).toBe("なし");
    expect(adviceStatusOf(page({ "アドバイスステータス": { select: { name: "謎" } } }))).toBe("なし");
  });

  it("提示中＋妥当JSONは advice を返す", () => {
    const view = adviceViewOf(
      page({
        "アドバイスステータス": { select: { name: "提示中" } },
        "アドバイス結果": { rich_text: [{ plain_text: serializeAdvice(VALID_ADVICE) }] },
      })
    );
    expect(view.status).toBe("提示中");
    expect(view.advice).toEqual(VALID_ADVICE);
  });

  it("提示中でも JSON が壊れていれば advice は null・raw は保持", () => {
    const view = adviceViewOf(
      page({
        "アドバイスステータス": { select: { name: "提示中" } },
        "アドバイス結果": { rich_text: [{ plain_text: "壊れ" }] },
      })
    );
    expect(view.advice).toBeNull();
    expect(view.raw).toBe("壊れ");
  });

  it("失敗時は advice=null・raw に理由を保持", () => {
    const view = adviceViewOf(
      page({
        "アドバイスステータス": { select: { name: "失敗" } },
        "アドバイス結果": { rich_text: [{ plain_text: "OpenAI 503" }] },
      })
    );
    expect(view.status).toBe("失敗");
    expect(view.advice).toBeNull();
    expect(view.raw).toBe("OpenAI 503");
  });
});

describe("adviceRowFromPage", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("タイトル/指示/ステータス/依頼時刻/contentId/本文HTMLを取り出す", () => {
    const row = adviceRowFromPage(
      page({
        "タイトル案": { title: [{ plain_text: "市川の記事" }] },
        "アドバイス指示": { rich_text: [{ plain_text: "見た目も" }] },
        "アドバイスステータス": { select: { name: "依頼中" } },
        "アドバイス依頼時刻": { date: { start: "2026-06-24T00:00:00.000Z" } },
        "下書きID": { rich_text: [{ plain_text: "g-abc" }] },
        "下書き本文HTML": { rich_text: [{ plain_text: "<p>本文</p>" }] },
      })
    );
    expect(row).toEqual({
      id: "i1",
      title: "市川の記事",
      instruction: "見た目も",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-24T00:00:00.000Z"),
      contentId: "g-abc",
      bodyHtml: "<p>本文</p>",
    });
  });

  it("欠落は空/null、plain_text 欠落の rich_text/title 要素も空に落とす", () => {
    const row = adviceRowFromPage(
      page({
        "タイトル案": { title: [{}] },
        "アドバイス指示": { rich_text: [{}] },
        "下書きID": { rich_text: [{}] },
        "下書き本文HTML": { rich_text: [{}] },
      })
    );
    expect(row.title).toBe("");
    expect(row.instruction).toBe("");
    expect(row.status).toBe("なし");
    expect(row.requestedAtMs).toBeNull();
    expect(row.contentId).toBe("");
    expect(row.bodyHtml).toBe("");
  });

  it("不正な日付は null", () => {
    const row = adviceRowFromPage(page({ "アドバイス依頼時刻": { date: { start: "いつか" } } }));
    expect(row.requestedAtMs).toBeNull();
  });
});

describe("selectStaleAdviceIds", () => {
  const base = { title: "", instruction: "", contentId: "", bodyHtml: "" };
  const now = 1_000_000_000_000;
  const rows: AdviceRow[] = [
    { id: "stale", status: "処理中", requestedAtMs: now - 16 * 60 * 1000, ...base },
    { id: "fresh", status: "処理中", requestedAtMs: now - 5 * 60 * 1000, ...base },
    { id: "nodate", status: "処理中", requestedAtMs: null, ...base },
    { id: "pending", status: "依頼中", requestedAtMs: now - 60 * 60 * 1000, ...base },
  ];

  it("処理中かつ timeout 超過の行だけ回収対象にする", () => {
    expect(selectStaleAdviceIds(rows, now, 15 * 60 * 1000)).toEqual(["stale"]);
  });
});

describe("通知本文", () => {
  it("buildAdvicePresentMessage はタイトルと承認URLを含む", () => {
    const msg = buildAdvicePresentMessage("市川の記事", "https://x/growth/approve");
    expect(msg).toContain("アドバイス");
    expect(msg).toContain("市川の記事");
    expect(msg).toContain("https://x/growth/approve");
  });

  it("buildAdviceFailMessage は理由と再依頼導線を含む", () => {
    const msg = buildAdviceFailMessage("市川の記事", "OpenAI 503");
    expect(msg).toMatch(/失敗/);
    expect(msg).toContain("OpenAI 503");
  });
});
