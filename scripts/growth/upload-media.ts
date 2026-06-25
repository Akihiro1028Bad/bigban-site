/**
 * 画像を microCMS にアップロードする実行入口。
 *
 *   npm run growth:upload-media -- <画像ファイルパス>
 *
 * 標準出力にアセット URL を1行で返す(下書きの eyecatch に設定する用途)。
 * 薄い配線のためテスト対象外(ロジックは media.ts でテスト済み)。
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";

import { defaultFetch } from "./http";
import { uploadMedia } from "./media";

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("使い方: npm run growth:upload-media -- <画像ファイルパス>");
  }

  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_MANAGEMENT_API_KEY;
  if (!serviceDomain || !apiKey) {
    throw new Error(
      "MICROCMS_SERVICE_DOMAIN と MICROCMS_MANAGEMENT_API_KEY を .env に設定してください。"
    );
  }

  const url = await uploadMedia(filePath, {
    serviceDomain,
    apiKey,
    fetchFn: defaultFetch,
    readFile,
  });

  process.stdout.write(`${url}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`アップロードに失敗しました: ${message}\n`);
  process.exitCode = 1;
});
