// @vitest-environment node
import { describe, expect, it } from "vitest";

import { applyImagePromptProposal } from "./imagePromptSpec";

const draft = {
  media: "コラム",
  payload: { title: "初心者向け記事", bodyHtml: "<p>本文</p>{{IMG:1}}" },
  eyecatchAction: "",
  images: [{ index: 1, style: "auto", description: "初心者向けの画像" }],
  notion: { pageId: "page-1", property: "ステータス", value: "下書き作成済み" },
};

describe("画像プロンプト提案の安全な反映", () => {
  it("画像関連フィールドだけを置き換え、本文やNotion情報を維持する", () => {
    const result = applyImagePromptProposal(draft, {
      eyecatchAction: "happily practicing a pickleball serve",
      images: [
        {
          index: 1,
          style: "mascot",
          description: "宇宙人が初めてのサーブを練習する様子",
        },
      ],
    });

    expect(result).toEqual({
      ...draft,
      eyecatchAction: "happily practicing a pickleball serve",
      images: [
        {
          index: 1,
          style: "mascot",
          description: "宇宙人が初めてのサーブを練習する様子",
        },
      ],
    });
    expect(result.payload).toBe(draft.payload);
    expect(result.notion).toBe(draft.notion);
  });

  it("元の本文画像indexを追加・削除・変更する提案を拒否する", () => {
    expect(() =>
      applyImagePromptProposal(draft, {
        eyecatchAction: "playing pickleball",
        images: [],
      }),
    ).toThrow(/index/);
    expect(() =>
      applyImagePromptProposal(draft, {
        eyecatchAction: "playing pickleball",
        images: [{ index: 2, style: "illust", description: "別の画像" }],
      }),
    ).toThrow(/index/);
  });

  it("auto・未知スタイル・空のactionを最終提案として拒否する", () => {
    expect(() =>
      applyImagePromptProposal(draft, {
        eyecatchAction: "",
        images: [{ index: 1, style: "auto", description: "画像" }],
      }),
    ).toThrow();
  });

  it("本文画像がない記事は空配列の提案を受理する", () => {
    const withoutImages = { ...draft, images: undefined };
    expect(
      applyImagePromptProposal(withoutImages, {
        eyecatchAction: "holding a glowing pickleball paddle",
        images: [],
      }),
    ).toMatchObject({
      eyecatchAction: "holding a glowing pickleball paddle",
      images: [],
    });
  });
});
