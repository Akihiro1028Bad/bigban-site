/**
 * 施設の前提コンテキストを「実行時の基準日つき」で標準出力する薄い入口。
 *
 *   npm run growth:facility-context
 *
 * 下書きモード(drafts.md)が冒頭でこれを実行し、出力を「正典の前提」として
 * 記事生成エージェントに注入する。基準日は実行時の現在時刻(JST)で評価する。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFacilityContextData, renderFacilityContext } from "./facility-context";

const here = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(here, "facility-context.json");

try {
  const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as unknown;
  const data = parseFacilityContextData(raw);
  process.stdout.write(`${renderFacilityContext(data, new Date())}\n`);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`前提コンテキストの読み込みに失敗しました: ${message}\n`);
  process.exitCode = 1;
}
