// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  MODEL_CATALOG,
  MODEL_PHASES,
  buildModelSettingProps,
  mergeModelSettings,
  modelPhaseIdForMode,
  modelSettingsSnapshotForModes,
  modelSettingFromPage,
  parseModelSettingInput,
} from "./modelSettings";
import type { NotionPage } from "./notion";

function page(properties: NotionPage["properties"]): NotionPage {
  return { id: "page-1", url: "", properties };
}

describe("工程別AIモデル設定", () => {
  it("記事リサーチと記事執筆を独立させた10工程に品質優先の推奨デフォルトを持つ", () => {
    expect(MODEL_PHASES).toHaveLength(10);
    expect(MODEL_PHASES.find((phase) => phase.id === "weekly")).toMatchObject({
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "xhigh",
    });
    expect(MODEL_PHASES.find((phase) => phase.id === "draft-research")).toMatchObject({
      label: "記事リサーチ",
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "medium",
    });
    expect(MODEL_PHASES.find((phase) => phase.id === "draft-write")).toMatchObject({
      label: "記事執筆",
      provider: "claude",
      model: "claude-opus-5",
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

  it("カタログはClaude Opus 5を選択でき、旧世代のOpus 4.8も残す", () => {
    expect(MODEL_CATALOG.find((item) => item.id === "claude-opus-5")).toMatchObject({
      provider: "claude",
      label: "Claude Opus 5",
    });
    expect(MODEL_CATALOG.find((item) => item.id === "claude-opus-4-8")).toMatchObject({
      provider: "claude",
    });
  });

  it.each(["draft-write", "revise", "advise", "apply", "comment-revise"])(
    "Claude工程 %s の既定はOpus 5 / high",
    (phaseId) => {
      expect(MODEL_PHASES.find((phase) => phase.id === phaseId)).toMatchObject({
        provider: "claude",
        model: "claude-opus-5",
        effort: "high",
      });
    },
  );

  it("既定モデルはカタログとプロバイダー・推論強度の検証を通る", () => {
    for (const phase of MODEL_PHASES) {
      expect(() =>
        parseModelSettingInput({
          phaseId: phase.id,
          provider: phase.provider,
          model: phase.model,
          effort: phase.effort,
        }),
      ).not.toThrow();
    }
  });

  it("autoモードは手動工程と設定を共有する", () => {
    expect(modelPhaseIdForMode("drafts")).toBe("draft-write");
    expect(modelPhaseIdForMode("drafts-auto")).toBe("draft-write");
    expect(modelPhaseIdForMode("draft-research")).toBe("draft-research");
    expect(modelPhaseIdForMode("draft-write")).toBe("draft-write");
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
        phaseId: "draft-write",
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

  it("旧drafts設定をdraft-writeへ引き継ぎ、明示的な新設定を優先する", () => {
    const legacy = {
      phaseId: "drafts" as const,
      provider: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "medium" as const,
    };
    const inherited = mergeModelSettings([legacy]).find((phase) => phase.id === "draft-write");
    expect(inherited).toMatchObject({
      provider: "codex",
      model: "gpt-5.6-sol",
      effort: "medium",
      source: "notion",
    });

    const exact = {
      phaseId: "draft-write" as const,
      provider: "claude" as const,
      model: "claude-opus-4-8",
      effort: "high" as const,
    };
    expect(mergeModelSettings([legacy, exact]).find((phase) => phase.id === "draft-write")).toMatchObject({
      provider: "claude",
      model: "claude-opus-4-8",
      effort: "high",
    });
  });

  it("複数工程の設定を同じ上書き一覧から一度に確定する", () => {
    const snapshot = modelSettingsSnapshotForModes(
      ["draft-research", "draft-write"],
      [
        {
          phaseId: "draft-research",
          provider: "claude",
          model: "claude-sonnet-5",
          effort: "medium",
        },
        {
          phaseId: "draft-write",
          provider: "codex",
          model: "gpt-5.5",
          effort: "high",
        },
      ],
    );

    expect(snapshot["draft-research"]).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-5",
      source: "notion",
    });
    expect(snapshot["draft-write"]).toMatchObject({
      provider: "codex",
      model: "gpt-5.5",
      source: "notion",
    });
  });

  it("未知の実行モードを拒否する", () => {
    expect(() => modelSettingsSnapshotForModes(["unknown"], [])).toThrow(
      "未知の実行モードです: unknown",
    );
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
