import "dotenv/config";

import {
  MODEL_PHASES,
  MODEL_SETTINGS_DS,
  mergeModelSettings,
  modelPhaseIdForMode,
  modelSettingFromPage,
} from "../../src/lib/growth/modelSettings";
import type { ModelPhaseSetting } from "../../src/lib/growth/modelSettings";
import { defaultFetch } from "./http";
import { queryDataSource } from "./notion";

function defaultForMode(mode: string): ModelPhaseSetting {
  const phaseId = modelPhaseIdForMode(mode);
  const phase = MODEL_PHASES.find((item) => item.id === phaseId);
  if (!phase) throw new Error(`未知の実行モードです: ${mode}`);
  return { ...phase, phaseId: phase.id, source: "default" };
}

async function resolveForMode(mode: string): Promise<ModelPhaseSetting> {
  const fallback = defaultForMode(mode);
  if (process.env.GROWTH_MODEL_SETTINGS_DISABLE === "1") return fallback;

  const token = process.env.NOTION_TOKEN;
  if (!token) return fallback;

  try {
    const result = await queryDataSource(
      process.env.GROWTH_MODEL_SETTINGS_DS || MODEL_SETTINGS_DS,
      { pageSize: 50 },
      { token, fetchFn: defaultFetch },
    );
    const overrides = result.pages
      .map(modelSettingFromPage)
      .filter((setting) => setting !== null);
    return mergeModelSettings(overrides).find((item) => item.id === fallback.id) ?? fallback;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[model-settings] Notion設定を取得できないため既定値を使用: ${message}\n`);
    return fallback;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const mode = process.argv[3];
  if (command !== "resolve" || !mode) {
    throw new Error("使い方: model-settings-cli resolve <mode>");
  }
  process.stdout.write(`${JSON.stringify(await resolveForMode(mode))}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[growth:model-settings] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
