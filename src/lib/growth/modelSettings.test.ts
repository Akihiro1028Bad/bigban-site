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
  it("10工程に品質優先の推奨デフォルトを持つ", () => {
    expect(MODEL_PHASES).toHaveLength(10);
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
  });

  it("autoモードは手動工程と設定を共有する", () => {
    expect(modelPhaseIdForMode("drafts-auto")).toBe("drafts");
    expect(modelPhaseIdForMode("initiatives-auto")).toBe("initiatives");
    expect(modelPhaseIdForMode("regen-body")).toBe("regen-body");
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
  });

  it("Notion保存用プロパティを組み立てる", () => {
    expect(
      buildModelSettingProps({
        phaseId: "regen",
        provider: "claude",
        model: "claude-sonnet-5",
        effort: "medium",
      }),
    ).toEqual({
      "工程ID": { title: [{ text: { content: "regen" } }] },
      "工程名": { rich_text: [{ text: { content: "アイキャッチ再生成" } }] },
      "プロバイダー": { select: { name: "claude" } },
      "モデル": { rich_text: [{ text: { content: "claude-sonnet-5" } }] },
      "推論強度": { select: { name: "medium" } },
    });
  });
});
