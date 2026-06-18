/**
 * グロース記事アイキャッチの生成ロジック(宇宙人マスコット × コスミック)。
 *
 * 同梱の参照画像(`assets/mascot-alien.png`)を OpenAI の編集エンドポイント
 * (`/v1/images/edits`, gpt-image-2)に渡し、**同じキャラのまま**記事ごとの
 * シーンを生成する。固定スタイル(フラット・宇宙背景・ブランド配色)は
 * `buildEyecatchPrompt` に集約し、記事ごとに変わるのは「行為(action)」だけ。
 *
 * 文体・配色の正典は growth-article-style.md §9。fetch / readFile は注入可能。
 */

import type { FetchFn } from "./http";

export const EYECATCH_EDITS_URL = "https://api.openai.com/v1/images/edits";

/** 参照画像のキャラを保持させる固定の前置き。 */
const CHARACTER_PREFIX =
  "Using the exact gray alien character from the reference image " +
  "(smooth gray head, large black almond eyes with white highlights, small friendly smile), " +
  "create a wide 16:9 flat illustration of this same alien";

/** 記事に依らない固定スタイル(宇宙・ブランド配色・余白・文字なし)。 */
const STYLE_SUFFIX =
  "Cosmic starry deep-space background in deep blue (#11317B) and black " +
  "with bright blue (#306EC3) glow and yellow-green (#F6FF54) accents. " +
  "Keep the alien's face identical to the reference. " +
  "Clean, characterful, premium flat illustration. " +
  "Leave clean negative space on one side for text. No text, no logos.";

/**
 * 「キャラ固定 + 記事ごとの行為 + 固定スタイル」でアイキャッチ用プロンプトを組む。
 * action は記事ごとに変える行為の説明(英語1フレーズ)。
 */
export function buildEyecatchPrompt(action: string): string {
  const trimmed = action.trim().replace(/[.\s]+$/, "");
  return `${CHARACTER_PREFIX} ${trimmed}. ${STYLE_SUFFIX}`;
}

export interface EyecatchRequest {
  apiKey: string;
  refPath: string;
  prompt: string;
  size: string;
  quality: string;
}

export interface EyecatchDeps {
  fetchFn: FetchFn;
  readFile: (path: string) => Promise<Buffer>;
}

interface EditsResponse {
  data?: Array<{ b64_json?: string }>;
}

/**
 * 参照画像を渡して gpt-image-2 の編集APIで画像を生成し、PNG バイト列を返す。
 * 失敗(HTTPエラー / b64欠落)時は例外。
 */
export async function generateEyecatch(
  req: EyecatchRequest,
  deps: EyecatchDeps
): Promise<Buffer> {
  const bytes = await deps.readFile(req.refPath);

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", req.prompt);
  form.append("size", req.size);
  form.append("quality", req.quality);
  form.append("n", "1");
  form.append(
    "image",
    new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
    "mascot-alien.png"
  );

  const res = await deps.fetchFn(EYECATCH_EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `アイキャッチ生成に失敗しました (HTTP ${res.status}): ${text}`
    );
  }

  const json = (await res.json()) as EditsResponse;
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("画像生成の応答に b64_json が含まれていません。");
  }
  return Buffer.from(b64, "base64");
}
