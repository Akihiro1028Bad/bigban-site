// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  buildRegenDoneProps,
  buildRegenFailProps,
  buildRegenProcessingProps,
  buildRegenRequestProps,
  REGEN_BUSY_STATUSES,
  REGEN_PROPS,
  REGEN_STATUSES,
  regenRowFromPage,
  regenViewOf,
  selectStaleRegenIds,
  buildRegenDoneMessage,
  buildRegenDoneFlex,
  buildRegenFailMessage,
  type RegenRow,
} from "./eyecatch-regen";

describe("REGEN 定数", () => {
  it("プロパティ名・ステータス・busy 集合を提供する", () => {
    expect(REGEN_PROPS).toEqual({
      instruction: "アイキャッチ再生成指示",
      status: "アイキャッチ再生成ステータス",
      requestedAt: "アイキャッチ再生成依頼時刻",
    });
    expect(REGEN_STATUSES).toEqual(["なし", "依頼中", "処理中", "失敗"]);
    expect(REGEN_BUSY_STATUSES).toEqual(["依頼中", "処理中"]);
  });
});

describe("buildRegenRequestProps", () => {
  it("指示(分割rich_text)・依頼中・依頼時刻を1まとめにする", () => {
    const props = buildRegenRequestProps("梅雨で打つ宇宙人", "2026-06-24T01:00:00.000Z");
    expect(props).toEqual({
      "アイキャッチ再生成指示": { rich_text: [{ text: { content: "梅雨で打つ宇宙人" } }] },
      "アイキャッチ再生成ステータス": { select: { name: "依頼中" } },
      "アイキャッチ再生成依頼時刻": { date: { start: "2026-06-24T01:00:00.000Z" } },
    });
  });

  it("指示が空なら rich_text は空(PC側で既定生成)", () => {
    const props = buildRegenRequestProps("", "2026-06-24T01:00:00.000Z");
    expect(props["アイキャッチ再生成指示"]).toEqual({ rich_text: [] });
  });
});

describe("PC poller プロパティ", () => {
  it("buildRegenProcessingProps はロック(処理中)にする", () => {
    expect(buildRegenProcessingProps()).toEqual({
      "アイキャッチ再生成ステータス": { select: { name: "処理中" } },
    });
  });

  it("buildRegenDoneProps は指示をクリアしステータスをなしに戻す", () => {
    expect(buildRegenDoneProps()).toEqual({
      "アイキャッチ再生成ステータス": { select: { name: "なし" } },
      "アイキャッチ再生成指示": { rich_text: [] },
    });
  });

  it("buildRegenFailProps は失敗にする(指示は残して再依頼可能)", () => {
    expect(buildRegenFailProps()).toEqual({
      "アイキャッチ再生成ステータス": { select: { name: "失敗" } },
    });
  });
});

describe("regenRowFromPage", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("タイトル/指示/ステータス/依頼時刻/下書きIDを取り出す", () => {
    const row = regenRowFromPage(
      page({
        "タイトル案": { title: [{ plain_text: "市川の記事" }] },
        "アイキャッチ再生成指示": { rich_text: [{ plain_text: "夏らしく" }] },
        "アイキャッチ再生成ステータス": { select: { name: "依頼中" } },
        "アイキャッチ再生成依頼時刻": { date: { start: "2026-06-24T00:00:00.000Z" } },
        "下書きID": { rich_text: [{ plain_text: "g-abc" }] },
      })
    );
    expect(row).toEqual({
      id: "i1",
      title: "市川の記事",
      instruction: "夏らしく",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-24T00:00:00.000Z"),
      contentId: "g-abc",
    });
  });

  it("未設定・不正ステータスはなし、欠落は空/null", () => {
    const row = regenRowFromPage(page({ "アイキャッチ再生成ステータス": { select: { name: "謎" } } }));
    expect(row.status).toBe("なし");
    expect(row.instruction).toBe("");
    expect(row.requestedAtMs).toBeNull();
    expect(row.contentId).toBe("");
  });

  it("不正な日付は null", () => {
    const row = regenRowFromPage(page({ "アイキャッチ再生成依頼時刻": { date: { start: "いつか" } } }));
    expect(row.requestedAtMs).toBeNull();
  });

  it("plain_text 欠落の title / rich_text 要素は空文字に落とす", () => {
    const row = regenRowFromPage(
      page({
        "タイトル案": { title: [{}] },
        "アイキャッチ再生成指示": { rich_text: [{}] },
        "下書きID": { rich_text: [{}] },
      })
    );
    expect(row.title).toBe("");
    expect(row.instruction).toBe("");
    expect(row.contentId).toBe("");
  });
});

describe("regenViewOf", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("ステータスだけを表示用に返す", () => {
    const view = regenViewOf(page({ "アイキャッチ再生成ステータス": { select: { name: "依頼中" } } }));
    expect(view).toEqual({ status: "依頼中", requestedAtMs: null });
  });

  it("未設定・不正ステータスはなし", () => {
    expect(regenViewOf(page({})).status).toBe("なし");
    expect(regenViewOf(page({ "アイキャッチ再生成ステータス": { select: { name: "謎" } } })).status).toBe("なし");
  });
});

describe("selectStaleRegenIds", () => {
  const base = { title: "", instruction: "", contentId: "" };
  const now = 1_000_000_000_000;
  const rows: RegenRow[] = [
    { id: "stale", status: "処理中", requestedAtMs: now - 16 * 60 * 1000, ...base },
    { id: "fresh", status: "処理中", requestedAtMs: now - 5 * 60 * 1000, ...base },
    { id: "nodate", status: "処理中", requestedAtMs: null, ...base },
    { id: "pending", status: "依頼中", requestedAtMs: now - 60 * 60 * 1000, ...base },
  ];

  it("処理中・依頼中で timeout 超過のみ回収(fresh・依頼時刻なしは除外)", () => {
    expect(selectStaleRegenIds(rows, now, 15 * 60 * 1000)).toEqual(["stale", "pending"]);
  });
});

describe("通知本文", () => {
  it("buildRegenDoneMessage はタイトルと承認URLを含む", () => {
    const msg = buildRegenDoneMessage("市川の記事", "https://x/growth/approve");
    expect(msg).toContain("アイキャッチ");
    expect(msg).toContain("市川の記事");
    expect(msg).toContain("https://x/growth/approve");
  });

  it("buildRegenDoneFlex はタイトルと承認URIボタンを持つカードを返す(#162)", () => {
    const bubble = buildRegenDoneFlex("市川の記事", "https://x/growth/approve");
    expect(bubble.type).toBe("bubble");
    expect(bubble.body?.contents[0]).toMatchObject({ text: "市川の記事", weight: "bold" });
    expect(bubble.footer?.contents[0]).toMatchObject({
      action: { type: "uri", uri: "https://x/growth/approve" },
    });
  });

  it("buildRegenFailMessage は理由と再依頼導線を含む", () => {
    const msg = buildRegenFailMessage("市川の記事", "OpenAI 503");
    expect(msg).toMatch(/失敗/);
    expect(msg).toContain("OpenAI 503");
    expect(msg).toContain("市川の記事");
  });
});
