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

import { NO_TABLE_TENNIS, PICKLEBALL_ANCHOR } from "./body-image";
import type { FetchFn } from "./http";

export const EYECATCH_EDITS_URL = "https://api.openai.com/v1/images/edits";
// 参照画像なし(text-to-image)の生成エンドポイント。minimal/diagram の本文画像(#63)で使う。
export const IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";

/** 参照画像のキャラを保持させる固定の前置き。 */
const CHARACTER_PREFIX =
  "Using the exact gray alien character from the reference image " +
  "(smooth gray head, large black almond eyes with white highlights, small friendly smile), " +
  "create a wide 16:9 flat illustration of this same alien";

/**
 * 記事に依らない固定スタイル(宇宙・ブランド配色・余白・文字なし)。
 * #89: 画像モデルの卓球バイアス対策として、競技をピックルボールに固定し卓球を除外する
 * (PICKLEBALL_ANCHOR / NO_TABLE_TENNIS は本文画像と共用)。
 */
const STYLE_BASE =
  "Cosmic starry deep-space background in deep blue (#11317B) and black " +
  "with bright blue (#306EC3) glow and yellow-green (#F6FF54) accents. " +
  "Keep the alien's face identical to the reference. " +
  "Clean, characterful, premium flat illustration. " +
  `${PICKLEBALL_ANCHOR} ${NO_TABLE_TENNIS} `;

/** タイトル未指定: 文字を入れず片側に余白だけ残す(従来挙動)。 */
const NO_TEXT_CLAUSE = "Leave clean negative space on one side for text. No text, no logos.";

/**
 * タイトル指定時(#163): 確保した余白に記事タイトル(日本語)を描く指示。
 * 日本語の字形が崩れやすいため「正確に綴る」ことを強調する。
 */
function titleClause(title: string): string {
  return (
    `Render the article title "${title}" as large, bold, clearly legible Japanese text ` +
    "in clean negative space on one side, integrated tastefully with the composition. " +
    "Spell every Japanese character exactly and correctly. No other text, no logos."
  );
}

/**
 * 「キャラ固定 + 記事ごとの行為 + 固定スタイル」でアイキャッチ用プロンプトを組む。
 * action は記事ごとに変える行為の説明(英語1フレーズ)。title を渡すと余白に
 * タイトル(日本語)を描く指示になる(#163)。空/未指定なら従来どおり文字なし。
 */
export function buildEyecatchPrompt(action: string, title?: string): string {
  const trimmed = action.trim().replace(/[.\s]+$/, "");
  const cleanTitle = (title ?? "").trim();
  const textClause = cleanTitle ? titleClause(cleanTitle) : NO_TEXT_CLAUSE;
  return `${CHARACTER_PREFIX} ${trimmed}. ${STYLE_BASE}${textClause}`;
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

/** 画像生成リクエスト。refPath があれば編集API(参照画像でキャラ固定)、無ければ text-to-image。 */
export interface ImageGenRequest {
  apiKey: string;
  prompt: string;
  size: string;
  quality: string;
  /** 参照画像パス。指定時は edits(キャラ固定)、未指定時は generations(text-to-image)。 */
  refPath?: string;
}

async function readImageResponse(
  res: Awaited<ReturnType<FetchFn>>
): Promise<Buffer> {
  if (!res.ok) {
    // レスポンス本文(課金・キー情報を含むことがある)は読み捨て、ステータスのみを
    // 例外に載せる。この message は失敗通知で LINE にも出るため秘匿情報を漏らさない。
    await res.text();
    throw new Error(`画像生成に失敗しました (HTTP ${res.status})`);
  }
  const json = (await res.json()) as EditsResponse;
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("画像生成の応答に b64_json が含まれていません。");
  }
  return Buffer.from(b64, "base64");
}

/**
 * gpt-image-2 で画像を生成し PNG バイト列を返す。
 * - refPath あり: `/v1/images/edits` に参照画像を渡してキャラを固定(マスコット)。
 * - refPath なし: `/v1/images/generations` の text-to-image(ミニマル/図解)。
 * 失敗(HTTPエラー / b64欠落)時は例外。fetch / readFile は注入可能。
 */
export async function generateImage(
  req: ImageGenRequest,
  deps: EyecatchDeps
): Promise<Buffer> {
  if (req.refPath !== undefined) {
    const bytes = await deps.readFile(req.refPath);
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("prompt", req.prompt);
    form.append("size", req.size);
    form.append("quality", req.quality);
    form.append("n", "1");
    form.append(
      // ファイル名は multipart のラベルに過ぎず、API はバイト内容のみを使う(意味なし)。
      "image",
      new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
      "reference.png"
    );
    const res = await deps.fetchFn(EYECATCH_EDITS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${req.apiKey}` },
      body: form,
    });
    return readImageResponse(res);
  }

  const res = await deps.fetchFn(IMAGE_GENERATIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: req.prompt,
      size: req.size,
      quality: req.quality,
      n: 1,
    }),
  });
  return readImageResponse(res);
}

/**
 * 参照画像を渡して gpt-image-2 の編集APIでアイキャッチを生成し、PNG バイト列を返す。
 * generateImage(refPath 指定)へ委譲する。
 */
export function generateEyecatch(
  req: EyecatchRequest,
  deps: EyecatchDeps
): Promise<Buffer> {
  return generateImage(req, deps);
}
