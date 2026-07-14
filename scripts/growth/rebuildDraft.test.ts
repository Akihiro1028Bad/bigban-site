import { describe, expect, it } from "vitest";

import {
  buildRebuildSourceClearProps,
  preserveRebuildSourceSlug,
  rebuildSourceIdOf,
  validatedRebuildSourceId,
} from "./rebuildDraft";

describe("rebuildSourceIdOf", () => {
  it("Notionの分割rich_textから再生成元IDを読む", () => {
    expect(
      rebuildSourceIdOf({
        id: "page-1",
        url: "",
        properties: {
          "再生成元下書きID": {
            rich_text: [{ plain_text: "stable-" }, { plain_text: "slug" }],
          },
        },
      })
    ).toBe("stable-slug");
  });

  it("プロパティ欠落は空文字にする", () => {
    expect(rebuildSourceIdOf({ id: "page-1", url: "", properties: {} })).toBe("");
  });

  it("plain_text欠落部分は空文字として読み飛ばす", () => {
    expect(
      rebuildSourceIdOf({
        id: "page-1",
        url: "",
        properties: {
          "再生成元下書きID": {
            rich_text: [{}, { plain_text: "stable-id" }],
          },
        },
      })
    ).toBe("stable-id");
  });
});

describe("validatedRebuildSourceId", () => {
  it("再生成元IDがあれば更新先contentIdとして返す", () => {
    expect(validatedRebuildSourceId("stable-content-id")).toBe("stable-content-id");
  });

  it("再生成元IDが空ならundefinedを返す", () => {
    expect(validatedRebuildSourceId("")).toBeUndefined();
  });

  it("contentIdとして不正な再生成元IDは拒否する", () => {
    expect(() => validatedRebuildSourceId("../other")).toThrow("再生成元下書きID");
  });
});

describe("preserveRebuildSourceSlug", () => {
  it("既存下書きから取得したslugでAI生成slugだけを上書きする", () => {
    expect(
      preserveRebuildSourceSlug(
        { slug: "new-ai-slug", title: "記事" },
        "Pickleball Skill_Roadmap!"
      )
    ).toEqual({ slug: "Pickleball Skill_Roadmap!", title: "記事" });
  });
});

describe("buildRebuildSourceClearProps", () => {
  it("再生成完了後に退避IDを空にする", () => {
    expect(buildRebuildSourceClearProps()).toEqual({
      "再生成元下書きID": { rich_text: [] },
    });
  });
});
