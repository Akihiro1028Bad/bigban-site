// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildNoticeFlex } from "./notice-flex";

const URL = "https://example.com/growth/approve";

describe("buildNoticeFlex", () => {
  it("見出し・タイトル・補足行・承認ボタンを持つバブルを返す", () => {
    const bubble = buildNoticeFlex({
      heading: "🎨 完了しました",
      title: "猛暑の記事",
      lines: ["承認画面で確認してください。"],
      approveUrl: URL,
    });
    expect(bubble.type).toBe("bubble");
    // header = 見出し
    expect(bubble.header?.contents[0]).toMatchObject({ type: "text", text: "🎨 完了しました", weight: "bold" });
    // body 先頭 = タイトル(bold)
    expect(bubble.body?.contents[0]).toMatchObject({ type: "text", text: "猛暑の記事", weight: "bold" });
    // body に補足行
    expect(bubble.body?.contents).toContainEqual(
      expect.objectContaining({ type: "text", text: "承認画面で確認してください。" })
    );
    // footer = 承認画面 URI ボタン(既定ラベル)
    expect(bubble.footer?.contents[0]).toMatchObject({
      type: "button",
      action: { type: "uri", label: "承認画面で確認", uri: URL },
    });
  });

  it("lines 省略・空行は本文に出さない(タイトルのみ)", () => {
    const bubble = buildNoticeFlex({ heading: "H", title: "T", lines: ["", "  "], approveUrl: URL });
    expect(bubble.body?.contents).toHaveLength(1); // タイトルのみ
  });

  it("buttonLabel を上書きできる", () => {
    const bubble = buildNoticeFlex({ heading: "H", title: "T", approveUrl: URL, buttonLabel: "開く" });
    expect(bubble.footer?.contents[0]).toMatchObject({ action: { label: "開く" } });
  });
});
