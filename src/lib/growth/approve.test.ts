// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  draftBodyOf,
  draftLinkOf,
  eyecatchUrlOf,
  ideaTitleOf,
  isNotionPageId,
  parseDecisions,
  pendingStatus,
  reviseProposalOf,
  reviseTitleProposalOf,
  reviseStatusOf,
  toPendingItems,
} from "./approve";

function proposal(id: string, name: string, category: string): NotionPage {
  return {
    id,
    url: "",
    properties: {
      "施策名": { type: "title", title: [{ plain_text: name }] },
      "カテゴリ": { type: "select", select: { name: category } },
      "優先度スコア": { type: "number", number: 8.5 },
      "確度": { type: "select", select: { name: "高" } },
      "インパクト": { type: "select", select: { name: "大" } },
      "根拠": { type: "rich_text", rich_text: [{ plain_text: "MEOクエリが増加" }] },
      "想定アクション": { type: "rich_text", rich_text: [{ plain_text: "GBPを更新" }] },
    },
  };
}

function idea(id: string, title: string, summary: string): NotionPage {
  return {
    id,
    url: "",
    properties: {
      "タイトル案": { type: "title", title: [{ plain_text: title }] },
      "概要": { type: "rich_text", rich_text: [{ plain_text: summary }] },
      "優先度": { type: "select", select: { name: "中" } },
      "根拠": { type: "rich_text", rich_text: [{ plain_text: "関連検索が前月比2.1倍" }] },
      "構成案": { type: "rich_text", rich_text: [{ plain_text: "導入→H2基準3つ→CTA" }] },
    },
  };
}

describe("toPendingItems", () => {
  it("施策提案は判断根拠(優先度スコア/確度/インパクト/根拠/想定アクション)を details に持つ", () => {
    const [item] = toPendingItems([proposal("p1", "市川ページ", "サイト表示内容")], []);

    expect(item).toMatchObject({
      id: "p1",
      kind: "proposal",
      title: "市川ページ",
      subtitle: "サイト表示内容",
    });
    expect(item.details).toEqual([
      { label: "根拠", value: "MEOクエリが増加" },
      { label: "想定アクション", value: "GBPを更新" },
      { label: "優先度スコア", value: "8.5" },
      { label: "確度", value: "高" },
      { label: "インパクト", value: "大" },
    ]);
  });

  it("記事ネタ案は優先度と概要・構成案(outline)・修正状態を持つ", () => {
    const [item] = toPendingItems([], [idea("i1", "猛暑×屋内", "夏向けの集客記事")]);

    expect(item).toMatchObject({
      id: "i1",
      kind: "idea",
      title: "猛暑×屋内",
      subtitle: "夏向けの集客記事",
      // #42: 構成案は details でなく outline(行コメント対象)に移動
      outline: "導入→H2基準3つ→CTA",
      reviseStatus: "なし",
      reviseProposal: "",
      reviseInstructions: "",
    });
    expect(item.details).toEqual([
      { label: "根拠", value: "関連検索が前月比2.1倍" },
      { label: "優先度", value: "中" },
    ]);
  });

  it("記事ネタ案の下書きID(contentId)を反映する(#75)", () => {
    const page = idea("i7", "T", "S");
    page.properties["下書きID"] = { type: "rich_text", rich_text: [{ plain_text: "g-xyz" }] };
    const [item] = toPendingItems([], [page]);
    expect(item.contentId).toBe("g-xyz");
  });

  it("ステータス=下書き作成済み なら isDraftReady=true(#87)", () => {
    const page = idea("i8", "T", "S");
    page.properties["ステータス"] = { type: "select", select: { name: "下書き作成済み" } };
    const [item] = toPendingItems([], [page]);
    expect(item.isDraftReady).toBe(true);
  });

  it("ステータスが下書き作成済み以外なら isDraftReady=false(#87)", () => {
    const page = idea("i8b", "T", "S");
    page.properties["ステータス"] = { type: "select", select: { name: "提案中" } };
    const [item] = toPendingItems([], [page]);
    expect(item.isDraftReady).toBe(false);
  });

  it("記事の段階(stage)を導出する: 承認かつ下書きID無し→queued(#106)", () => {
    const page = idea("i9", "T", "S");
    page.properties["ステータス"] = { type: "select", select: { name: "承認" } };
    const [item] = toPendingItems([], [page]);
    expect(item.stage).toBe("queued");
  });

  it("記事の段階(stage)を導出する: 下書き作成済み→drafted(#106)", () => {
    const page = idea("i10", "T", "S");
    page.properties["ステータス"] = { type: "select", select: { name: "下書き作成済み" } };
    const [item] = toPendingItems([], [page]);
    expect(item.stage).toBe("drafted");
  });

  it("施策の段階(stage)を導出する: 未処理→untouched(#106)", () => {
    const [item] = toPendingItems([proposal("p2", "T", "C")], []);
    expect(item.stage).toBe("untouched");
  });

  it("記事ネタ案の修正ステータスを反映する(#42)", () => {
    const page = idea("i9", "T", "S");
    page.properties["修正ステータス"] = { type: "select", select: { name: "提示中" } };
    page.properties["修正案"] = { type: "rich_text", rich_text: [{ plain_text: "改訂版アウトライン" }] };
    const [item] = toPendingItems([], [page]);
    expect(item.reviseStatus).toBe("提示中");
    expect(item.reviseProposal).toBe("改訂版アウトライン");
  });

  it("記事ネタ案の修正タイトル案を反映する(#139 B)", () => {
    const page = idea("i10", "T", "S");
    page.properties["修正タイトル案"] = {
      type: "rich_text",
      rich_text: [{ plain_text: "新しいタイトル案" }],
    };
    const [item] = toPendingItems([], [page]);
    expect(item.reviseTitleProposal).toBe("新しいタイトル案");
  });

  it("記事ネタ案の修正依頼時刻を ms で反映する(#C2 UI: 経過/滞留表示)", () => {
    const iso = "2026-06-25T00:00:00.000Z";
    const page = idea("i11", "T", "S");
    page.properties["修正依頼時刻"] = { type: "date", date: { start: iso } };
    const [item] = toPendingItems([], [page]);
    expect(item.reviseRequestedAtMs).toBe(Date.parse(iso));
  });

  it("修正依頼時刻が未設定なら reviseRequestedAtMs は null", () => {
    const [item] = toPendingItems([], [idea("i12", "T", "S")]);
    expect(item.reviseRequestedAtMs).toBeNull();
  });

  it("修正依頼時刻が不正日付なら reviseRequestedAtMs は null(NaN を弾く)", () => {
    const page = idea("i13", "T", "S");
    page.properties["修正依頼時刻"] = { type: "date", date: { start: "not-a-date" } };
    const [item] = toPendingItems([], [page]);
    expect(item.reviseRequestedAtMs).toBeNull();
  });

  it("記事ネタ案の根拠が空なら details から除外する(#238)", () => {
    const noRationale: NotionPage = {
      id: "i2",
      url: "",
      properties: {
        "タイトル案": { type: "title", title: [{ plain_text: "B" }] },
        "優先度": { type: "select", select: { name: "高" } },
      },
    };
    const [item] = toPendingItems([], [noRationale]);
    expect(item.details).toEqual([{ label: "優先度", value: "高" }]);
  });

  it("欠落プロパティは空文字・空 details で埋める", () => {
    const bare: NotionPage = { id: "x", url: "", properties: {} };
    expect(toPendingItems([bare], [bare])).toEqual([
      {
        id: "x",
        kind: "proposal",
        title: "",
        subtitle: "",
        details: [],
        score: 0,
        stage: "untouched",
      },
      {
        id: "x",
        kind: "idea",
        title: "",
        subtitle: "",
        details: [],
        score: 0,
        outline: "",
        reviseStatus: "なし",
        reviseProposal: "",
        reviseTitleProposal: "",
        reviseInstructions: "",
        reviseRequestedAtMs: null,
        contentId: "",
        isDraftReady: false,
        stage: "proposed",
      },
    ]);
  });

  it("優先度スコアが数値でない場合は details から除外する", () => {
    const noScore: NotionPage = {
      id: "z",
      url: "",
      properties: {
        "施策名": { type: "title", title: [{ plain_text: "A" }] },
        "確度": { type: "select", select: { name: "中" } },
      },
    };
    const [item] = toPendingItems([noScore], []);
    expect(item.details).toEqual([{ label: "確度", value: "中" }]);
  });

  it("plain_text 欠落の rich text 要素を空文字に落とす", () => {
    const noPlain: NotionPage = {
      id: "y",
      url: "",
      properties: {
        "施策名": { type: "title", title: [{}] },
        "概要": { type: "rich_text", rich_text: [{}] },
      },
    };
    expect(toPendingItems([noPlain], [noPlain])).toEqual([
      {
        id: "y",
        kind: "proposal",
        title: "",
        subtitle: "",
        details: [],
        score: 0,
        stage: "untouched",
      },
      {
        id: "y",
        kind: "idea",
        title: "",
        subtitle: "",
        details: [],
        score: 0,
        outline: "",
        reviseStatus: "なし",
        reviseProposal: "",
        reviseTitleProposal: "",
        reviseInstructions: "",
        reviseRequestedAtMs: null,
        contentId: "",
        isDraftReady: false,
        stage: "proposed",
      },
    ]);
  });

  it("施策は優先度スコア、記事は優先度ランクを score に持つ(#242)", () => {
    const [p] = toPendingItems([proposal("p1", "A", "x")], []);
    expect(p.score).toBe(8.5);

    const [mid] = toPendingItems([], [idea("i1", "B", "y")]);
    expect(mid.score).toBe(2); // 優先度=中 → 2

    const lowPage: NotionPage = {
      id: "i2",
      url: "",
      properties: {
        "タイトル案": { type: "title", title: [{ plain_text: "C" }] },
        "優先度": { type: "select", select: { name: "未知" } },
      },
    };
    const [unknown] = toPendingItems([], [lowPage]);
    expect(unknown.score).toBe(0); // 範囲外 → 0
  });
});

describe("parseDecisions", () => {
  it("正しい decisions 配列を返す", () => {
    const result = parseDecisions({
      decisions: [
        { id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" },
        { id: "5adab8b1f1824123b9639463a2580d4a", decision: "却下" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" });
  });

  it("クローズ(#167)も受け付ける", () => {
    const result = parseDecisions({
      decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "クローズ" }],
    });
    expect(result).toEqual([{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "クローズ" }]);
  });

  it("承認待ちへ戻すステータス(未処理/提案中)も受け付ける(#235 取り消し)", () => {
    const result = parseDecisions({
      decisions: [
        { id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "未処理" },
        { id: "5adab8b1f1824123b9639463a2580d4a", decision: "提案中" },
      ],
    });
    expect(result).toEqual([
      { id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "未処理" },
      { id: "5adab8b1f1824123b9639463a2580d4a", decision: "提案中" },
    ]);
  });

  it.each([
    [null, /不正なリクエスト/],
    [{}, /配列/],
    [{ decisions: "x" }, /配列/],
    [{ decisions: [null] }, /不正な項目/],
    [{ decisions: [{ id: 1, decision: "承認" }] }, /不正な id/],
    [{ decisions: [{ id: "bad id!", decision: "承認" }] }, /不正な id/],
    [{ decisions: [{ id: "abc", decision: "承認" }] }, /不正な id/],
    [
      { decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "保留" }] },
      /承認.*却下/,
    ],
  ])("不正な入力 %# を弾く", (input, pattern) => {
    expect(() => parseDecisions(input)).toThrow(pattern);
  });
});

describe("pendingStatus", () => {
  it("施策提案の承認待ちは未処理", () => {
    expect(pendingStatus("proposal")).toBe("未処理");
  });

  it("記事ネタ案の承認待ちは提案中", () => {
    expect(pendingStatus("idea")).toBe("提案中");
  });
});

describe("isNotionPageId", () => {
  it("ダッシュ有/無の UUID を許可し、不正値・非文字列を弾く", () => {
    expect(isNotionPageId("38099efa-346b-8122-9681-f4d2cc321a31")).toBe(true);
    expect(isNotionPageId("5adab8b1f1824123b9639463a2580d4a")).toBe(true);
    expect(isNotionPageId("../evil")).toBe(false);
    expect(isNotionPageId("abc")).toBe(false);
    expect(isNotionPageId(123)).toBe(false);
    expect(isNotionPageId(null)).toBe(false);
  });
});

describe("reviseStatusOf", () => {
  function pageWithStatus(name?: string): NotionPage {
    return {
      id: "i1",
      url: "",
      properties: name
        ? { "修正ステータス": { type: "select", select: { name } } }
        : {},
    };
  }

  it("有効な修正ステータスをそのまま返す", () => {
    expect(reviseStatusOf(pageWithStatus("依頼中"))).toBe("依頼中");
    expect(reviseStatusOf(pageWithStatus("提示中"))).toBe("提示中");
  });

  it("未設定・想定外は「なし」", () => {
    expect(reviseStatusOf(pageWithStatus())).toBe("なし");
    expect(reviseStatusOf(pageWithStatus("謎"))).toBe("なし");
  });
});

describe("reviseProposalOf", () => {
  it("修正案(rich_text)を読み、未設定は空文字", () => {
    const withProposal: NotionPage = {
      id: "i1",
      url: "",
      properties: { "修正案": { type: "rich_text", rich_text: [{ plain_text: "改訂版" }] } },
    };
    expect(reviseProposalOf(withProposal)).toBe("改訂版");
    expect(reviseProposalOf({ id: "x", url: "", properties: {} })).toBe("");
  });
});

describe("reviseTitleProposalOf（#139 B）", () => {
  it("修正タイトル案(rich_text)を読み、未設定は空文字", () => {
    const withTitle: NotionPage = {
      id: "i1",
      url: "",
      properties: {
        "修正タイトル案": { type: "rich_text", rich_text: [{ plain_text: "短い新タイトル" }] },
      },
    };
    expect(reviseTitleProposalOf(withTitle)).toBe("短い新タイトル");
    expect(reviseTitleProposalOf({ id: "x", url: "", properties: {} })).toBe("");
  });
});

describe("draftLinkOf", () => {
  it("下書きID/下書きプレビューキー(rich_text)を読む", () => {
    const page: NotionPage = {
      id: "i1",
      url: "",
      properties: {
        "下書きID": { type: "rich_text", rich_text: [{ plain_text: "g-abc" }] },
        "下書きプレビューキー": { type: "rich_text", rich_text: [{ plain_text: "dk-1" }] },
      },
    };
    expect(draftLinkOf(page)).toEqual({ contentId: "g-abc", draftKey: "dk-1" });
  });

  it("未設定は空文字(下書き未作成の判定に使う)", () => {
    expect(draftLinkOf({ id: "x", url: "", properties: {} })).toEqual({
      contentId: "",
      draftKey: "",
    });
  });
});

describe("draftBodyOf / ideaTitleOf（本文ミラー #95）", () => {
  it("下書き本文HTML(分割 rich_text)を trim せず連結して読む", () => {
    const page: NotionPage = {
      id: "i1",
      url: "",
      properties: {
        "下書き本文HTML": {
          type: "rich_text",
          rich_text: [{ plain_text: "<p>前半</p>" }, { plain_text: "<p>後半</p>" }],
        },
        "タイトル案": { type: "title", title: [{ plain_text: "夜のピックル" }] },
      },
    };
    expect(draftBodyOf(page)).toBe("<p>前半</p><p>後半</p>");
    expect(ideaTitleOf(page)).toBe("夜のピックル");
  });

  it("未保存は空文字(プレビューの exists:false 判定に使う)", () => {
    expect(draftBodyOf({ id: "x", url: "", properties: {} })).toBe("");
    expect(ideaTitleOf({ id: "x", url: "", properties: {} })).toBe("");
  });

  it("plain_text 欠落の rich_text 要素は空文字に落とす", () => {
    const page: NotionPage = {
      id: "i2",
      url: "",
      properties: {
        "下書き本文HTML": { type: "rich_text", rich_text: [{}, { plain_text: "<p>後</p>" }] },
      },
    };
    expect(draftBodyOf(page)).toBe("<p>後</p>");
  });
});

describe("eyecatchUrlOf（アイキャッチミラー #141）", () => {
  it("URLプロパティから読む", () => {
    const page: NotionPage = {
      id: "x",
      url: "",
      properties: { "アイキャッチURL": { url: "https://images.microcms-assets.io/a.png" } },
    };
    expect(eyecatchUrlOf(page)).toBe("https://images.microcms-assets.io/a.png");
  });

  it("テキスト(rich_text)プロパティからも読む", () => {
    const page: NotionPage = {
      id: "x",
      url: "",
      properties: {
        "アイキャッチURL": { rich_text: [{ plain_text: "https://images.microcms-assets.io/b.png" }] },
      },
    };
    expect(eyecatchUrlOf(page)).toBe("https://images.microcms-assets.io/b.png");
  });

  it("未設定は空文字", () => {
    expect(eyecatchUrlOf({ id: "x", url: "", properties: {} })).toBe("");
  });

  it("rich_text の plain_text 欠落要素は空文字に落とす", () => {
    const page: NotionPage = {
      id: "x",
      url: "",
      properties: { "アイキャッチURL": { rich_text: [{}] } },
    };
    expect(eyecatchUrlOf(page)).toBe("");
  });
});
