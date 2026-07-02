/**
 * セルフヒール実行入口(#26): 同 slug の重複下書きを検出・削除する。
 *
 *   npm run growth:self-heal -- --slug <slug> [--canonical <id>] [--apply] [--max <n>]
 *
 * 既定は **dry-run**(削除しない)。実削除は `--apply` を明示。
 * 正本(--canonical 省略時は slug 由来ID)以外の同slug下書きを削除する。
 * 破壊的操作のため、必ず結果(検出/削除/打ち切り)を出力する。
 * 薄い配線のためテスト対象外(ロジックは self-heal.ts でテスト済み)。
 */

import "dotenv/config";

import { slugToContentId } from "./content";
import { growthEndpoint } from "./endpoint";
import { defaultFetch } from "./http";
import {
  deleteContent,
  fetchContentSlug,
  listDraftMetas,
  selfHeal,
  type SelfHealHttpOptions,
} from "./self-heal";

const ENDPOINT = growthEndpoint();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

async function main(): Promise<void> {
  const slug = arg("--slug");
  if (!slug) throw new Error("使い方: --slug <slug> [--canonical <id>] [--apply] [--max <n>]");
  const canonicalId = arg("--canonical") ?? slugToContentId(slug);
  const dryRun = !process.argv.includes("--apply");
  const maxDelete = Number(arg("--max") ?? "20");

  const serviceDomain = requireEnv("MICROCMS_SERVICE_DOMAIN");
  const apiKey =
    process.env.MICROCMS_MANAGEMENT_API_KEY ??
    requireEnv("MICROCMS_CONTENT_API_KEY");
  const http: SelfHealHttpOptions = { serviceDomain, apiKey, fetchFn: defaultFetch };

  const result = await selfHeal(
    { slug, canonicalId, dryRun, maxDelete },
    {
      listMetas: () => listDraftMetas(ENDPOINT, http),
      resolveSlug: (id, draftKey) => fetchContentSlug(ENDPOINT, id, draftKey, http),
      del: (id) => deleteContent(ENDPOINT, id, http),
    }
  );

  process.stdout.write(`${result.message}\n`);
  if (result.duplicateIds.length > 0) {
    process.stdout.write(`対象: ${result.duplicateIds.join(", ")}\n`);
  }
  if (result.truncated) {
    process.stdout.write(
      "※ 一部のみ処理(ページ/上限による打ち切り)。残りは再実行または手動確認を。\n"
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`セルフヒールに失敗しました: ${message}\n`);
  process.exitCode = 1;
});
