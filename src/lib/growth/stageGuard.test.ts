// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import { articleEditGuard } from "./stageGuard";

function pageWithStatus(name: string, contentId = ""): NotionPage {
  return {
    id: "i1",
    url: "",
    properties: {
      "ステータス": { type: "select", select: { name } },
      ...(contentId
        ? { "下書きID": { type: "rich_text", rich_text: [{ plain_text: contentId }] } }
        : {}),
    },
  };
}

describe("articleEditGuard (#H9)", () => {
  it("生成中は 409 を返す", async () => {
    const res = articleEditGuard(pageWithStatus("生成中"));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(409);
    const json = (await res?.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("生成中");
  });

  it("公開済みは 409 を返す", async () => {
    const res = articleEditGuard(pageWithStatus("公開済み", "g-1"));
    expect(res?.status).toBe(409);
    const json = (await res?.json()) as { error: string };
    expect(json.error).toContain("公開済み");
  });

  it("提案中・下書き作成済みは null(編集可)", () => {
    expect(articleEditGuard(pageWithStatus("提案中"))).toBeNull();
    expect(articleEditGuard(pageWithStatus("下書き作成済み", "g-1"))).toBeNull();
  });
});
