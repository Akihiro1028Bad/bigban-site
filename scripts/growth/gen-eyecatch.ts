/**
 * 宇宙人マスコットのアイキャッチを参照画像方式で生成する実行入口(headless 対応)。
 *
 *   npm run growth:gen-eyecatch -- --action "<英語の行為>" --out <出力パス>
 *   (任意) --title "<記事タイトル>" を渡すと余白にタイトル(日本語)を描く(#163)
 *   (任意) --prompt "<完全なプロンプトで上書き>" --ref <参照画像> --size 1536x1024 --quality high
 *
 * 既定の参照画像は scripts/growth/assets/mascot-alien.png(同梱)。
 * --action を渡すと buildEyecatchPrompt で固定スタイルと合成する。
 * 配色・作画方針は eyecatch.ts / body-image.ts のプロンプト定数が正典。
 * 薄い配線のためテスト対象外(ロジックは eyecatch.ts でテスト済み)。
 */

import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEyecatchPrompt, generateEyecatch } from "./eyecatch";
import { defaultFetch } from "./http";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REF = path.join(here, "assets", "mascot-alien.png");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY が未設定です。");

  const action = arg("--action");
  const override = arg("--prompt");
  if (!action && !override) {
    throw new Error("使い方: --action \"<行為>\" もしくは --prompt \"<全文>\" を指定してください。");
  }
  const title = arg("--title");
  const prompt = override ?? buildEyecatchPrompt(action as string, title);

  const refPath = arg("--ref") ?? DEFAULT_REF;
  const out = arg("--out");
  if (!out) throw new Error("--out <出力パス> を指定してください。");
  const size = arg("--size") ?? "1536x1024";
  const quality = arg("--quality") ?? "high";

  const buf = await generateEyecatch(
    { apiKey, refPath, prompt, size, quality },
    { fetchFn: defaultFetch, readFile }
  );

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, buf);
  process.stdout.write(`${out}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`アイキャッチ生成に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
