/**
 * プロンプト/正典ドキュメントの静的検査(運用評価・中期2)。DOM/IO 非依存の純ロジック。
 *
 * 検出するもの:
 *  - unregistered: `scripts/growth/prompts/` にあるが `promptRegistry.ts` に未登録の .md
 *    (承認画面「プロンプト」タブで「その他」に落ちる=登録忘れ)。
 *  - stale-reference: プロンプト本文が参照する repo パス(.md/.json/.ts)で実在しないもの
 *    (リファクタで参照先が消えた/節番号変更で迷子になった等)。
 *
 * ファイル読み込み(IO)と実在判定は CLI(`prompt-lint-cli.ts`)が担い、結果をこの純関数へ渡す。
 */

export type PromptLintKind = "unregistered" | "stale-reference";

export interface PromptLintIssue {
  kind: PromptLintKind;
  /** 対象ファイル名(例 "drafts.md")。 */
  file: string;
  /** 人が読める詳細。 */
  detail: string;
}

/** ディスクに在るが registry に無いファイル名を返す。 */
export function findUnregisteredPrompts(
  present: readonly string[],
  registered: readonly string[]
): string[] {
  const known = new Set(registered);
  return present.filter((name) => !known.has(name));
}

// repo 内のパス参照(スラッシュを含み .md/.json/.ts(x) で終わる)を抽出する。
// 先頭に `://` を持つ URL は除くため、直前が `/` でない位置から始まるトークンに限定する。
const PATH_PATTERN = /(?<![\w./:-])((?:scripts|docs|src|public|data|config)\/[\w./-]+\.(?:md|json|tsx?|mjs))/g;

/** プロンプト本文から repo パス参照を重複なく抽出する。 */
export function extractReferencedPaths(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(PATH_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/** 参照先のうち、実在判定 `exists` が false のものを stale として返す。 */
export function findStaleReferences(
  file: string,
  referenced: readonly string[],
  exists: (path: string) => boolean
): PromptLintIssue[] {
  return referenced
    .filter((path) => !exists(path))
    .map((path) => ({
      kind: "stale-reference" as const,
      file,
      detail: `存在しない参照: ${path}`,
    }));
}

export interface LintPromptsArgs {
  /** prompts/ 直下に在る .md ファイル名。 */
  present: readonly string[];
  /** promptRegistry に登録済みのファイル名。 */
  registered: readonly string[];
  /** 本文検査の対象(name=ファイル名・content=本文)。 */
  files: ReadonlyArray<{ name: string; content: string }>;
  /** repo パスの実在判定。 */
  exists: (path: string) => boolean;
}

/** 未登録プロンプトと古い参照をまとめて検出する。 */
export function lintPrompts(args: LintPromptsArgs): PromptLintIssue[] {
  const issues: PromptLintIssue[] = [];
  for (const name of findUnregisteredPrompts(args.present, args.registered)) {
    issues.push({
      kind: "unregistered",
      file: name,
      detail: `promptRegistry.ts 未登録(承認画面で「その他」に落ちます)`,
    });
  }
  for (const f of args.files) {
    issues.push(
      ...findStaleReferences(f.name, extractReferencedPaths(f.content), args.exists)
    );
  }
  return issues;
}
