import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import { detectStalls } from "./stallDetection";
import { WEDGE_LOOPS } from "./wedgeLoops";

const NOW = Date.parse("2026-07-14T00:00:00.000Z");
const TIMEOUT = 15 * 60 * 1000;

function page(id: string, properties: Record<string, unknown>): NotionPage {
  return { id, url: `https://notion.so/${id}`, properties };
}

describe("detectStalls", () => {
  it("7ループすべてで依頼時刻あり・15分超のbusy行を抽出する", () => {
    const pages = WEDGE_LOOPS.map((loop, index) =>
      page(`p${index}`, {
        "タイトル案": { title: [{ plain_text: `記事${index}` }] },
        [loop.statusProp]: { select: { name: index % 2 === 0 ? "処理中" : "依頼中" } },
        [loop.requestedAtProp]: { date: { start: new Date(NOW - TIMEOUT - 1).toISOString() } },
      })
    );

    expect(detectStalls(pages, NOW, TIMEOUT).staleLoopTitles).toEqual(
      WEDGE_LOOPS.map((loop, index) => `記事${index}（${loop.label}）`)
    );
  });

  it("生成滞留・依頼時刻なしwedge・新しいbusyを区別する", () => {
    const loop = WEDGE_LOOPS[0];
    const pages = [
      {
        ...page("generating", {
          "タイトル案": { title: [{ plain_text: "生成滞留" }] },
          "ステータス": { select: { name: "生成中" } },
        }),
        last_edited_time: new Date(NOW - TIMEOUT - 1).toISOString(),
      },
      page("wedge", {
        "タイトル案": { title: [{ plain_text: "時刻なし" }] },
        [loop.statusProp]: { select: { name: "処理中" } },
        [loop.requestedAtProp]: { date: null },
      }),
      page("fresh", {
        "タイトル案": { title: [{ plain_text: "新規" }] },
        [loop.statusProp]: { select: { name: "依頼中" } },
        [loop.requestedAtProp]: { date: { start: new Date(NOW - 1_000).toISOString() } },
      }),
    ];

    expect(detectStalls(pages, NOW, TIMEOUT)).toEqual({
      generatingTitles: ["生成滞留"],
      staleLoopTitles: [],
      wedgeTitles: [`時刻なし（${loop.label}）`],
    });
  });

  it("欠落タイトルと不正な日時は安全側で空・時刻なしとして扱う", () => {
    const first = WEDGE_LOOPS[0];
    const second = WEDGE_LOOPS[1];
    const pages = [
      {
        ...page("invalid-a", {
          "ステータス": { select: { name: "生成中" } },
          [first.statusProp]: { select: { name: "処理中" } },
          [first.requestedAtProp]: { date: { start: "invalid" } },
        }),
        last_edited_time: "invalid",
      },
      page("invalid-b", {
        "タイトル案": { title: [{}] },
        [second.statusProp]: { select: { name: "依頼中" } },
        [second.requestedAtProp]: { date: { start: "invalid" } },
      }),
    ];

    expect(detectStalls(pages, NOW, TIMEOUT)).toEqual({
      generatingTitles: [],
      staleLoopTitles: [],
      wedgeTitles: [`(無題)（${first.label}）`, `(無題)（${second.label}）`],
    });
  });
});
