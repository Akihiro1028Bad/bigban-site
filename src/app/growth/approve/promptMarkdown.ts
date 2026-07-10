/**
 * プロンプト閲覧用の Markdown → HTML 整形(#212)。
 *
 * フェーズプロンプト(scripts/growth/prompts/*.md)は Markdown なので、見出し・箇条書き・
 * 強調・コード・リンクを整形して読みやすく表示する。ただし本文に含まれる `<role>` `<workflow>`
 * `<p>` `<img>` などの疎な XML風タグは「指示テキスト」であって HTML ではないため、
 * リテラルの文字列として見えるようにエスケープする(HTML 化も除去もしない)。
 *
 * marked の既定 `html` レンダラは生 HTML を素通しするので、専用インスタンスで override して
 * エスケープに差し替える。最後に DOMPurify でサニタイズして安全な HTML だけを返す。
 *
 * さらに block レベルの html トークナイザを無効化する(`tokenizer.html` が undefined を返す)。
 * 実プロンプトは `<role>` `<non_negotiables>` `<source_of_truth>` などの XML風構造タグを
 * 単独行で使うが、marked は既定でこれらを「HTML ブロック」と見なし、中身の Markdown
 * (強調・箇条書き)を整形せず生のまま出す。block html を無効化すると、これらのタグは
 * 段落テキストとして流れ込み、周囲・内部の Markdown が整形されるようになる。タグ自体は
 * inline html トークンとして拾われ、上記 `renderer.html` の escape でリテラル表示のまま残る。
 *
 * 補足: 句読点に直接隣接する強調(例 `**…）**`)は CommonMark の emphasis-flanking
 * 規則によりリテラルのまま残ることがある。これは仕様由来で許容する。
 */

import { Marked } from "marked";
import DOMPurifyFactory from "isomorphic-dompurify";

import type { Token, Tokens } from "marked";

export interface PromptMarkdownOptions {
  currentPath?: string;
  registeredPaths?: ReadonlySet<string>;
}

export interface PromptHeading {
  id: string;
  level: 2 | 3;
  text: string;
}

// 許可するURIをプロンプト閲覧用途へ限定する。記事sanitizerのglobal hookとは共有しない。
const PROMPT_ALLOWED_URI_REGEXP = /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|#[^\s]*|\/growth\/approve\?view=prompt&doc=[A-Za-z0-9%._~-]+(?:&raw=1)?(?:#[A-Za-z0-9%._~-]+)?)$/i;

/** 生 HTML トークンを表示用テキストへエスケープする(タグをリテラル文字として見せる)。 */
function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeSegments(pathname: string): string {
  const parts: string[] = [];
  for (const part of pathname.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function dirname(repoPath: string): string {
  const index = repoPath.lastIndexOf("/");
  return index === -1 ? "" : repoPath.slice(0, index);
}

function isExternalHref(href: string): boolean {
  return href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href);
}

function looksRepoRooted(href: string): boolean {
  return (
    href.startsWith("scripts/") ||
    href.startsWith("docs/") ||
    href.startsWith("src/") ||
    href.startsWith("public/") ||
    href.startsWith("data/") ||
    href.startsWith("config/") ||
    href === "AGENTS.md" ||
    href === "CLAUDE.md"
  );
}

function resolveRepoPath(href: string, currentPath: string | undefined): string {
  const [withoutHash] = href.split("#", 1);
  const [withoutQuery] = withoutHash.split("?", 1);
  const trimmed = withoutQuery.replace(/^\/+/, "");
  if (looksRepoRooted(trimmed) || !currentPath) return normalizeSegments(trimmed);
  return normalizeSegments(`${dirname(currentPath)}/${trimmed}`);
}

function slugify(text: string): string {
  const ascii = text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "section";
}

function uniqueSlug(base: string, used: Map<string, number>): string {
  const next = (used.get(base) ?? 0) + 1;
  used.set(base, next);
  return next === 1 ? base : `${base}-${next}`;
}

function buildMarked(options: PromptMarkdownOptions): Marked {
  const usedHeadingIds = new Map<string, number>();
  return new Marked({
    gfm: true,
    breaks: false,
    tokenizer: {
      // block レベルの html 検出を無効化する。構造タグ(<role> 等)を HTML ブロック扱いに
      // させず、中身/周囲の Markdown を整形させるため。inline html は引き続き拾われ escape される。
      html(): undefined {
        return undefined;
      },
    },
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(text);
      },
      heading({ depth, text }: Tokens.Heading): string {
        const escaped = escapeHtml(text);
        if (depth !== 2 && depth !== 3) return `<h${depth}>${escaped}</h${depth}>`;
        const id = uniqueSlug(slugify(text), usedHeadingIds);
        return `<h${depth} id="${id}" class="scroll-mt-64">${escaped}</h${depth}>`;
      },
      link({ href, title, text }: Tokens.Link): string {
        const label = escapeHtml(text);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        if (isExternalHref(href)) {
          return `<a href="${escapeHtml(href)}"${titleAttr}>${label}</a>`;
        }
        const repoPath = resolveRepoPath(href, options.currentPath);
        if (options.registeredPaths?.has(repoPath)) {
          const hashIndex = href.indexOf("#");
          const fragment = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
          const beforeHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
          const queryIndex = beforeHash.indexOf("?");
          const sourceQuery = queryIndex === -1 ? "" : beforeHash.slice(queryIndex + 1);
          const sourceParams = new URLSearchParams(sourceQuery);
          const targetParams = new URLSearchParams({ view: "prompt", doc: repoPath });
          if (sourceParams.get("raw") === "1") targetParams.set("raw", "1");
          const encodedFragment = fragment ? `#${encodeURIComponent(fragment)}` : "";
          const target = `/growth/approve?${targetParams.toString()}${encodedFragment}`;
          return `<a href="${target}" data-doc-path="${escapeHtml(repoPath)}"${titleAttr}>${label}</a>`;
        }
        return `<a href="#" data-missing-doc-path="${escapeHtml(repoPath)}"${titleAttr}>${label}</a>`;
      },
    },
  });
}

/** Markdown ソースを整形済みかつサニタイズ済みの HTML 文字列に変換する。 */
export function renderPromptMarkdown(source: string, options: PromptMarkdownOptions = {}): string {
  const md = buildMarked(options);
  const html = md.parse(source, { async: false }) as string;
  // isomorphic-dompurify のdefault singletonには記事本文用hookが登録されるため、
  // 現在のwindowから専用instanceを作り、プロンプト用設定だけでsanitizeする。
  const purifier = DOMPurifyFactory(window);
  return purifier.sanitize(html, {
    ADD_ATTR: ["data-doc-path", "data-missing-doc-path"],
    ALLOWED_URI_REGEXP: PROMPT_ALLOWED_URI_REGEXP,
  });
}

/** H2/H3 目次用の見出しを Markdown ソースから抽出する。 */
export function extractPromptHeadings(source: string): PromptHeading[] {
  const used = new Map<string, number>();
  const headings: PromptHeading[] = [];
  const md = buildMarked({});
  const tokens = md.lexer(source);
  md.walkTokens(tokens, (token: Token) => {
    if (token.type !== "heading" || (token.depth !== 2 && token.depth !== 3)) return;
    const text = token.text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    headings.push({
      id: uniqueSlug(slugify(token.text), used),
      level: token.depth,
      text,
    });
  });
  return headings;
}
