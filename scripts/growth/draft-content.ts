/**
 * microCMS に記事下書きを作成/更新する実行入口(headless 対応・MCP不要)。
 *
 *   npm run growth:draft-content -- create <payload.json>
 *   npm run growth:draft-content -- patch <contentId> <payload.json>
 *
 * payload.json は news スキーマに沿った JSON(title/slug/locale/category/
 * displayMode/bodyHtml/excerpt/eyecatch 等)。標準出力に contentId を返す。
 * 薄い配線のためテスト対象外(ロジックは content.ts でテスト済み)。
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";

import { defaultFetch } from "./http";
import { createDraft, patchDraft, type ContentApiOptions } from "./content";
import { growthEndpoint } from "./endpoint";

const ENDPOINT = growthEndpoint();

async function main(): Promise<void> {
  const [mode] = process.argv.slice(2);
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey =
    process.env.MICROCMS_CONTENT_API_KEY ??
    process.env.MICROCMS_MANAGEMENT_API_KEY;
  if (!serviceDomain || !apiKey) {
    throw new Error(
      "MICROCMS_SERVICE_DOMAIN と MICROCMS_CONTENT_API_KEY(無ければ MICROCMS_MANAGEMENT_API_KEY)を .env に設定してください。"
    );
  }
  const options: ContentApiOptions = {
    serviceDomain,
    apiKey,
    fetchFn: defaultFetch,
  };

  if (mode === "create") {
    const payloadPath = process.argv[3];
    if (!payloadPath) throw new Error("使い方: create <payload.json>");
    const data = JSON.parse(await readFile(payloadPath, "utf-8"));
    const id = await createDraft(ENDPOINT, data, options);
    process.stdout.write(`${id}\n`);
    return;
  }

  if (mode === "patch") {
    const contentId = process.argv[3];
    const payloadPath = process.argv[4];
    if (!contentId || !payloadPath) {
      throw new Error("使い方: patch <contentId> <payload.json>");
    }
    const data = JSON.parse(await readFile(payloadPath, "utf-8"));
    const id = await patchDraft(ENDPOINT, contentId, data, options);
    process.stdout.write(`${id}\n`);
    return;
  }

  throw new Error("使い方: create <payload.json> | patch <contentId> <payload.json>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`下書き処理に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
