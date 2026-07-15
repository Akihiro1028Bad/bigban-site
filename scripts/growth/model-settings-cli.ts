import "dotenv/config";

import {
  MODEL_SETTINGS_DS,
  modelSettingsSnapshotForModes,
  modelSettingFromPage,
} from "../../src/lib/growth/modelSettings";
import type { ModelPhaseSetting, ModelSettingInput } from "../../src/lib/growth/modelSettings";
import { defaultFetch } from "./http";
import { queryDataSource } from "./notion";

async function resolveForModes(modes: readonly string[]): Promise<Record<string, ModelPhaseSetting>> {
  const fallback = modelSettingsSnapshotForModes(modes, []);
  if (process.env.GROWTH_MODEL_SETTINGS_DISABLE === "1") return fallback;

  const token = process.env.NOTION_TOKEN;
  if (!token) return fallback;

  try {
    const result = await queryDataSource(
      process.env.GROWTH_MODEL_SETTINGS_DS || MODEL_SETTINGS_DS,
      { pageSize: 50 },
      { token, fetchFn: defaultFetch },
    );
    const overrides: ModelSettingInput[] = result.pages
      .map(modelSettingFromPage)
      .filter((setting): setting is ModelSettingInput => setting !== null);
    return modelSettingsSnapshotForModes(modes, overrides);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[model-settings] Notion設定を取得できないため既定値を使用: ${message}\n`);
    return fallback;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const modes = process.argv.slice(3);
  if (!modes.length || (command !== "resolve" && command !== "resolve-many")) {
    throw new Error("使い方: model-settings-cli <resolve|resolve-many> <mode...>");
  }
  const snapshot = await resolveForModes(modes);
  process.stdout.write(`${JSON.stringify(command === "resolve" ? snapshot[modes[0]] : snapshot)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[growth:model-settings] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
