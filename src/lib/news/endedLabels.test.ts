import { describe, expect, it } from "vitest";

import { getEndedLabels } from "./endedLabels";

describe("getEndedLabels", () => {
  it("日本語", () => {
    const labels = getEndedLabels("ja");
    expect(labels.badge).toBe("終了");
    expect(labels.message).toBe(
      "このイベントは終了しました。最新の開催情報は",
    );
    expect(labels.newsLabel).toBe("ニュース一覧");
    expect(labels.reserveLabel).toBe("予約ページ");
    expect(labels.newsHref).toBe("/news");
    expect(labels.reserveHref).toBe("/reserve");
  });

  it("英語はロケール接頭辞つきの行き先", () => {
    const labels = getEndedLabels("en");
    expect(labels.badge).toBe("Ended");
    expect(labels.newsHref).toBe("/en/news");
    expect(labels.reserveHref).toBe("/en/reserve");
  });
});
