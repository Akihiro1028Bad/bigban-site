// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  buildOutlineEditProps,
  buildTitleEditProps,
  buildReviseApplyProps,
  buildReviseDiscardProps,
  buildReviseFailMessage,
  buildReviseFailProps,
  buildReviseProcessingProps,
  buildReviseProposalProps,
  buildReviseRequestProps,
  buildRevisePresentMessage,
  parseReviseInstructions,
  REVISE_BUSY_STATUSES,
  REVISE_PROPS,
  REVISE_STATUSES,
  reviseRowFromPage,
  selectStaleReviseIds,
  serializeReviseInstructions,
  type ReviseComment,
  type ReviseRow,
} from "./revise";

describe("REVISE 定数", () => {
  it("プロパティ名・ステータス・busy 集合を提供する", () => {
    expect(REVISE_PROPS).toEqual({
      instructions: "修正指示",
      status: "修正ステータス",
      proposal: "修正案",
      requestedAt: "修正依頼時刻",
      titleInstruction: "修正タイトル指示",
      titleProposal: "修正タイトル案",
    });
    expect(REVISE_STATUSES).toContain("提示中");
    expect(REVISE_BUSY_STATUSES).toEqual(["依頼中", "処理中", "提示中"]);
  });
});

describe("serializeReviseInstructions", () => {
  it("行コメント配列を JSON 化し、前後空白を整える", () => {
    const comments: ReviseComment[] = [
      { line: " ## 市川でできる場所は3つ ", comment: " 3つを箇条書きで " },
    ];
    expect(serializeReviseInstructions(comments)).toBe(
      JSON.stringify([{ line: "## 市川でできる場所は3つ", comment: "3つを箇条書きで" }])
    );
  });

  it("空配列は弾く", () => {
    expect(() => serializeReviseInstructions([])).toThrow(/空です/);
  });

  it("line / comment が空の要素は弾く", () => {
    expect(() =>
      serializeReviseInstructions([{ line: "  ", comment: "x" }])
    ).toThrow(/不正/);
    expect(() =>
      serializeReviseInstructions([{ line: "h", comment: "" }])
    ).toThrow(/不正/);
  });
});

describe("parseReviseInstructions", () => {
  it("serialize と往復できる", () => {
    const json = serializeReviseInstructions([{ line: "見出しA", comment: "短く" }]);
    expect(parseReviseInstructions(json)).toEqual([{ line: "見出しA", comment: "短く" }]);
  });

  it("不正な JSON は弾く", () => {
    expect(() => parseReviseInstructions("not json")).toThrow(/解釈できません/);
  });

  it("配列でない / 空配列は弾く", () => {
    expect(() => parseReviseInstructions('{"line":"a"}')).toThrow(/配列/);
    expect(() => parseReviseInstructions("[]")).toThrow(/配列/);
  });

  it("要素の line / comment が不正なら弾く", () => {
    expect(() => parseReviseInstructions('[{"line":"a"}]')).toThrow(/不正/);
    expect(() => parseReviseInstructions('[{"line":"","comment":"c"}]')).toThrow(/不正/);
  });
});

describe("buildReviseRequestProps（#139 B: 構成案/タイトルの並走）", () => {
  const CLEARED_TITLE = { "修正タイトル指示": { rich_text: [] } };

  it("構成案コメントのみ: 修正指示を入れ、タイトル指示は空・依頼中・依頼時刻", () => {
    const json = serializeReviseInstructions([{ line: "見出し", comment: "短く" }]);
    const props = buildReviseRequestProps(json, null, "2026-06-19T01:00:00.000Z");
    expect(props).toEqual({
      "修正指示": { rich_text: [{ text: { content: json } }] },
      ...CLEARED_TITLE,
      "修正ステータス": { select: { name: "依頼中" } },
      "修正依頼時刻": { date: { start: "2026-06-19T01:00:00.000Z" } },
    });
  });

  it("タイトル指示のみ: 修正指示は空・タイトル指示を入れる", () => {
    const props = buildReviseRequestProps(null, "もっと短く具体的に", "2026-06-19T01:00:00.000Z");
    expect(props).toEqual({
      "修正指示": { rich_text: [] },
      "修正タイトル指示": { rich_text: [{ text: { content: "もっと短く具体的に" } }] },
      "修正ステータス": { select: { name: "依頼中" } },
      "修正依頼時刻": { date: { start: "2026-06-19T01:00:00.000Z" } },
    });
  });

  it("両方: 構成案コメントとタイトル指示の両方を入れる", () => {
    const json = serializeReviseInstructions([{ line: "見出し", comment: "短く" }]);
    const props = buildReviseRequestProps(json, "タイトルも短く", "2026-06-19T01:00:00.000Z");
    expect(props).toMatchObject({
      "修正指示": { rich_text: [{ text: { content: json } }] },
      "修正タイトル指示": { rich_text: [{ text: { content: "タイトルも短く" } }] },
    });
  });
});

describe("buildReviseApplyProps（#139 B: ある方だけ反映）", () => {
  const CLEARED = {
    "修正ステータス": { select: { name: "なし" } },
    "修正指示": { rich_text: [] },
    "修正案": { rich_text: [] },
    "修正タイトル指示": { rich_text: [] },
    "修正タイトル案": { rich_text: [] },
  };

  it("構成案のみ: 構成案を上書きし、修正状態を全クリア(タイトル案は触らない)", () => {
    expect(buildReviseApplyProps("新しいアウトライン", null)).toEqual({
      "構成案": { rich_text: [{ text: { content: "新しいアウトライン" } }] },
      ...CLEARED,
    });
  });

  it("タイトルのみ: タイトル案(title型)を上書きし、修正状態を全クリア(構成案は触らない)", () => {
    expect(buildReviseApplyProps(null, "梅雨でも打てる")).toEqual({
      "タイトル案": { title: [{ text: { content: "梅雨でも打てる" } }] },
      ...CLEARED,
    });
  });

  it("両方: 構成案とタイトル案の両方を上書きする", () => {
    expect(buildReviseApplyProps("## A", "新タイトル")).toEqual({
      "構成案": { rich_text: [{ text: { content: "## A" } }] },
      "タイトル案": { title: [{ text: { content: "新タイトル" } }] },
      ...CLEARED,
    });
  });
});

describe("buildReviseDiscardProps", () => {
  it("構成案・タイトル案は触らず、指示・提案・ステータスを全クリアする", () => {
    expect(buildReviseDiscardProps()).toEqual({
      "修正ステータス": { select: { name: "なし" } },
      "修正指示": { rich_text: [] },
      "修正案": { rich_text: [] },
      "修正タイトル指示": { rich_text: [] },
      "修正タイトル案": { rich_text: [] },
    });
  });
});

describe("buildOutlineEditProps", () => {
  it("構成案だけを直接上書きする(修正状態は触らない)", () => {
    expect(buildOutlineEditProps("## A\n説明")).toEqual({
      "構成案": { rich_text: [{ text: { content: "## A\n説明" } }] },
    });
  });
});

describe("buildTitleEditProps（#139 A: タイトル直接編集）", () => {
  it("タイトル案(title型)を直接上書きする", () => {
    expect(buildTitleEditProps("梅雨でも打てる屋内の選び方")).toEqual({
      "タイトル案": { title: [{ text: { content: "梅雨でも打てる屋内の選び方" } }] },
    });
  });

  it("空文字は title:[] (空)", () => {
    expect(buildTitleEditProps("")).toEqual({ "タイトル案": { title: [] } });
  });
});

describe("PC poller のプロパティ組み立て", () => {
  it("buildReviseProcessingProps はロック(処理中)にする", () => {
    expect(buildReviseProcessingProps()).toEqual({
      "修正ステータス": { select: { name: "処理中" } },
    });
  });

  it("buildReviseProposalProps 構成案のみ: 修正案を入れタイトル案は空・提示中", () => {
    expect(buildReviseProposalProps("## 改訂", null)).toEqual({
      "修正案": { rich_text: [{ text: { content: "## 改訂" } }] },
      "修正タイトル案": { rich_text: [] },
      "修正ステータス": { select: { name: "提示中" } },
    });
  });

  it("buildReviseProposalProps タイトルのみ: 修正案は空・修正タイトル案を入れる", () => {
    expect(buildReviseProposalProps(null, "新タイトル案")).toEqual({
      "修正案": { rich_text: [] },
      "修正タイトル案": { rich_text: [{ text: { content: "新タイトル案" } }] },
      "修正ステータス": { select: { name: "提示中" } },
    });
  });

  it("buildReviseFailProps は失敗にして理由を修正案へ入れる", () => {
    expect(buildReviseFailProps("タイムアウト")).toEqual({
      "修正ステータス": { select: { name: "失敗" } },
      "修正案": { rich_text: [{ text: { content: "タイムアウト" } }] },
    });
  });
});

describe("reviseRowFromPage", () => {
  function page(props: Record<string, unknown>): NotionPage {
    return { id: "i1", url: "", properties: props };
  }

  it("ステータス/依頼時刻/構成案/修正指示/タイトル指示/タイトル案を取り出す", () => {
    const json = serializeReviseInstructions([{ line: "## A", comment: "短く" }]);
    const row = reviseRowFromPage(
      page({
        "タイトル案": { title: [{ plain_text: "市川の記事" }] },
        "修正ステータス": { select: { name: "依頼中" } },
        "修正依頼時刻": { date: { start: "2026-06-19T00:00:00.000Z" } },
        "構成案": { rich_text: [{ plain_text: "## A\n## B" }] },
        "修正指示": { rich_text: [{ plain_text: json }] },
        "修正タイトル指示": { rich_text: [{ plain_text: "もっと短く" }] },
        "修正タイトル案": { rich_text: [{ plain_text: "短い新タイトル" }] },
      })
    );
    expect(row).toEqual({
      id: "i1",
      title: "市川の記事",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-19T00:00:00.000Z"),
      outline: "## A\n## B",
      instructions: [{ line: "## A", comment: "短く" }],
      titleInstruction: "もっと短く",
      titleProposal: "短い新タイトル",
    });
  });

  it("壊れた修正指示・未設定は空に落とす(落とさない)", () => {
    const row = reviseRowFromPage(
      page({ "修正指示": { rich_text: [{ plain_text: "not json" }] } })
    );
    expect(row.status).toBe("なし");
    expect(row.requestedAtMs).toBeNull();
    expect(row.outline).toBe("");
    expect(row.instructions).toEqual([]);
    expect(row.titleInstruction).toBe("");
    expect(row.titleProposal).toBe("");
  });

  it("不正な日付は null", () => {
    const row = reviseRowFromPage(page({ "修正依頼時刻": { date: { start: "いつか" } } }));
    expect(row.requestedAtMs).toBeNull();
  });

  it("plain_text 欠落の title / rich_text 要素は空文字に落とす", () => {
    const row = reviseRowFromPage(
      page({
        "タイトル案": { title: [{}] },
        "構成案": { rich_text: [{}] },
      })
    );
    expect(row.title).toBe("");
    expect(row.outline).toBe("");
  });
});

describe("selectStaleReviseIds", () => {
  const base = {
    title: "",
    outline: "",
    instructions: [] as ReviseComment[],
    titleInstruction: "",
    titleProposal: "",
  };
  const now = 1_000_000_000_000;
  const rows: ReviseRow[] = [
    { id: "stale", status: "処理中", requestedAtMs: now - 16 * 60 * 1000, ...base },
    { id: "fresh", status: "処理中", requestedAtMs: now - 5 * 60 * 1000, ...base },
    { id: "nodate", status: "処理中", requestedAtMs: null, ...base },
    { id: "pending", status: "依頼中", requestedAtMs: now - 60 * 60 * 1000, ...base },
    { id: "present", status: "提示中", requestedAtMs: now - 60 * 60 * 1000, ...base },
  ];

  it("処理中・依頼中で timeout 超過のみ回収(提示中・fresh・依頼時刻なしは除外)", () => {
    expect(selectStaleReviseIds(rows, now, 15 * 60 * 1000)).toEqual(["stale", "pending"]);
  });
});

describe("通知本文", () => {
  it("buildRevisePresentMessage はタイトルと承認URLを含む", () => {
    const msg = buildRevisePresentMessage("市川の記事", "https://x/growth/approve");
    expect(msg).toContain("修正案ができました");
    expect(msg).toContain("市川の記事");
    expect(msg).toContain("https://x/growth/approve");
  });

  it("buildReviseFailMessage は理由と再依頼導線を含む", () => {
    const msg = buildReviseFailMessage("市川の記事", "504");
    expect(msg).toMatch(/失敗/);
    expect(msg).toContain("504");
    expect(msg).toContain("やり直し");
  });
});
