/** 承認済み構成案と生成本文の見出し一致を検証する純ロジック。 */

import type { NotionPage } from "./notion";

export const OUTLINE_PROP = "構成案";

interface Heading {
  level: 2 | 3;
  text: string;
}

export interface OutlineComplianceResult {
  ok: boolean;
  blockReasons: string[];
}

export interface OutlineComplianceOptions {
  /** §15の条件を満たす根拠台帳があり、末尾の参考資料欄を自動生成してよいか。 */
  allowGeneratedReferences?: boolean;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function normalizeHeading(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ""))
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*([:(),])\s*/g, "$1");
}

function outlineHeadings(outline: string): Heading[] {
  const lines = outline.replace(/<br\s*\/?\s*>/gi, "\n").split(/\r?\n/);
  const headings: Heading[] = [];
  for (const line of lines) {
    const match = line.trim().match(/^(#{2,3})\s+(.+)$/);
    if (!match) continue;
    headings.push({
      level: match[1].length as 2 | 3,
      text: normalizeHeading(match[2]),
    });
  }
  return headings;
}

function bodyHeadings(bodyHtml: string): Heading[] {
  const headings: Heading[] = [];
  const pattern = /<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
  for (const match of bodyHtml.matchAll(pattern)) {
    headings.push({
      level: Number(match[1]) as 2 | 3,
      text: normalizeHeading(match[2]),
    });
  }
  return headings;
}

function withoutGeneratedReferences(
  expected: readonly Heading[],
  actual: Heading[],
  isAllowed: boolean
): Heading[] {
  const last = actual.at(-1);
  const referenceHeading = normalizeHeading("参考資料");
  const isAlreadyApproved = expected.some(
    (heading) => heading.level === 2 && heading.text === referenceHeading
  );
  if (
    isAllowed &&
    !isAlreadyApproved &&
    actual.length === expected.length + 1 &&
    last?.level === 2 &&
    last.text === referenceHeading
  ) {
    return actual.slice(0, -1);
  }
  return actual;
}

/** Notionページの分割rich_textから現在の構成案を取得する。 */
export function outlineFromPage(page: NotionPage): string {
  const prop = page.properties[OUTLINE_PROP] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (prop?.rich_text ?? []).map((part) => part.plain_text ?? "").join("");
}

/** H2/H3のレベル・見出し名・順序を比較する。 */
export function evaluateOutlineCompliance(
  outline: string,
  bodyHtml: string,
  options: OutlineComplianceOptions = {}
): OutlineComplianceResult {
  const expected = outlineHeadings(outline);
  if (expected.length === 0) {
    return { ok: false, blockReasons: ["構成案にH2/H3見出しがありません"] };
  }

  const actual = withoutGeneratedReferences(
    expected,
    bodyHeadings(bodyHtml),
    options.allowGeneratedReferences === true
  );
  if (actual.length !== expected.length) {
    return {
      ok: false,
      blockReasons: [
        `見出し数が構成案と一致しません(構成案${expected.length}件/本文${actual.length}件)`,
      ],
    };
  }

  const blockReasons: string[] = [];
  expected.forEach((heading, index) => {
    const found = actual[index];
    if (found.level !== heading.level || found.text !== heading.text) {
      blockReasons.push(
        `${index + 1}番目の見出しが不一致です(構成案:H${heading.level} ${heading.text}/本文:H${found.level} ${found.text})`
      );
    }
  });
  return { ok: blockReasons.length === 0, blockReasons };
}
