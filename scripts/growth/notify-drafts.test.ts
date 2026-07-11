// @vitest-environment node
import { describe, expect, it } from "vitest";

import { endpointForNotifyItem, parseItems } from "./notify-drafts";

describe("parseItems", () => {
  it("media を保持して通知 item を読む", () => {
    expect(
      parseItems({
        items: [{ title: "告知", contentId: "n-1", media: "ニュース" }],
      })
    ).toEqual([{ title: "告知", contentId: "n-1", media: "ニュース" }]);
  });
});

describe("endpointForNotifyItem", () => {
  it("media=ニュース は env=columns でも news", () => {
    expect(
      endpointForNotifyItem(
        { title: "告知", contentId: "n-1", media: "ニュース" },
        { GROWTH_MICROCMS_ENDPOINT: "columns" }
      )
    ).toBe("news");
  });

  it("media=コラム は env の columns", () => {
    expect(
      endpointForNotifyItem(
        { title: "コラム", contentId: "c-1", media: "コラム" },
        { GROWTH_MICROCMS_ENDPOINT: "columns" }
      )
    ).toBe("columns");
  });

  it("media 欠落は従来通り column 扱い", () => {
    expect(
      endpointForNotifyItem(
        { title: "旧payload", contentId: "c-1" },
        { GROWTH_MICROCMS_ENDPOINT: "columns" }
      )
    ).toBe("columns");
  });
});
