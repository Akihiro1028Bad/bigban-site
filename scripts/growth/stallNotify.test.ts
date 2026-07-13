import { describe, expect, it } from "vitest";

import { buildStallMessage } from "./stallNotify";

describe("buildStallMessage", () => {
  it("生成中の滞留と wedge を合わせて件数付きで通知する", () => {
    const msg = buildStallMessage({
      generatingTitles: ["屋内ピックル入門", "市川で始める"],
      staleLoopTitles: ["処理中で止まった記事（構成案修正）"],
      wedgeTitles: ["修正待ちの記事"],
      thresholdMinutes: 15,
    });
    expect(msg).toContain("15分");
    expect(msg).toContain("生成待ち/生成中");
    expect(msg).toContain("屋内ピックル入門");
    expect(msg).toContain("市川で始める");
    expect(msg).toContain("処理中で止まった記事");
    expect(msg).toContain("修正待ちの記事");
  });

  it("生成中の滞留のみなら wedge セクションを出さない", () => {
    const msg = buildStallMessage({
      generatingTitles: ["A"],
      staleLoopTitles: [],
      wedgeTitles: [],
      thresholdMinutes: 15,
    });
    expect(msg).toContain("A");
    expect(msg).not.toContain("依頼時刻");
  });

  it("wedge のみなら生成中セクションを出さず wedge を出す", () => {
    const msg = buildStallMessage({
      generatingTitles: [],
      staleLoopTitles: [],
      wedgeTitles: ["宙ぶらりんの記事"],
      thresholdMinutes: 15,
    });
    expect(msg).toContain("宙ぶらりんの記事");
    expect(msg).toContain("依頼時刻");
    expect(msg).not.toContain("生成待ち/生成中のまま");
  });

  it("すべて空なら null(通知不要)", () => {
    expect(
      buildStallMessage({
        generatingTitles: [],
        staleLoopTitles: [],
        wedgeTitles: [],
        thresholdMinutes: 15,
      })
    ).toBeNull();
  });

  it("依頼時刻ありの busy が timeout 超過した場合は自動回収対象として通知する", () => {
    const msg = buildStallMessage({
      generatingTitles: [],
      staleLoopTitles: ["市川の記事（構成案修正）"],
      wedgeTitles: [],
      thresholdMinutes: 15,
    });

    expect(msg).toContain("自動回収対象");
    expect(msg).toContain("市川の記事（構成案修正）");
  });

  it("タイトル空は (無題) にフォールバックする", () => {
    const msg = buildStallMessage({
      generatingTitles: ["   "],
      staleLoopTitles: [],
      wedgeTitles: [],
      thresholdMinutes: 15,
    });
    expect(msg).toContain("(無題)");
  });
});
