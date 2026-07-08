import { describe, expect, it } from "vitest";

import { deriveArticleStage, deriveProposalStage, isArticleStageEditable } from "./stage";

describe("deriveArticleStage", () => {
  it("提案中 → proposed", () => {
    expect(deriveArticleStage("提案中", false)).toBe("proposed");
  });

  it("承認 かつ 下書きID無し → queued(生成待ち)", () => {
    expect(deriveArticleStage("承認", false)).toBe("queued");
  });

  it("承認 かつ 下書きID有り → drafted", () => {
    expect(deriveArticleStage("承認", true)).toBe("drafted");
  });

  it("生成中 → generating", () => {
    expect(deriveArticleStage("生成中", false)).toBe("generating");
  });

  it("下書き作成済み → drafted", () => {
    expect(deriveArticleStage("下書き作成済み", true)).toBe("drafted");
  });

  it("公開済み → published (#167)", () => {
    expect(deriveArticleStage("公開済み", true)).toBe("published");
  });

  it("却下 → rejected", () => {
    expect(deriveArticleStage("却下", false)).toBe("rejected");
  });

  it("未知ステータスは proposed に倒す", () => {
    expect(deriveArticleStage("", false)).toBe("proposed");
    expect(deriveArticleStage("謎", false)).toBe("proposed");
  });
});

describe("deriveProposalStage", () => {
  it("未処理 → untouched", () => {
    expect(deriveProposalStage("未処理")).toBe("untouched");
  });

  it("承認 → approved", () => {
    expect(deriveProposalStage("承認")).toBe("approved");
  });

  it("却下 → rejected", () => {
    expect(deriveProposalStage("却下")).toBe("rejected");
  });

  it("成果物化済 → completed", () => {
    expect(deriveProposalStage("成果物化済")).toBe("completed");
  });

  it("未知ステータスは untouched に倒す", () => {
    expect(deriveProposalStage("謎")).toBe("untouched");
  });
});

describe("isArticleStageEditable (#H9)", () => {
  it("生成中・公開済みは編集/AI依頼不可", () => {
    expect(isArticleStageEditable("generating")).toBe(false);
    expect(isArticleStageEditable("published")).toBe(false);
  });

  it("提案中/生成待ち/下書き/却下は編集可", () => {
    for (const stage of ["proposed", "queued", "drafted", "rejected"] as const) {
      expect(isArticleStageEditable(stage)).toBe(true);
    }
  });
});
