// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  applyDecoration,
  applyDecorations,
  blockKindOf,
  buildDecorateClearProps,
  buildDecorateFailMessage,
  buildDecorateFailProps,
  buildDecoratePresentMessage,
  buildDecoratePresentProps,
  buildDecorateProcessingProps,
  buildDecorateRequestProps,
  DECORATE_BUSY_STATUSES,
  DECORATE_PROPS,
  DECORATE_STATUSES,
  type DecorateRow,
  type DecorationProposal,
  decorateRowFromPage,
  decorateStatusOf,
  decorateViewOf,
  parseProposals,
  previewDecoration,
  selectStaleDecorateIds,
  serializeProposals,
  splitTopLevelBlocks,
} from "./decorate";

const A = "https://images.microcms-assets.io/assets/a/1.png";

function proposal(over: Partial<DecorationProposal> = {}): DecorationProposal {
  return {
    id: "p1",
    blockIndex: 0,
    excerpt: "本文",
    op: "add",
    decoration: "note",
    reason: "注意喚起",
    ...over,
  };
}

describe("DECORATE 定数", () => {
  it("プロパティ名・ステータス・busy 集合", () => {
    expect(DECORATE_PROPS).toEqual({
      instruction: "装飾指示",
      status: "装飾ステータス",
      result: "装飾提案",
      requestedAt: "装飾依頼時刻",
    });
    expect(DECORATE_STATUSES).toEqual(["なし", "依頼中", "処理中", "提示中", "失敗"]);
    expect(DECORATE_BUSY_STATUSES).toEqual(["依頼中", "処理中", "提示中"]);
  });
});

describe("parseProposals / serializeProposals", () => {
  it("妥当な提案配列を往復できる", () => {
    const list = [proposal(), proposal({ id: "p2", op: "remove" })];
    expect(parseProposals(serializeProposals(list))).toEqual(list);
  });

  it("壊れた JSON / 非配列 / スキーマ不一致は空配列(throw しない)", () => {
    expect(parseProposals("{壊れ")).toEqual([]);
    expect(parseProposals(JSON.stringify({ not: "array" }))).toEqual([]);
    expect(parseProposals(JSON.stringify([{ id: "x" }]))).toEqual([]); // 必須欠落
    expect(parseProposals(JSON.stringify([proposal({ op: "explode" as never })]))).toEqual([]);
    expect(parseProposals(JSON.stringify([proposal({ decoration: "rainbow" as never })]))).toEqual([]);
  });

  it("上限超過(長すぎる文字列・多すぎる件数)は空配列(security M-1)", () => {
    expect(parseProposals(JSON.stringify([proposal({ reason: "あ".repeat(1001) })]))).toEqual([]);
    const tooMany = Array.from({ length: 51 }, (_, i) => proposal({ id: `p${i}` }));
    expect(parseProposals(JSON.stringify(tooMany))).toEqual([]);
  });

  it("serializeProposals は不正なら throw", () => {
    expect(() => serializeProposals([{ id: "x" }])).toThrow();
  });
});

describe("splitTopLevelBlocks", () => {
  it("トップレベル要素を順に分割する(要素間テキストは含めない)", () => {
    const html = `<h2>見出し</h2>\n<p>本文1</p><aside class="note">注意</aside>`;
    const blocks = splitTopLevelBlocks(html);
    expect(blocks.map((b) => b.tag)).toEqual(["h2", "p", "aside"]);
    expect(blocks[1].html).toBe("<p>本文1</p>");
  });

  it("ネストした要素は1ブロックにまとまる", () => {
    const blocks = splitTopLevelBlocks(`<figure><img src="${A}"><figcaption>図</figcaption></figure>`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tag).toBe("figure");
  });

  it("トップレベルの void 要素(hr/img)は1ブロックとして数える", () => {
    const blocks = splitTopLevelBlocks(`<p>x</p><hr><img src="${A}">`);
    expect(blocks.map((b) => b.tag)).toEqual(["p", "hr", "img"]);
  });

  it("自己終了タグ(<img/>)も void として扱う", () => {
    const blocks = splitTopLevelBlocks(`<img src="${A}"/><p>x</p>`);
    expect(blocks.map((b) => b.tag)).toEqual(["img", "p"]);
  });

  it("閉じきらない不均衡HTMLは末尾ブロックを落とす", () => {
    const blocks = splitTopLevelBlocks(`<p>ok</p><aside class="note">未完`);
    expect(blocks.map((b) => b.tag)).toEqual(["p"]);
  });

  it("余分な閉じタグは無視する", () => {
    const blocks = splitTopLevelBlocks(`</p><p>x</p>`);
    expect(blocks.map((b) => b.tag)).toEqual(["p"]);
  });
});

describe("blockKindOf", () => {
  it("p / aside.note / blockquote を識別し inner を取り出す", () => {
    const [p, note, bq] = splitTopLevelBlocks(
      `<p>段落</p><aside class="note">注意文</aside><blockquote>引用</blockquote>`
    );
    expect(blockKindOf(p)).toEqual({ tag: "p", decoration: null, inner: "段落" });
    expect(blockKindOf(note)).toEqual({ tag: "aside", decoration: "note", inner: "注意文" });
    expect(blockKindOf(bq)).toEqual({ tag: "blockquote", decoration: "blockquote", inner: "引用" });
  });

  it("装飾でない aside(クラス無し)は decoration=null", () => {
    const [aside] = splitTopLevelBlocks(`<aside>ただの補足</aside>`);
    expect(blockKindOf(aside).decoration).toBeNull();
  });

  it("p 以外の非装飾ブロック(h2)は inner にブロック全体を入れる", () => {
    const [h2] = splitTopLevelBlocks(`<h2>見出し</h2>`);
    const kind = blockKindOf(h2);
    expect(kind.decoration).toBeNull();
    expect(kind.inner).toBe("<h2>見出し</h2>");
  });

  it("内側を取り出せない壊れたブロックは inner 空(防御)", () => {
    expect(blockKindOf({ html: "<p>未完", tag: "p", start: 0, end: 0 }).inner).toBe("");
    expect(blockKindOf({ html: "<blockquote>未完", tag: "blockquote", start: 0, end: 0 }).inner).toBe("");
  });
});

describe("applyDecoration", () => {
  const html = `<p>導入の本文です</p><aside class="note">既に注意</aside>`;

  it("add: プレーン段落を装飾asideで包む", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 0, excerpt: "導入", op: "add", decoration: "highlight" }));
    expect(out.applied).toBe(true);
    expect(out.html).toBe(`<aside class="highlight">導入の本文です</aside><aside class="note">既に注意</aside>`);
  });

  it("add: blockquote 化もできる", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 0, excerpt: "導入", op: "add", decoration: "blockquote" }));
    expect(out.html).toContain("<blockquote>導入の本文です</blockquote>");
  });

  it("change: 既存装飾を別装飾へ", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 1, excerpt: "既に注意", op: "change", decoration: "caution" }));
    expect(out.applied).toBe(true);
    expect(out.html).toContain(`<aside class="caution">既に注意</aside>`);
  });

  it("remove: 装飾を外してプレーン段落へ", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 1, excerpt: "既に注意", op: "remove" }));
    expect(out.applied).toBe(true);
    expect(out.html).toContain("<p>既に注意</p>");
  });

  it("範囲外 blockIndex は applied:false で無変更", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 9 }));
    expect(out.applied).toBe(false);
    expect(out.html).toBe(html);
    expect(out.reason).toMatch(/範囲外/);
  });

  it("抜粋不一致は applied:false で無変更", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 0, excerpt: "ぜんぜん違う" }));
    expect(out.applied).toBe(false);
    expect(out.reason).toMatch(/抜粋/);
  });

  it("add 対象が段落でない(既に装飾)は applied:false", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 1, excerpt: "既に注意", op: "add" }));
    expect(out.applied).toBe(false);
  });

  it("change で変更先が同じ装飾は applied:false", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 1, excerpt: "既に注意", op: "change", decoration: "note" }));
    expect(out.applied).toBe(false);
  });

  it("remove 対象がプレーン段落は applied:false", () => {
    const out = applyDecoration(html, proposal({ blockIndex: 0, excerpt: "導入", op: "remove" }));
    expect(out.applied).toBe(false);
  });
});

describe("applyDecorations(順次適用)", () => {
  it("採用提案を順に適用し件数を返す", () => {
    const html = `<p>A段落</p><p>B段落</p>`;
    const out = applyDecorations(html, [
      proposal({ id: "1", blockIndex: 0, excerpt: "A段落", op: "add", decoration: "note" }),
      proposal({ id: "2", blockIndex: 1, excerpt: "B段落", op: "add", decoration: "caution" }),
    ]);
    expect(out.appliedCount).toBe(2);
    expect(out.html).toBe(`<aside class="note">A段落</aside><aside class="caution">B段落</aside>`);
  });

  it("適用できない提案は飛ばす(本文は壊さない)", () => {
    const html = `<p>A段落</p>`;
    const out = applyDecorations(html, [proposal({ blockIndex: 5, excerpt: "x" })]);
    expect(out.appliedCount).toBe(0);
    expect(out.html).toBe(html);
  });
});

describe("previewDecoration", () => {
  const html = `<p>導入の本文です</p>`;

  it("適用可能なら before/after ブロックを返す", () => {
    const pv = previewDecoration(html, proposal({ blockIndex: 0, excerpt: "導入", op: "add", decoration: "note" }));
    expect(pv.applied).toBe(true);
    expect(pv.before).toBe("<p>導入の本文です</p>");
    expect(pv.after).toBe(`<aside class="note">導入の本文です</aside>`);
  });

  it("適用不可(抜粋不一致)は before のみ・after 空・理由つき", () => {
    const pv = previewDecoration(html, proposal({ blockIndex: 0, excerpt: "ちがう" }));
    expect(pv.applied).toBe(false);
    expect(pv.before).toBe("<p>導入の本文です</p>");
    expect(pv.after).toBe("");
    expect(pv.reason).toBeTruthy();
  });

  it("範囲外は before/after とも空", () => {
    const pv = previewDecoration(html, proposal({ blockIndex: 9 }));
    expect(pv).toEqual({ applied: false, before: "", after: "", reason: expect.stringMatching(/見つかりません/) });
  });

  it("抜粋一致でも op が不整合(プレーン段落をremove)なら before のみ・after 空・理由", () => {
    const pv = previewDecoration(html, proposal({ blockIndex: 0, excerpt: "導入", op: "remove" }));
    expect(pv.applied).toBe(false);
    expect(pv.before).toBe("<p>導入の本文です</p>");
    expect(pv.after).toBe("");
    expect(pv.reason).toMatch(/外せる装飾がありません/);
  });
});

describe("依頼・状態遷移プロパティ", () => {
  it("buildDecorateRequestProps: 指示・依頼中・依頼時刻・結果クリア", () => {
    const props = buildDecorateRequestProps("CTA足して", "2026-06-24T01:00:00.000Z");
    expect(props).toEqual({
      "装飾指示": { rich_text: [{ text: { content: "CTA足して" } }] },
      "装飾提案": { rich_text: [] },
      "装飾ステータス": { select: { name: "依頼中" } },
      "装飾依頼時刻": { date: { start: "2026-06-24T01:00:00.000Z" } },
    });
  });

  it("指示が空なら instruction の rich_text は空", () => {
    expect(buildDecorateRequestProps("", "2026-06-24T01:00:00.000Z")["装飾指示"]).toEqual({ rich_text: [] });
  });

  it("processing / present / fail / clear", () => {
    expect(buildDecorateProcessingProps()).toEqual({ "装飾ステータス": { select: { name: "処理中" } } });
    expect(buildDecoratePresentProps("[]")).toEqual({
      "装飾提案": { rich_text: [{ text: { content: "[]" } }] },
      "装飾ステータス": { select: { name: "提示中" } },
    });
    expect(buildDecorateFailProps("err")).toEqual({
      "装飾ステータス": { select: { name: "失敗" } },
      "装飾提案": { rich_text: [{ text: { content: "err" } }] },
    });
    expect(buildDecorateClearProps()).toEqual({
      "装飾ステータス": { select: { name: "なし" } },
      "装飾指示": { rich_text: [] },
      "装飾提案": { rich_text: [] },
    });
  });
});

describe("decorateStatusOf / decorateViewOf", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("未設定・想定外はなし", () => {
    expect(decorateStatusOf(page({}))).toBe("なし");
    expect(decorateStatusOf(page({ "装飾ステータス": { select: { name: "謎" } } }))).toBe("なし");
  });

  it("提示中＋妥当JSONは proposals を返す", () => {
    const list = [proposal()];
    const view = decorateViewOf(
      page({
        "装飾ステータス": { select: { name: "提示中" } },
        "装飾提案": { rich_text: [{ plain_text: serializeProposals(list) }] },
      })
    );
    expect(view.status).toBe("提示中");
    expect(view.proposals).toEqual(list);
  });

  it("提示中でも壊れていれば proposals 空・raw 保持", () => {
    const view = decorateViewOf(
      page({ "装飾ステータス": { select: { name: "提示中" } }, "装飾提案": { rich_text: [{ plain_text: "壊れ" }] } })
    );
    expect(view.proposals).toEqual([]);
    expect(view.raw).toBe("壊れ");
  });

  it("失敗時は proposals 空・raw に理由", () => {
    const view = decorateViewOf(
      page({ "装飾ステータス": { select: { name: "失敗" } }, "装飾提案": { rich_text: [{ plain_text: "503" }] } })
    );
    expect(view.status).toBe("失敗");
    expect(view.proposals).toEqual([]);
    expect(view.raw).toBe("503");
  });

  it("プロパティ全欠落のページでも落ちない(全 reader の未設定パス)", () => {
    expect(decorateViewOf(page({}))).toEqual({ status: "なし", proposals: [], raw: "" });
  });
});

describe("decorateRowFromPage / selectStaleDecorateIds", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("行情報を取り出す", () => {
    const row = decorateRowFromPage(
      page({
        "タイトル案": { title: [{ plain_text: "記事" }] },
        "装飾指示": { rich_text: [{ plain_text: "強調を" }] },
        "装飾ステータス": { select: { name: "依頼中" } },
        "装飾依頼時刻": { date: { start: "2026-06-24T00:00:00.000Z" } },
        "下書きID": { rich_text: [{ plain_text: "g-abc" }] },
        "下書き本文HTML": { rich_text: [{ plain_text: "<p>本文</p>" }] },
      })
    );
    expect(row).toEqual({
      id: "i1",
      title: "記事",
      instruction: "強調を",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-24T00:00:00.000Z"),
      contentId: "g-abc",
      bodyHtml: "<p>本文</p>",
    });
  });

  it("欠落は空/null、plain_text 欠落も空に落とす", () => {
    const row = decorateRowFromPage(
      page({
        "タイトル案": { title: [{}] },
        "装飾指示": { rich_text: [{}] },
        "下書きID": { rich_text: [{}] },
        "下書き本文HTML": { rich_text: [{}] },
        "装飾依頼時刻": { date: { start: "いつか" } },
      })
    );
    expect(row.title).toBe("");
    expect(row.instruction).toBe("");
    expect(row.contentId).toBe("");
    expect(row.bodyHtml).toBe("");
    expect(row.requestedAtMs).toBeNull();
    expect(row.status).toBe("なし");
  });

  it("プロパティ全欠落でも落ちない(title/date 等 reader の未設定パス)", () => {
    const row = decorateRowFromPage(page({}));
    expect(row).toEqual({
      id: "i1",
      title: "",
      instruction: "",
      status: "なし",
      requestedAtMs: null,
      contentId: "",
      bodyHtml: "",
    });
  });

  it("stale は処理中かつ timeout 超過のみ", () => {
    const base = { title: "", instruction: "", contentId: "", bodyHtml: "" };
    const now = 1_000_000_000_000;
    const rows: DecorateRow[] = [
      { id: "stale", status: "処理中", requestedAtMs: now - 16 * 60 * 1000, ...base },
      { id: "fresh", status: "処理中", requestedAtMs: now - 60 * 1000, ...base },
      { id: "nodate", status: "処理中", requestedAtMs: null, ...base },
    ];
    expect(selectStaleDecorateIds(rows, now, 15 * 60 * 1000)).toEqual(["stale"]);
  });
});

describe("通知本文", () => {
  it("present は承認URL、fail は理由を含む", () => {
    expect(buildDecoratePresentMessage("記事", "https://x/growth/approve")).toContain("https://x/growth/approve");
    const fail = buildDecorateFailMessage("記事", "OpenAI 503");
    expect(fail).toMatch(/失敗/);
    expect(fail).toContain("OpenAI 503");
  });
});
