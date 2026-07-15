import { describe, expect, it } from "vitest";

import {
  buildScheduleProps,
  partitionPublishQueue,
  PUBLISH_SCHEDULE_PROP,
  publishQueueItemFromPage,
  type PublishQueueItem,
  publishBlockReason,
  selectDuePublications,
} from "./publishQueue";

function item(over: Partial<PublishQueueItem> & { id: string }): PublishQueueItem {
  return {
    stage: "drafted",
    eyecatchUrl: "https://images.microcms-assets.io/x.png",
    hasDraftBody: true,
    ...over,
  };
}

describe("buildScheduleProps", () => {
  it("予約時刻を date.start に書く", () => {
    expect(buildScheduleProps("2026-07-01T00:00:00.000Z")).toEqual({
      [PUBLISH_SCHEDULE_PROP]: { date: { start: "2026-07-01T00:00:00.000Z" } },
    });
  });
  it("null は予約解除(date: null)", () => {
    expect(buildScheduleProps(null)).toEqual({ [PUBLISH_SCHEDULE_PROP]: { date: null } });
  });
});

describe("publishBlockReason", () => {
  it("アイキャッチ未設定は理由を返す", () => {
    expect(publishBlockReason({ eyecatchUrl: "", hasDraftBody: true })).toBe("アイキャッチ未設定");
  });
  it("本文が空は理由を返す", () => {
    expect(publishBlockReason({ eyecatchUrl: "u", hasDraftBody: false })).toBe("本文が空");
  });
  it("両方揃えば null(公開OK)", () => {
    expect(publishBlockReason({ eyecatchUrl: "u", hasDraftBody: true })).toBeNull();
  });
});

describe("partitionPublishQueue", () => {
  it("下書き済みのみ対象に、公開OK/要対応へ振り分ける", () => {
    const items = [
      item({ id: "ok" }),
      item({ id: "noimg", eyecatchUrl: "" }),
      item({ id: "nobody", hasDraftBody: false }),
      item({ id: "proposed", stage: "proposed" }), // 対象外
      item({ id: "published", stage: "published" }), // 対象外
    ];
    const { ready, blocked } = partitionPublishQueue(items);
    expect(ready.map((r) => r.id)).toEqual(["ok"]);
    expect(blocked.map((b) => ({ id: b.item.id, reason: b.reason }))).toEqual([
      { id: "noimg", reason: "アイキャッチ未設定" },
      { id: "nobody", reason: "本文が空" },
    ]);
  });
});

describe("selectDuePublications", () => {
  const now = 1_000_000;
  it("予約時刻が到来した公開OKの下書きだけ選ぶ", () => {
    const items = [
      item({ id: "due", scheduledAtMs: now - 1 }),
      item({ id: "exact", scheduledAtMs: now }),
      item({ id: "future", scheduledAtMs: now + 1 }),
      item({ id: "noresv", scheduledAtMs: null }),
      item({ id: "due-but-blocked", scheduledAtMs: now - 1, eyecatchUrl: "" }),
      item({ id: "due-but-published", stage: "published", scheduledAtMs: now - 1 }),
    ];
    expect(selectDuePublications(items, now).map((i) => i.id)).toEqual(["due", "exact"]);
  });
});

describe("publishQueueItemFromPage", () => {
  it("101件目を含むNotionページを予約公開判定用項目へ変換できる", () => {
    const pages = Array.from({ length: 101 }, (_, index) => ({
      id: `p-${index + 1}`,
      url: "",
      properties: {
        "ステータス": { select: { name: "下書き作成済み" } },
        "下書きID": { rich_text: [{ plain_text: `article-${index + 1}` }] },
        "アイキャッチURL": { rich_text: [{ plain_text: "https://images.microcms-assets.io/x.png" }] },
        "下書き本文HTML": { rich_text: [{ plain_text: "<p>body</p>" }] },
        [PUBLISH_SCHEDULE_PROP]: { date: { start: index === 100 ? "2026-07-01T00:00:00.000Z" : "invalid" } },
      },
    }));
    const items = pages.map(publishQueueItemFromPage);
    expect(selectDuePublications(items, Date.parse("2026-07-02T00:00:00.000Z")).map(({ id }) => id)).toEqual(["p-101"]);
  });

  it("承認＋下書きIDをdrafted、公開済みをpublished、欠落値をotherへ変換する", () => {
    expect(publishQueueItemFromPage({ id: "approved", url: "", properties: {
      "ステータス": { select: { name: "承認" } }, "下書きID": { rich_text: [{ plain_text: "id" }] },
    } }).stage).toBe("drafted");
    expect(publishQueueItemFromPage({ id: "published", url: "", properties: {
      "ステータス": { select: { name: "公開済み" } },
    } }).stage).toBe("published");
    expect(publishQueueItemFromPage({ id: "other", url: "", properties: {
      "アイキャッチURL": { rich_text: [{}] },
    } })).toEqual({
      id: "other", stage: "other", eyecatchUrl: undefined, hasDraftBody: false, scheduledAtMs: null,
    });
  });
});
