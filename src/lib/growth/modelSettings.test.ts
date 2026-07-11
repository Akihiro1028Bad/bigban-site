// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  MODEL_PHASES,
  buildModelSettingProps,
  mergeModelSettings,
  modelPhaseIdForMode,
  modelSettingFromPage,
  parseModelSettingInput,
} from "./modelSettings";
import type { NotionPage } from "./notion";

function page(properties: NotionPage["properties"]): NotionPage {
  return { id: "page-1", url: "", properties };
}

describe("工程別AIモデル設定", () => {
  it("画像プロンプト設計を独立させた9工程に品質優先の推奨デフォルトを持つ", () => {
    expect(MODEL_PHASES).toHaveLength(9);
    expect(MODEL_PHASES.find((phase) => phase.id === "weekly")).toMatchObject({
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "xhigh",
    });
    expect(MODEL_PHASES.find((phase) => phase.id === "drafts")).toMatchObject({
      provider: "claude",
      model: "claude-opus-4-8",
      effort: "high",
    });
    expect(MODEL_PHASES.find((phase) => phase.id === "initiatives")).toMatchObject({
      provider: "codex",
      model: "gpt-5.5",
      effort: "high",
    });
    expect(MODEL_PHASES.find((phase) => phase.id === "image-prompt")).toMatchObject({
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "high",
      modes: ["image-prompt", "regen", "regen-body"],
    });
  });

  it("autoモードは手動工程と設定を共有する", () => {
    expect(modelPhaseIdForMode("drafts-auto")).toBe("drafts");
    expect(modelPhaseIdForMode("initiatives-auto")).toBe("initiatives");
    expect(modelPhaseIdForMode("image-prompt")).toBe("image-prompt");
    expect(modelPhaseIdForMode("regen")).toBe("image-prompt");
    expect(modelPhaseIdForMode("regen-body")).toBe("image-prompt");
    expect(modelPhaseIdForMode("unknown")).toBeNull();
  });

  it("プロバイダーとモデルの組み合わせ、推論強度を検証する", () => {
    expect(
      parseModelSettingInput({
        phaseId: "decorate",
        provider: "codex",
        model: "gpt-5.5",
        effort: "medium",
      }),
    ).toEqual({
      phaseId: "decorate",
      provider: "codex",
      model: "gpt-5.5",
      effort: "medium",
    });

    expect(() =>
      parseModelSettingInput({
        phaseId: "decorate",
        provider: "codex",
        model: "claude-opus-4-8",
        effort: "medium",
      }),
    ).toThrow(/モデル/);
    expect(() =>
      parseModelSettingInput({
        phaseId: "drafts",
        provider: "claude",
        model: "claude-opus-4-8",
        effort: "minimal",
      }),
    ).toThrow(/推論強度/);
  });

  it("Notion行を有効な工程設定として復元し、既定値へ上書きする", () => {
    const override = modelSettingFromPage(
      page({
        "工程ID": { title: [{ plain_text: "advise" }] },
        "工程名": { rich_text: [{ plain_text: "記事アドバイス" }] },
        "プロバイダー": { select: { name: "codex" } },
        "モデル": { rich_text: [{ plain_text: "gpt-5.5" }] },
        "推論強度": { select: { name: "high" } },
      }),
    );

    expect(override).toEqual({
      phaseId: "advise",
      provider: "codex",
      model: "gpt-5.5",
      effort: "high",
    });
    expect(mergeModelSettings([override!]).find((phase) => phase.id === "advise")).toMatchObject({
      provider: "codex",
      model: "gpt-5.5",
      effort: "high",
      source: "notion",
    });
  });

  it("未知工程や不正なNotion行は無視する", () => {
    expect(
      modelSettingFromPage(
        page({
          "工程ID": { title: [{ plain_text: "unknown" }] },
          "プロバイダー": { select: { name: "codex" } },
          "モデル": { rich_text: [{ plain_text: "gpt-5.5" }] },
          "推論強度": { select: { name: "high" } },
        }),
      ),
    ).toBeNull();

    const invalidProperties: NotionPage["properties"][] = [
      {},
      { "工程ID": { title: "bad" } },
      { "工程ID": { title: [null] } },
      { "工程ID": { title: [{ plain_text: 1 }] } },
      { "プロバイダー": null },
      { "プロバイダー": { select: null } },
      { "プロバイダー": { select: { name: 1 } } },
    ];
    for (const properties of invalidProperties) {
      expect(modelSettingFromPage(page(properties))).toBeNull();
    }
  });

  it("Notion保存用プロパティを組み立てる", () => {
    expect(
      buildModelSettingProps({
        phaseId: "image-prompt",
        provider: "codex",
        model: "gpt-5.6-sol",
        effort: "high",
      }),
    ).toEqual({
      "工程ID": { title: [{ text: { content: "image-prompt" } }] },
      "工程名": { rich_text: [{ text: { content: "画像プロンプト設計" } }] },
      "プロバイダー": { select: { name: "codex" } },
      "モデル": { rich_text: [{ text: { content: "gpt-5.6-sol" } }] },
      "推論強度": { select: { name: "high" } },
    });

    expect(() =>
      buildModelSettingProps({
        phaseId: "unknown" as never,
        provider: "codex",
        model: "gpt-5.5",
        effort: "high",
      }),
    ).toThrow("未知の工程です。");
  });
});
