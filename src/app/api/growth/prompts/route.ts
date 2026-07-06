/**
 * プロンプト確認 API(承認画面「プロンプト」タブ・read-only)。
 *
 * GET: 記事生成に使う素材を**そのまま**返す。実行時に AI へ渡している静的テンプレ＋資料を
 * 承認画面から確認できるようにするのが目的(編集はしない)。返すもの:
 *   - 各フェーズのプロンプト   : `scripts/growth/prompts/*.md`
 *   - 文体の例(few-shot)      : `scripts/growth/prompts/examples/*.md`
 *   - 参考ドキュメント         : `docs/operations/{growth-article-style,ai-news-prompt,growth-weekly-runbook}.md`
 *   - 前提情報                 : `scripts/growth/facility-context.json`(別枠で返す)
 *
 * - 表示はデプロイ時点のリポジトリ内容(実行時に差し込む Notion 構成案などは含まない)。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。強権キーは使わない(公開ファイル)。
 * - 必須はフェーズのプロンプトのみ(読めなければ 500)。例/参考資料/前提は読めない分だけ静かに省く
 *   (沈黙故障を避けつつ、一部欠落で全体を落とさない)。
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { assemblePromptGroups, type PromptFile } from "@/lib/growth/promptRegistry";

export const runtime = "nodejs";

const PROMPTS_DIR = path.join(process.cwd(), "scripts", "growth", "prompts");
const EXAMPLES_DIR = path.join(PROMPTS_DIR, "examples");
const FACILITY_CONTEXT_PATH = path.join(
  process.cwd(),
  "scripts",
  "growth",
  "facility-context.json",
);

// AI が参照する資料＋この分析機能の運用マニュアル。リポジトリルートからの相対パス。
// (basename をキーに promptRegistry のラベル/グループへ対応づく)
const REFERENCE_DOC_PATHS: readonly string[] = [
  "CLAUDE.md",
  "docs/operations/growth-article-style.md",
  "docs/operations/ai-news-prompt.md",
  "docs/operations/growth-weekly-runbook.md",
  "docs/operations/news-admin-manual.md",
];

/** ディレクトリ内の .md を名前順に読み出す。dir が無ければ空配列(任意のディレクトリ向け)。 */
async function readMdDir(dir: string, optional: boolean): Promise<PromptFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if (optional) return [];
    throw error;
  }
  const mdNames = entries.filter((name) => name.endsWith(".md")).sort();
  return Promise.all(
    mdNames.map(async (filename) => ({
      filename,
      content: await readFile(path.join(dir, filename), "utf8"),
    })),
  );
}

/** 参考ドキュメントを 1 つずつ読む。読めないものは静かに省く(basename をキーにする)。 */
async function readReferenceDocs(): Promise<PromptFile[]> {
  const results = await Promise.all(
    REFERENCE_DOC_PATHS.map(async (rel) => {
      try {
        const content = await readFile(path.join(process.cwd(), rel), "utf8");
        return { filename: path.basename(rel), content } satisfies PromptFile;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((f): f is PromptFile => f !== null);
}

/** 前提情報(facility-context.json)を生テキストで読む。読めなければ null(表示は止めない)。 */
async function readFacilityContext(): Promise<string | null> {
  try {
    return await readFile(FACILITY_CONTEXT_PATH, "utf8");
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  try {
    const [prompts, examples, refs, facilityContext] = await Promise.all([
      readMdDir(PROMPTS_DIR, false), // 必須(失敗で 500)
      readMdDir(EXAMPLES_DIR, true), // 任意
      readReferenceDocs(), // 任意(個別に省く)
      readFacilityContext(), // 任意
    ]);
    return NextResponse.json({
      success: true,
      facilityContext,
      groups: assemblePromptGroups([...prompts, ...examples, ...refs]),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "プロンプトの読み込みに失敗しました。" },
      { status: 500 },
    );
  }
}
