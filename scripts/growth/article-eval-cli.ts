/**
 * 記事下書きの品質比較の実行入口(運用評価・中期3)。
 *
 *   npm run growth:article-eval -- <before.json> <after.json>
 *
 * 各 JSON は publish-draft の spec(`{ payload: { title, bodyHtml } }`)か、
 * 直接 `{ title, bodyHtml }` を受け付ける。block/warn の増減と improved/regressed/unchanged を出力する。
 * 薄い配線のためカバレッジ除外(純ロジックは articleEval.ts)。
 */

import { readFileSync } from "node:fs";

import { compareArticles, type ArticleEvalInput } from "./articleEval";
import { confirmedFactsFromEntries, parseSourceLedger } from "./sourceLedger";

interface MaybeSpec {
  title?: unknown;
  bodyHtml?: unknown;
  payload?: { title?: unknown; bodyHtml?: unknown };
  sourceLedger?: unknown;
}

function loadInput(file: string): ArticleEvalInput {
  const raw = JSON.parse(readFileSync(file, "utf-8")) as MaybeSpec;
  const src = raw.payload ?? raw;
  return {
    title: String(src.title ?? ""),
    bodyHtml: String(src.bodyHtml ?? ""),
    confirmedFacts: confirmedFactsFromEntries(parseSourceLedger(raw.sourceLedger).entries),
  };
}

function main(): void {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    throw new Error("使い方: article-eval -- <before.json> <after.json>");
  }
  const cmp = compareArticles(loadInput(beforePath), loadInput(afterPath));

  process.stdout.write(`判定: ${cmp.verdict}\n`);
  process.stdout.write(
    `block: ${cmp.before.block} → ${cmp.after.block}(${cmp.blockDelta >= 0 ? "+" : ""}${cmp.blockDelta})\n`
  );
  process.stdout.write(
    `warn : ${cmp.before.warn} → ${cmp.after.warn}(${cmp.warnDelta >= 0 ? "+" : ""}${cmp.warnDelta})\n`
  );

  const afterBlocks = cmp.after.checks.filter((c) => c.level === "block");
  if (afterBlocks.length > 0) {
    process.stdout.write("after の block:\n");
    for (const c of afterBlocks) {
      process.stdout.write(`  - ${c.label}: ${c.value}${c.hint ? `(${c.hint})` : ""}\n`);
    }
  }

  // regressed のときは終了コード 1(CI 等で変更前後の劣化を検知できるように)。
  if (cmp.verdict === "regressed") process.exitCode = 1;
}

main();
