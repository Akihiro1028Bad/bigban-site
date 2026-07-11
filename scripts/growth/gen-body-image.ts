/**
 * 本文画像(#62/#156)をスタイル別プロンプトで生成する実行入口(headless 対応)。
 *
 *   npm run growth:gen-body-image -- --style <mascot|illust|court|flow|infographic> --description "<説明>" --out <出力パス>
 *   (旧値 minimal/diagram も --style で受理し normalizeBodyImageStyle でマップする)
 *   (任意) --size 1536x1024 --quality high
 *
 * buildBodyImagePrompt でスタイル別のフルプロンプトを組み、generateImage で生成する。
 * 参照画像(宇宙人マスコット)は mascot のときだけ付与する(publish-draft の本文画像生成と同方針)。
 * 文体・配色の正典は growth-article-style.md §9。
 * 薄い配線のためテスト対象外(ロジックは body-image.ts でテスト済み)。
 */

import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBodyImagePrompt, normalizeBodyImageStyle, type BodyImageStyle } from "./body-image";
import { generateImage } from "./eyecatch";
import { defaultFetch } from "./http";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REF = path.join(here, "assets", "mascot-alien.png");
// 生成に使う新5スタイル。旧値(minimal/diagram)も受理し normalizeBodyImageStyle でマップする。
const STYLES: readonly BodyImageStyle[] = ["mascot", "illust", "court", "flow", "infographic"];
const ACCEPTED_STYLE_INPUTS: readonly string[] = [...STYLES, "minimal", "diagram"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY が未設定です。");

  const rawStyle = arg("--style");
  if (!rawStyle || !ACCEPTED_STYLE_INPUTS.includes(rawStyle)) {
    throw new Error(`--style は ${STYLES.join("|")}(旧値 minimal/diagram も可)のいずれかを指定してください。`);
  }
  const style = normalizeBodyImageStyle(rawStyle);
  const description = arg("--description");
  if (!description) throw new Error('--description "<説明>" を指定してください。');
  const out = arg("--out");
  if (!out) throw new Error("--out <出力パス> を指定してください。");
  const size = arg("--size") ?? "1536x1024";
  const quality = arg("--quality") ?? "high";

  const prompt = buildBodyImagePrompt(style, description);
  const buf = await generateImage(
    {
      apiKey,
      prompt,
      size,
      quality,
      // mascot のみ参照画像でキャラを保持。illust/court/flow/infographic は参照なし(publish-draft と同方針)。
      refPath: style === "mascot" ? DEFAULT_REF : undefined,
    },
    { fetchFn: defaultFetch, readFile }
  );

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, buf);
  process.stdout.write(`${out}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`本文画像生成に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
