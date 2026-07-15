import { describe, expect, it } from "vitest";

import {
  countDraftsAutoTargets,
  draftsAutoQueryFilter,
  isDraftsAutoTarget,
  selectDraftsAutoTarget,
} from "./draftsAuto";
import type { NotionPage } from "./notion";

function page(
  status: string,
  draftId = "",
  outline = "## 見出し\n### 詳細",
  title = "承認済みタイトル",
): NotionPage {
  return {
    id: `${status}-${draftId || "empty"}`,
    url: "",
    properties: {
      "ステータス": { select: { name: status } },
      "下書きID": { rich_text: draftId ? [{ plain_text: draftId }] : [] },
      "構成案": { rich_text: outline ? [{ plain_text: outline }] : [] },
      "タイトル案": { title: title ? [{ plain_text: title }] : [] },
    },
  };
}

describe("draftsAuto", () => {
  it("承認か生成中で、下書きIDが空の行だけ対象にする", () => {
    expect(isDraftsAutoTarget(page("承認"))).toBe(true);
    expect(isDraftsAutoTarget(page("生成中"))).toBe(true);
    expect(isDraftsAutoTarget(page("承認", "content-id"))).toBe(false);
    expect(isDraftsAutoTarget(page("提案中"))).toBe(false);
    expect(isDraftsAutoTarget(page("下書き作成済み", "content-id"))).toBe(false);
  });

  it("ステータスや下書きIDプロパティが欠落していても安全に判定する", () => {
    expect(
      isDraftsAutoTarget({
        id: "missing-status",
        url: "",
        properties: {
          "下書きID": { rich_text: [] },
        },
      })
    ).toBe(false);
    expect(
      isDraftsAutoTarget({
        id: "missing-draft-id",
        url: "",
        properties: {
          "ステータス": { select: { name: "承認" } },
        },
      })
    ).toBe(true);
    expect(
      isDraftsAutoTarget({
        id: "missing-plain-text",
        url: "",
        properties: {
          "ステータス": { select: { name: "承認" } },
          "下書きID": { rich_text: [{ plain_text: undefined }] },
        },
      })
    ).toBe(true);
  });

  it("select が null でも対象外にする", () => {
    expect(
      isDraftsAutoTarget({
        id: "null-select",
        url: "",
        properties: {
          "ステータス": { select: null },
          "下書きID": { rich_text: [] },
        },
      })
    ).toBe(false);
  });

  it("対象件数を数える", () => {
    expect(
      countDraftsAutoTargets([
        page("承認"),
        page("生成中"),
        page("承認", "content-id"),
        page("提案中"),
      ])
    ).toBe(2);
  });

  it("1セッション用の対象は生成中を優先し、無ければ承認の先頭1件だけを返す", () => {
    const approved = page("承認");
    const generating = page("生成中");
    expect(selectDraftsAutoTarget([approved, generating])).toBe(generating);
    expect(selectDraftsAutoTarget([approved, page("提案中")])).toBe(approved);
    expect(selectDraftsAutoTarget([page("提案中")])).toBeNull();
  });

  it("構成案にH2/H3がない生成中は除外し、後続の承認済み記事を返す", () => {
    const invalidGenerating = page("生成中", "", "説明だけ");
    const approved = page("承認");

    expect(selectDraftsAutoTarget([invalidGenerating, approved])).toBe(approved);
    expect(countDraftsAutoTargets([invalidGenerating, approved])).toBe(1);
    expect(selectDraftsAutoTarget([invalidGenerating])).toBeNull();
  });

  it("タイトルがない生成中は除外し、後続の承認済み記事を返す", () => {
    const invalidGenerating = page("生成中", "", "## 見出し", "");
    const approved = page("承認");

    expect(selectDraftsAutoTarget([invalidGenerating, approved])).toBe(approved);
    expect(countDraftsAutoTargets([invalidGenerating, approved])).toBe(1);
    expect(selectDraftsAutoTarget([invalidGenerating])).toBeNull();
  });

  it("Notion query 用の軽量 filter を返す", () => {
    expect(draftsAutoQueryFilter()).toEqual({
      and: [
        {
          or: [
            { property: "ステータス", select: { equals: "承認" } },
            { property: "ステータス", select: { equals: "生成中" } },
          ],
        },
        { property: "下書きID", rich_text: { is_empty: true } },
      ],
    });
  });
});
