import {
  MODEL_CATALOG,
  PROVIDER_EFFORTS,
  type ModelEffort,
  type ModelProvider,
} from "../../src/lib/growth/modelSettings";

export type DraftAiPhase = "draft-research" | "draft-write";

export interface DraftPhaseSetting {
  provider: ModelProvider;
  model: string;
  effort: ModelEffort;
}

interface InvocationParams {
  phase: DraftAiPhase;
  setting: DraftPhaseSetting;
  cwd: string;
  schemaPath: string;
  schemaJson?: string;
  outputPath: string;
}

export interface DraftAgentInvocation {
  command: "claude" | "codex";
  args: string[];
  isolatedCwd: string;
  outputPath: string;
  outputFromStdout: boolean;
}

export function draftPhaseExecutionLabel(
  phase: DraftAiPhase,
  setting: DraftPhaseSetting,
): string {
  return `${phase}: ${setting.provider} / ${setting.model} / ${setting.effort}`;
}

function valid(setting: DraftPhaseSetting): DraftPhaseSetting {
  const model = MODEL_CATALOG.find((item) => item.id === setting.model);
  if (!model || model.provider !== setting.provider) {
    throw new Error(`モデルとプロバイダーの組み合わせが不正です: ${setting.provider}/${setting.model}`);
  }
  if (!PROVIDER_EFFORTS[setting.provider].includes(setting.effort)) {
    throw new Error(`推論強度が不正です: ${setting.provider}/${setting.effort}`);
  }
  return setting;
}

export function resolveDraftPhaseSetting(
  shared: DraftPhaseSetting,
): DraftPhaseSetting {
  return valid(shared);
}

export function buildDraftAgentInvocation(params: InvocationParams): DraftAgentInvocation {
  const { phase, setting, cwd, schemaPath, outputPath } = params;
  if (setting.provider === "claude") {
    const tools = phase === "draft-research" ? "WebSearch,WebFetch" : "";
    return {
      command: "claude",
      args: [
        "-p",
        "--safe-mode",
        "--no-session-persistence",
        "--tools",
        tools,
        ...(phase === "draft-research" ? ["--allowedTools", tools] : []),
        "--model",
        setting.model,
        "--effort",
        setting.effort,
        "--json-schema",
        params.schemaJson ?? '{"type":"object"}',
      ],
      isolatedCwd: cwd,
      outputPath,
      outputFromStdout: true,
    };
  }
  const disabledFeatures = [
    "shell_tool",
    "unified_exec",
    "unified_exec_zsh_fork",
    "multi_agent",
    "apps",
    "computer_use",
    "image_generation",
    ...(phase === "draft-write"
      ? ["browser_use", "browser_use_external", "in_app_browser", "standalone_web_search"]
      : []),
  ];
  return {
    command: "codex",
    args: [
      "exec",
      ...disabledFeatures.flatMap((feature) => ["--disable", feature]),
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "--ignore-rules",
      "-C",
      cwd,
      "--model",
      setting.model,
      "-c",
      `model_reasoning_effort="${setting.effort}"`,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-",
    ],
    isolatedCwd: cwd,
    outputPath,
    outputFromStdout: false,
  };
}
