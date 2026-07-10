import { z } from "zod";

import { chunkRichText } from "./notion";
import type { NotionPage } from "./notion";

export const MODEL_SETTING_PROPS = {
  phaseId: "工程ID",
  phaseName: "工程名",
  provider: "プロバイダー",
  model: "モデル",
  effort: "推論強度",
} as const;

export const MODEL_SETTINGS_DS = "d6b79283-f892-4d75-b998-332ccb6dc22e";

export const MODEL_PHASE_IDS = [
  "weekly",
  "drafts",
  "initiatives",
  "revise",
  "regen",
  "regen-body",
  "advise",
  "decorate",
  "apply",
  "comment-revise",
] as const;

export type ModelPhaseId = (typeof MODEL_PHASE_IDS)[number];
export type ModelProvider = "codex" | "claude";
export type ModelEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelCatalogItem {
  id: string;
  provider: ModelProvider;
  label: string;
  note: string;
}

export const MODEL_CATALOG: readonly ModelCatalogItem[] = [
  {
    id: "gpt-5.6-sol",
    provider: "codex",
    label: "GPT-5.6 Sol",
    note: "限定プレビュー。最重要の週次分析向け。",
  },
  {
    id: "gpt-5.5",
    provider: "codex",
    label: "GPT-5.5",
    note: "複雑な推論・コーディング・構造化出力向け。",
  },
  {
    id: "gpt-5.4",
    provider: "codex",
    label: "GPT-5.4",
    note: "品質と速度のバランスを取る汎用モデル。",
  },
  {
    id: "gpt-5.4-mini",
    provider: "codex",
    label: "GPT-5.4 mini",
    note: "短い定型処理を高速に回す場合の候補。",
  },
  {
    id: "claude-fable-5",
    provider: "claude",
    label: "Claude Fable 5",
    note: "最も要求の高い長時間推論・エージェント処理向け。",
  },
  {
    id: "claude-opus-4-8",
    provider: "claude",
    label: "Claude Opus 4.8",
    note: "文章品質、編集判断、長い文脈の維持に強い。",
  },
  {
    id: "claude-sonnet-5",
    provider: "claude",
    label: "Claude Sonnet 5",
    note: "速度と知能のバランスがよい実行モデル。",
  },
  {
    id: "claude-haiku-4-5",
    provider: "claude",
    label: "Claude Haiku 4.5",
    note: "高頻度の単純処理向け。",
  },
] as const;

export const PROVIDER_EFFORTS: Readonly<Record<ModelProvider, readonly ModelEffort[]>> = {
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  claude: ["low", "medium", "high", "xhigh", "max"],
};

export interface ModelSettingInput {
  phaseId: ModelPhaseId;
  provider: ModelProvider;
  model: string;
  effort: ModelEffort;
}

export interface ModelPhaseSetting extends ModelSettingInput {
  id: ModelPhaseId;
  label: string;
  description: string;
  modes: readonly string[];
  source: "default" | "notion";
}

interface ModelPhaseDefault {
  id: ModelPhaseId;
  label: string;
  description: string;
  modes: readonly string[];
  provider: ModelProvider;
  model: string;
  effort: ModelEffort;
}

export const MODEL_PHASES: readonly ModelPhaseDefault[] = [
  {
    id: "weekly",
    label: "週次分析・提案",
    description: "GA4・GSC・学習ログから予約ファネルを分析し、施策と記事案を選ぶ。",
    modes: ["weekly"],
    provider: "codex",
    model: "gpt-5.6-sol",
    effort: "xhigh",
  },
  {
    id: "drafts",
    label: "記事下書き生成",
    description: "承認済み構成案から本文・画像を含むmicroCMS下書きを作る。",
    modes: ["drafts", "drafts-auto"],
    provider: "claude",
    model: "claude-opus-4-8",
    effort: "high",
  },
  {
    id: "initiatives",
    label: "施策成果物化",
    description: "承認済み施策を実装タスク、文案、イベント準備案へ変換する。",
    modes: ["initiatives", "initiatives-auto"],
    provider: "codex",
    model: "gpt-5.5",
    effort: "high",
  },
  {
    id: "revise",
    label: "構成案・タイトル修正",
    description: "行コメントやタイトル指示を読み、元案と比較できる修正案を作る。",
    modes: ["revise"],
    provider: "claude",
    model: "claude-opus-4-8",
    effort: "high",
  },
  {
    id: "regen",
    label: "アイキャッチ再生成",
    description: "再生成指示を画像生成用の具体的な指示へ翻案して実行する。",
    modes: ["regen"],
    provider: "claude",
    model: "claude-sonnet-5",
    effort: "medium",
  },
  {
    id: "regen-body",
    label: "本文画像再生成",
    description: "対象画像と記事文脈から本文画像の再生成指示を組み立てる。",
    modes: ["regen-body"],
    provider: "claude",
    model: "claude-sonnet-5",
    effort: "medium",
  },
  {
    id: "advise",
    label: "記事アドバイス",
    description: "文体・構成・根拠・CTAを読み、編集者視点の改善案を出す。",
    modes: ["advise"],
    provider: "claude",
    model: "claude-opus-4-8",
    effort: "high",
  },
  {
    id: "decorate",
    label: "装飾提案",
    description: "本文ブロックを解析し、安全な装飾メタデータをJSONで提案する。",
    modes: ["decorate"],
    provider: "codex",
    model: "gpt-5.5",
    effort: "medium",
  },
  {
    id: "apply",
    label: "アドバイス反映",
    description: "採用された改善案に対応する本文箇所だけを書き換える。",
    modes: ["apply"],
    provider: "claude",
    model: "claude-opus-4-8",
    effort: "high",
  },
  {
    id: "comment-revise",
    label: "インラインコメント修正",
    description: "本文コメントを受け、対象ブロックだけを文脈に沿って修正する。",
    modes: ["comment-revise"],
    provider: "claude",
    model: "claude-opus-4-8",
    effort: "high",
  },
] as const;

const inputSchema = z.object({
  phaseId: z.enum(MODEL_PHASE_IDS),
  provider: z.enum(["codex", "claude"]),
  model: z.string().trim().min(1, "モデルを選択してください。"),
  effort: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]),
});

export function modelPhaseIdForMode(mode: string): ModelPhaseId | null {
  return MODEL_PHASES.find((phase) => phase.modes.includes(mode))?.id ?? null;
}

export function parseModelSettingInput(value: unknown): ModelSettingInput {
  const parsed = inputSchema.parse(value);
  const model = MODEL_CATALOG.find((item) => item.id === parsed.model);
  if (!model || model.provider !== parsed.provider) {
    throw new Error("プロバイダーで利用できるモデルを選択してください。");
  }
  if (!PROVIDER_EFFORTS[parsed.provider].includes(parsed.effort)) {
    throw new Error("プロバイダーで利用できる推論強度を選択してください。");
  }
  return parsed;
}

function textItems(property: unknown, key: "title" | "rich_text"): string {
  if (!property || typeof property !== "object" || !(key in property)) return "";
  const value = (property as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const plainText = (item as Record<string, unknown>).plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("")
    .trim();
}

function selectName(property: unknown): string {
  if (!property || typeof property !== "object") return "";
  const select = (property as Record<string, unknown>).select;
  if (!select || typeof select !== "object") return "";
  const name = (select as Record<string, unknown>).name;
  return typeof name === "string" ? name.trim() : "";
}

export function modelSettingFromPage(page: NotionPage): ModelSettingInput | null {
  try {
    return parseModelSettingInput({
      phaseId: textItems(page.properties[MODEL_SETTING_PROPS.phaseId], "title"),
      provider: selectName(page.properties[MODEL_SETTING_PROPS.provider]),
      model: textItems(page.properties[MODEL_SETTING_PROPS.model], "rich_text"),
      effort: selectName(page.properties[MODEL_SETTING_PROPS.effort]),
    });
  } catch {
    return null;
  }
}

export function mergeModelSettings(overrides: readonly ModelSettingInput[]): ModelPhaseSetting[] {
  const byId = new Map(overrides.map((setting) => [setting.phaseId, setting]));
  return MODEL_PHASES.map((phase) => {
    const override = byId.get(phase.id);
    return {
      ...phase,
      phaseId: phase.id,
      provider: override?.provider ?? phase.provider,
      model: override?.model ?? phase.model,
      effort: override?.effort ?? phase.effort,
      source: override ? "notion" : "default",
    };
  });
}

export function buildModelSettingProps(input: ModelSettingInput): Record<string, unknown> {
  const phase = MODEL_PHASES.find((item) => item.id === input.phaseId);
  if (!phase) throw new Error("未知の工程です。");
  return {
    [MODEL_SETTING_PROPS.phaseId]: { title: chunkRichText(input.phaseId) },
    [MODEL_SETTING_PROPS.phaseName]: { rich_text: chunkRichText(phase.label) },
    [MODEL_SETTING_PROPS.provider]: { select: { name: input.provider } },
    [MODEL_SETTING_PROPS.model]: { rich_text: chunkRichText(input.model) },
    [MODEL_SETTING_PROPS.effort]: { select: { name: input.effort } },
  };
}
