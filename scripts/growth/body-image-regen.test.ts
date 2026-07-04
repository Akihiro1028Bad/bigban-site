// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  BODY_REGEN_BUSY_STATUSES,
  BODY_REGEN_PROPS,
  BODY_REGEN_STATUSES,
  buildBodyRegenDoneMessage,
  buildBodyRegenDoneFlex,
  buildBodyRegenDoneProps,
  buildBodyRegenFailMessage,
  buildBodyRegenFailProps,
  buildBodyRegenProcessingProps,
  buildBodyRegenRequestProps,
  bodyRegenRowFromPage,
  bodyRegenViewOf,
  extractBodyImages,
  isMicrocmsAssetUrl,
  replaceBodyImageBySrc,
  selectStaleBodyRegenIds,
  type BodyImageRef,
  type BodyRegenRow,
} from "./body-image-regen";

const SRC = "https://images.microcms-assets.io/assets/a/1.png";
const SRC_B = "https://images.microcms-assets.io/assets/b/2.png";
const NEW = "https://images.microcms-assets.io/assets/c/new.png";

describe("BODY_REGEN 定数", () => {
  it("プロパティ名・ステータス・busy 集合を提供する", () => {
    expect(BODY_REGEN_PROPS).toEqual({
      instruction: "本文画像再生成指示",
      status: "本文画像再生成ステータス",
      requestedAt: "本文画像再生成依頼時刻",
      targetSrc: "本文画像再生成対象",
    });
    expect(BODY_REGEN_STATUSES).toEqual(["なし", "依頼中", "処理中", "失敗"]);
    expect(BODY_REGEN_BUSY_STATUSES).toEqual(["依頼中", "処理中"]);
  });
});

describe("buildBodyRegenRequestProps", () => {
  it("指示・対象src・依頼中・依頼時刻を1まとめにする", () => {
    const props = buildBodyRegenRequestProps("もっと明るく", SRC, "2026-06-24T01:00:00.000Z");
    expect(props).toEqual({
      "本文画像再生成指示": { rich_text: [{ text: { content: "もっと明るく" } }] },
      "本文画像再生成対象": { rich_text: [{ text: { content: SRC } }] },
      "本文画像再生成ステータス": { select: { name: "依頼中" } },
      "本文画像再生成依頼時刻": { date: { start: "2026-06-24T01:00:00.000Z" } },
    });
  });

  it("指示が空でも対象srcは必ず入る", () => {
    const props = buildBodyRegenRequestProps("", SRC, "2026-06-24T01:00:00.000Z");
    expect(props["本文画像再生成指示"]).toEqual({ rich_text: [] });
    expect(props["本文画像再生成対象"]).toEqual({ rich_text: [{ text: { content: SRC } }] });
  });
});

describe("PC poller プロパティ", () => {
  it("buildBodyRegenProcessingProps はロック(処理中)にする", () => {
    expect(buildBodyRegenProcessingProps()).toEqual({
      "本文画像再生成ステータス": { select: { name: "処理中" } },
    });
  });

  it("buildBodyRegenDoneProps は指示・対象をクリアしステータスをなしに戻す", () => {
    expect(buildBodyRegenDoneProps()).toEqual({
      "本文画像再生成ステータス": { select: { name: "なし" } },
      "本文画像再生成指示": { rich_text: [] },
      "本文画像再生成対象": { rich_text: [] },
    });
  });

  it("buildBodyRegenFailProps は失敗にする(指示・対象は残して再依頼可能)", () => {
    expect(buildBodyRegenFailProps()).toEqual({
      "本文画像再生成ステータス": { select: { name: "失敗" } },
    });
  });
});

describe("bodyRegenRowFromPage", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("タイトル/指示/ステータス/依頼時刻/下書きID/対象src/本文HTMLを取り出す", () => {
    const row = bodyRegenRowFromPage(
      page({
        "タイトル案": { title: [{ plain_text: "市川の記事" }] },
        "本文画像再生成指示": { rich_text: [{ plain_text: "図解で" }] },
        "本文画像再生成ステータス": { select: { name: "依頼中" } },
        "本文画像再生成依頼時刻": { date: { start: "2026-06-24T00:00:00.000Z" } },
        "下書きID": { rich_text: [{ plain_text: "g-abc" }] },
        "本文画像再生成対象": { rich_text: [{ plain_text: SRC }] },
        "下書き本文HTML": { rich_text: [{ plain_text: "<p>本文</p>" }] },
      })
    );
    expect(row).toEqual({
      id: "i1",
      title: "市川の記事",
      instruction: "図解で",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-24T00:00:00.000Z"),
      contentId: "g-abc",
      targetSrc: SRC,
      bodyHtml: "<p>本文</p>",
    });
  });

  it("未設定・不正ステータスはなし、欠落は空/null", () => {
    const row = bodyRegenRowFromPage(page({ "本文画像再生成ステータス": { select: { name: "謎" } } }));
    expect(row.status).toBe("なし");
    expect(row.instruction).toBe("");
    expect(row.requestedAtMs).toBeNull();
    expect(row.contentId).toBe("");
    expect(row.targetSrc).toBe("");
    expect(row.bodyHtml).toBe("");
  });

  it("不正な日付は null", () => {
    const row = bodyRegenRowFromPage(page({ "本文画像再生成依頼時刻": { date: { start: "いつか" } } }));
    expect(row.requestedAtMs).toBeNull();
  });

  it("plain_text 欠落の title / rich_text 要素は空文字に落とす", () => {
    const row = bodyRegenRowFromPage(
      page({
        "タイトル案": { title: [{}] },
        "本文画像再生成指示": { rich_text: [{}] },
        "下書きID": { rich_text: [{}] },
        "本文画像再生成対象": { rich_text: [{}] },
        "下書き本文HTML": { rich_text: [{}] },
      })
    );
    expect(row.title).toBe("");
    expect(row.instruction).toBe("");
    expect(row.contentId).toBe("");
    expect(row.targetSrc).toBe("");
    expect(row.bodyHtml).toBe("");
  });
});

describe("bodyRegenViewOf", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("ステータスと対象srcだけを表示用に返す", () => {
    const view = bodyRegenViewOf(
      page({
        "本文画像再生成ステータス": { select: { name: "処理中" } },
        "本文画像再生成対象": { rich_text: [{ plain_text: SRC }] },
      })
    );
    expect(view).toEqual({ status: "処理中", targetSrc: SRC, requestedAtMs: null });
  });

  it("未設定・不正ステータスはなし、対象srcは空文字", () => {
    const view = bodyRegenViewOf(page({ "本文画像再生成ステータス": { select: { name: "謎" } } }));
    expect(view).toEqual({ status: "なし", targetSrc: "", requestedAtMs: null });
  });
});

describe("selectStaleBodyRegenIds", () => {
  const base = { title: "", instruction: "", contentId: "", targetSrc: "", bodyHtml: "" };
  const now = 1_000_000_000_000;
  const rows: BodyRegenRow[] = [
    { id: "stale", status: "処理中", requestedAtMs: now - 16 * 60 * 1000, ...base },
    { id: "fresh", status: "処理中", requestedAtMs: now - 5 * 60 * 1000, ...base },
    { id: "nodate", status: "処理中", requestedAtMs: null, ...base },
    { id: "pending", status: "依頼中", requestedAtMs: now - 60 * 60 * 1000, ...base },
  ];

  it("処理中・依頼中で timeout 超過のみ回収(fresh・依頼時刻なしは除外)", () => {
    expect(selectStaleBodyRegenIds(rows, now, 15 * 60 * 1000)).toEqual(["stale", "pending"]);
  });
});

describe("通知本文", () => {
  it("buildBodyRegenDoneMessage はタイトルと承認URLを含む", () => {
    const msg = buildBodyRegenDoneMessage("市川の記事", "https://x/growth/approve");
    expect(msg).toContain("本文画像");
    expect(msg).toContain("市川の記事");
    expect(msg).toContain("https://x/growth/approve");
  });

  it("buildBodyRegenDoneFlex はタイトルと承認URIボタンを持つカードを返す(#162)", () => {
    const bubble = buildBodyRegenDoneFlex("市川の記事", "https://x/growth/approve");
    expect(bubble.type).toBe("bubble");
    expect(bubble.body?.contents[0]).toMatchObject({ text: "市川の記事", weight: "bold" });
    expect(bubble.footer?.contents[0]).toMatchObject({
      action: { type: "uri", uri: "https://x/growth/approve" },
    });
  });

  it("buildBodyRegenFailMessage は理由と再依頼導線を含む", () => {
    const msg = buildBodyRegenFailMessage("市川の記事", "OpenAI 503");
    expect(msg).toMatch(/失敗/);
    expect(msg).toContain("OpenAI 503");
    expect(msg).toContain("市川の記事");
  });
});

describe("isMicrocmsAssetUrl", () => {
  it("https・images.microcms-assets.io のみ true", () => {
    expect(isMicrocmsAssetUrl(SRC)).toBe(true);
    expect(isMicrocmsAssetUrl("http://images.microcms-assets.io/x.png")).toBe(false);
    expect(isMicrocmsAssetUrl("https://evil.com/x.png")).toBe(false);
    expect(isMicrocmsAssetUrl("not a url")).toBe(false);
  });
});

describe("replaceBodyImageBySrc", () => {
  const html =
    `<figure><img src="${SRC}" alt="図1"></figure>` +
    `<figure><img src="${SRC_B}" alt="図2"></figure>`;

  it("src 一致の画像の src だけを差し替え replaced=true を返す(alt・他画像は保持)", () => {
    const out = replaceBodyImageBySrc(html, SRC_B, NEW);
    expect(out.replaced).toBe(true);
    expect(out.html).toContain(`<img src="${SRC}" alt="図1">`);
    expect(out.html).toContain(`<img src="${NEW}" alt="図2">`);
  });

  it("src が見つからなければ replaced=false で本文は無変更", () => {
    const out = replaceBodyImageBySrc(html, NEW, SRC);
    expect(out.replaced).toBe(false);
    expect(out.html).toBe(html);
  });

  it("同一 src が複数あっても先頭の1枚だけ差し替える", () => {
    const dup = `<img src="${SRC}" alt="x"><img src="${SRC}" alt="y">`;
    const out = replaceBodyImageBySrc(dup, SRC, NEW);
    expect(out.replaced).toBe(true);
    expect(out.html).toBe(`<img src="${NEW}" alt="x"><img src="${SRC}" alt="y">`);
  });

  it("oldSrc が microCMS アセットでなければ一致させない(防御)", () => {
    const evil = "https://evil.com/x.png";
    const mixed = `<img src="${evil}" alt="x">`;
    const out = replaceBodyImageBySrc(mixed, evil, NEW);
    expect(out.replaced).toBe(false);
    expect(out.html).toBe(mixed);
  });

  it("src 属性の無い img は飛ばして対象を差し替える", () => {
    const mixed = `<img alt="src無し"><img src="${SRC}" alt="x">`;
    const out = replaceBodyImageBySrc(mixed, SRC, NEW);
    expect(out.replaced).toBe(true);
    expect(out.html).toBe(`<img alt="src無し"><img src="${NEW}" alt="x">`);
  });

  it("newUrl に $ 特殊シーケンスが含まれても壊れず literal で入る(security H-1)", () => {
    const tricky = "https://images.microcms-assets.io/assets/x/$2$1.png";
    const out = replaceBodyImageBySrc(`<img src="${SRC}" alt="図">`, SRC, tricky);
    expect(out.html).toBe(`<img src="${tricky}" alt="図">`);
  });
});

describe("extractBodyImages", () => {
  const A = "https://images.microcms-assets.io/img1.png";
  const B = "https://images.microcms-assets.io/img2.png";

  it("本文出現順に <img src> を抽出する(figure 包み・複数)", () => {
    const html =
      `<h2>見出し</h2>` +
      `<figure><img src="${A}" alt="図1"></figure>` +
      `<p>本文</p>` +
      `<figure><img src="${B}" alt="図2"></figure>`;
    const refs: BodyImageRef[] = extractBodyImages(html);
    expect(refs).toEqual([{ src: A }, { src: B }]);
  });

  it("src の無い <img> は除外する", () => {
    const html = `<img alt="src無し"><img src="${A}" alt="x">`;
    expect(extractBodyImages(html)).toEqual([{ src: A }]);
  });

  it("同一 src の重複は各出現を1要素として残す", () => {
    const html = `<img src="${A}" alt="x"><img src="${A}" alt="y">`;
    expect(extractBodyImages(html)).toEqual([{ src: A }, { src: A }]);
  });

  it("画像が無ければ空配列", () => {
    expect(extractBodyImages("<p>本文だけ</p>")).toEqual([]);
  });
});
