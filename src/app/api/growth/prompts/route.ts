/**
 * プロンプト確認 API(承認画面「プロンプト」タブ・read-only)。
 *
 * GET: 記事生成に使う素材を**そのまま**返す。実行時に AI へ渡している静的テンプレ＋資料を
 * 承認画面から確認できるようにするのが目的(編集はしない)。返すもの:
 *   - 各フェーズのプロンプト   : `scripts/growth/prompts/*.md`
 *   - 共通プロンプト部品       : `scripts/growth/prompts/shared/*.md`
 *   - 文体の例(few-shot)      : `scripts/growth/prompts/examples/*.md`
 *   - 参考ドキュメント         : `promptRegistry.ts` の単一マニフェストに登録された docs/operations 等
 *   - 前提情報                 : `scripts/growth/facility-context.json`(別枠で返す)
 *
 * - 表示はデプロイ時点のリポジトリ内容(実行時に差し込む Notion 構成案などは含まない)。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。強権キーは使わない(公開ファイル)。
 * - 必須はフェーズのプロンプトのみ(読めなければ 500)。例/参考資料/前提は読めない分だけ warning に出す
 *   (一部欠落で全体を落とさないが、沈黙させない)。
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import {
  assemblePromptGroups,
  PROMPT_REGISTRY,
  PROMPT_REGISTRY_BY_PATH,
  type PromptFile,
  type PromptPhaseMeta,
} from "@/lib/growth/promptRegistry";

export const runtime = "nodejs";

const PROMPTS_DIR = path.join(process.cwd(), "scripts", "growth", "prompts");
const FACILITY_CONTEXT_PATH = path.join(
  process.cwd(),
  "scripts",
  "growth",
  "facility-context.json",
);

interface ReadResult {
  files: PromptFile[];
  warnings: string[];
}

function basenameOf(repoPath: string): string {
  return repoPath.slice(repoPath.lastIndexOf("/") + 1);
}

function warningFor(repoPath: string): string {
  return `任意資料 ${repoPath} を読み込めませんでした。`;
}

function pathFromWarning(warning: string): string {
  const prefix = "任意資料 ";
  const suffix = " を読み込めませんでした。";
  return warning.slice(prefix.length, -suffix.length);
}

function dirnameOfRepoPath(repoPath: string): string {
  const index = repoPath.lastIndexOf("/");
  return repoPath.slice(0, Math.max(index, 0));
}

/** 同じdir配下の登録ファイル欠落が既に出ている場合、補完スキャンのdir warningは重ねない。 */
function withoutRedundantDirectoryWarnings(
  registeredWarnings: readonly string[],
  supplementalWarnings: readonly string[],
): string[] {
  const registeredFailureDirs = new Set(
    registeredWarnings
      .map(pathFromWarning)
      .map(dirnameOfRepoPath),
  );
  return supplementalWarnings.filter((warning) => {
    const repoPath = pathFromWarning(warning);
    return !registeredFailureDirs.has(repoPath);
  });
}

/** マニフェスト未登録の Markdown だけを「その他」へ補完する任意スキャン。 */
async function readUnregisteredMd(dir: string, repoPrefix: string): Promise<ReadResult> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { files: [], warnings: [warningFor(repoPrefix)] };
  }
  const mdNames = entries
    .filter((name) => name.endsWith(".md"))
    .filter((name) => !PROMPT_REGISTRY_BY_PATH.has(`${repoPrefix}/${name}`))
    .sort();
  const warnings: string[] = [];
  const files = await Promise.all(
    mdNames.map(async (filename): Promise<PromptFile | null> => {
      const repoPath = `${repoPrefix}/${filename}`;
      try {
        return {
          path: repoPath,
          filename,
          content: await readFile(path.join(dir, filename), "utf8"),
        };
      } catch {
        warnings.push(warningFor(repoPath));
        return null;
      }
    }),
  );
  return { files: files.filter((file): file is PromptFile => file !== null), warnings };
}

interface RegisteredReadResult {
  file: PromptFile | null;
  warning: string | null;
}

async function readRegisteredFile(entry: PromptPhaseMeta): Promise<RegisteredReadResult> {
  try {
    return {
      file: {
        path: entry.path,
        filename: basenameOf(entry.path),
        // 実ファイルは next.config の outputFileTracingIncludes でマニフェストから静的列挙済み。
        content: await readFile(
          path.join(/* turbopackIgnore: true */ process.cwd(), entry.path),
          "utf8",
        ),
      },
      warning: null,
    };
  } catch (error) {
    if (entry.sourceKind === "prompt") throw error;
    return { file: null, warning: warningFor(entry.path) };
  }
}

/** 登録済み資料をマニフェスト順に読む。prompt は必須、その他は個別 warning。 */
async function readRegisteredFiles(): Promise<ReadResult> {
  const results = await Promise.all(
    PROMPT_REGISTRY.map((entry) => readRegisteredFile(entry)),
  );
  return {
    files: results.flatMap((result) => (result.file ? [result.file] : [])),
    warnings: results.flatMap((result) => (result.warning ? [result.warning] : [])),
  };
}

/** 前提情報(facility-context.json)を生テキストで読む。読めなければ warning を返す。 */
async function readFacilityContext(): Promise<{ content: string | null; warnings: string[] }> {
  try {
    return { content: await readFile(FACILITY_CONTEXT_PATH, "utf8"), warnings: [] };
  } catch {
    return {
      content: null,
      warnings: [warningFor("scripts/growth/facility-context.json")],
    };
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  try {
    const [registered, unregisteredPrompts, unregisteredShared, unregisteredExamples, facilityContext] = await Promise.all([
      readRegisteredFiles(),
      readUnregisteredMd(PROMPTS_DIR, "scripts/growth/prompts"),
      readUnregisteredMd(path.join(PROMPTS_DIR, "shared"), "scripts/growth/prompts/shared"),
      readUnregisteredMd(path.join(PROMPTS_DIR, "examples"), "scripts/growth/prompts/examples"),
      readFacilityContext(), // 任意
    ]);
    const files = [
      ...registered.files,
      ...unregisteredPrompts.files,
      ...unregisteredShared.files,
      ...unregisteredExamples.files,
    ];
    const warnings = [
      ...registered.warnings,
      ...withoutRedundantDirectoryWarnings(registered.warnings, [
        ...unregisteredPrompts.warnings,
        ...unregisteredShared.warnings,
        ...unregisteredExamples.warnings,
      ]),
      ...facilityContext.warnings,
    ];
    return NextResponse.json({
      success: true,
      facilityContext: facilityContext.content,
      warnings,
      groups: assemblePromptGroups(files),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "プロンプトの読み込みに失敗しました。" },
      { status: 500 },
    );
  }
}
