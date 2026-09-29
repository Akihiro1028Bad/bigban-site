/**
 * 記事の書き直しで消えた要素を列挙する実行入口。
 *
 *   npm run growth:body-diff -- <旧: 公開ページURL or HTMLファイル> <新: HTMLファイル>
 *
 * 例: npm run growth:body-diff -- https://www.thepicklebang.com/ja/columns/pickleball-chiba-guide docs/reviews/.../pickleball-chiba-guide.draft.html
 *
 * 終了コード: 0 = 消えた要素なし / 2 = 消えた要素あり(一覧をオーナーに見せて確認する) / 1 = 実行エラー。
 * 薄い配線のためテスト対象外(ロジックは bodyDiff.ts でテスト済み)。
 */

import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";

import { diffBodies, formatReport, toBodyRoot } from "./bodyDiff";

const EXIT_MISSING = 2;
const FETCH_TIMEOUT_MS = 30_000;

function parse(html: string): Document {
  return new JSDOM(html).window.document;
}

async function loadBody(source: string): Promise<ParentNode> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${source} の取得に失敗しました (HTTP ${response.status})`);
    return toBodyRoot(await response.text(), parse, { requireContainer: true });
  }
  return toBodyRoot(await readFile(source, "utf8"), parse);
}

async function main(): Promise<void> {
  const [oldSource, newSource] = process.argv.slice(2);
  if (!oldSource || !newSource) {
    throw new Error("使い方: npm run growth:body-diff -- <旧: URL or ファイル> <新: ファイル>");
  }
  const [oldRoot, newRoot] = await Promise.all([loadBody(oldSource), loadBody(newSource)]);
  const diff = diffBodies(oldRoot, newRoot);
  process.stdout.write(formatReport(diff));
  if (diff.missingCount > 0) process.exitCode = EXIT_MISSING;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`比較に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
