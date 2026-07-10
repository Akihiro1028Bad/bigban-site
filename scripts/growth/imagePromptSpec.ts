import { z } from "zod";

const bodyImageStyleSchema = z.enum([
  "mascot",
  "illust",
  "court",
  "flow",
  "infographic",
]);

const proposalSchema = z.object({
  eyecatchAction: z.string().trim().min(1).max(1000),
  images: z
    .array(
      z.object({
        index: z.number().int().min(1),
        style: bodyImageStyleSchema,
        description: z.string().trim().min(1).max(1000),
        textSpec: z.string().trim().max(1000).optional(),
      }),
    )
    .max(3),
});

interface DraftSpecRecord extends Record<string, unknown> {
  images?: unknown;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} はオブジェクトで指定してください。`);
  }
  return value as Record<string, unknown>;
}

function imageIndices(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("元specの images は配列で指定してください。");
  return value.map((item) => {
    const image = record(item, "元specの画像");
    const index = image.index;
    if (!Number.isInteger(index) || Number(index) < 1) {
      throw new Error("元specの画像 index が不正です。");
    }
    return Number(index);
  });
}

/**
 * 画像設計AIの提案から画像関連フィールドだけを反映する。
 * 本文・Notion更新先・根拠台帳などは元specの参照をそのまま維持する。
 */
export function applyImagePromptProposal(
  draftValue: unknown,
  proposalValue: unknown,
): DraftSpecRecord {
  const draft = record(draftValue, "下書きspec") as DraftSpecRecord;
  const proposal = proposalSchema.parse(proposalValue);
  const before = imageIndices(draft.images).sort((a, b) => a - b);
  const after = proposal.images.map((image) => image.index).sort((a, b) => a - b);
  if (before.length !== after.length || before.some((index, i) => index !== after[i])) {
    throw new Error("本文画像の index を追加・削除・変更することはできません。");
  }
  return {
    ...draft,
    eyecatchAction: proposal.eyecatchAction,
    images: proposal.images.map((image) => ({
      index: image.index,
      style: image.style,
      description: image.description,
      ...(image.textSpec ? { textSpec: image.textSpec } : {}),
    })),
  };
}
