// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  buildOutlineEditProps,
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

describe("buildReviseRequestProps", () => {
  it("修正指示(分割rich_text)・依頼中・依頼時刻を1まとめにする", () => {
    const json = serializeReviseInstructions([{ line: "見出し", comment: "短く" }]);
    const props = buildReviseRequestProps(json, "2026-06-19T01:00:00.000Z");
    expect(props).toEqual({
      "修正指示": { rich_text: [{ text: { content: json } }] },
      "修正ステータス": { select: { name: "依頼中" } },
      "修正依頼時刻": { date: { start: "2026-06-19T01:00:00.000Z" } },
    });
  });
});

describe("buildReviseApplyProps", () => {
  it("構成案を上書きし、修正指示・修正案をクリア、ステータスをなしに戻す", () => {
    expect(buildReviseApplyProps("新しいアウトライン")).toEqual({
      "構成案": { rich_text: [{ text: { content: "新しいアウトライン" } }] },
      "修正ステータス": { select: { name: "なし" } },
      "修正指示": { rich_text: [] },
      "修正案": { rich_text: [] },
    });
  });
});

describe("buildReviseDiscardProps", () => {
  it("構成案は触らず、修正指示・修正案・ステータスをクリアする", () => {
    expect(buildReviseDiscardProps()).toEqual({
      "修正ステータス": { select: { name: "なし" } },
      "修正指示": { rich_text: [] },
      "修正案": { rich_text: [] },
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

describe("PC poller のプロパティ組み立て", () => {
  it("buildReviseProcessingProps はロック(処理中)にする", () => {
    expect(buildReviseProcessingProps()).toEqual({
      "修正ステータス": { select: { name: "処理中" } },
    });
  });

  it("buildReviseProposalProps は修正案を入れ提示中にする", () => {
    expect(buildReviseProposalProps("## 改訂")).toEqual({
      "修正案": { rich_text: [{ text: { content: "## 改訂" } }] },
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

  it("ステータス/依頼時刻/構成案/修正指示を取り出す", () => {
    const json = serializeReviseInstructions([{ line: "## A", comment: "短く" }]);
    const row = reviseRowFromPage(
      page({
        "タイトル案": { title: [{ plain_text: "市川の記事" }] },
        "修正ステータス": { select: { name: "依頼中" } },
        "修正依頼時刻": { date: { start: "2026-06-19T00:00:00.000Z" } },
        "構成案": { rich_text: [{ plain_text: "## A\n## B" }] },
        "修正指示": { rich_text: [{ plain_text: json }] },
      })
    );
    expect(row).toEqual({
      id: "i1",
      title: "市川の記事",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-19T00:00:00.000Z"),
      outline: "## A\n## B",
      instructions: [{ line: "## A", comment: "短く" }],
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
  const base = { title: "", outline: "", instructions: [] as ReviseComment[] };
  const now = 1_000_000_000_000;
  const rows: ReviseRow[] = [
    { id: "stale", status: "処理中", requestedAtMs: now - 16 * 60 * 1000, ...base },
    { id: "fresh", status: "処理中", requestedAtMs: now - 5 * 60 * 1000, ...base },
    { id: "nodate", status: "処理中", requestedAtMs: null, ...base },
    { id: "pending", status: "依頼中", requestedAtMs: now - 60 * 60 * 1000, ...base },
  ];

  it("処理中かつ timeout 超過の行だけ回収対象にする", () => {
    expect(selectStaleReviseIds(rows, now, 15 * 60 * 1000)).toEqual(["stale"]);
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
