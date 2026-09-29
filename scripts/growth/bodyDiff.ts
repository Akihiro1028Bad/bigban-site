/**
 * 記事本文の「消えた要素チェック」。
 *
 * 書き直し前(公開中ページ or 旧 bodyHtml)と書き直し後(新 bodyHtml)を比べ、
 * 旧版にあって新版で消えたリンク・画像・見出し・表・埋め込み・注記ボックスを列挙する。
 * 書き直しで予約ボタンや表を黙って落とす事故を、AI の目視ではなく機械で止めるためのもの。
 *
 * 新本文(bodyHtml の断片)はサイトと同じサニタイザ(STRICT)を通してから数える。
 * 相対リンクや生の iframe のように、書いても公開ページに出ないものを「ある」と数えないため。
 * 公開ページはレンダラーが画像 URL にクエリを足し、埋め込みトークンを iframe に展開するため、
 * 照合キーはその差を吸収する形に正規化する。
 */

import { sanitizeNewsHtml, STRICT_HTML_CONFIG } from "../../src/lib/news/sanitize";

const BODY_SELECTOR = '[data-testid="news-body"]';
const EMBED_SHELL_SELECTOR = '[data-testid="embed-shell"]';
const SITE_HOSTS = new Set(["thepicklebang.com", "www.thepicklebang.com"]);
const HEADING_SELECTOR = "h2, h3";
const ASIDE_KINDS = ["note", "caution"] as const;

export interface LinkItem {
  href: string;
  text: string;
  isCta: boolean;
}

export interface ImageItem {
  src: string;
  alt: string;
}

export interface HeadingItem {
  level: number;
  text: string;
}

export interface AsideChange {
  kind: string;
  before: number;
  after: number;
}

export interface BodyDiff {
  missing: {
    links: LinkItem[];
    images: ImageItem[];
    headings: HeadingItem[];
    tables: string[];
    embeds: string[];
    asides: AsideChange[];
  };
  missingCount: number;
  added: { links: number; images: number; headings: number; tables: number; embeds: number };
}

interface Elements {
  links: LinkItem[];
  images: ImageItem[];
  headings: HeadingItem[];
  tables: string[];
  embeds: string[];
  asides: Map<string, number>;
}

export interface BodyRootOptions {
  /** true なら本文コンテナの無い入力(URL 間違い・空記事)をエラーにする。公開ページ URL 用。 */
  requireContainer?: boolean;
}

/**
 * 公開ページ全体なら本文コンテナを返す(表示済みなのでそのまま)。
 * 本文の断片ならサイトと同じサニタイザを通したものを返す。
 */
export function toBodyRoot(
  html: string,
  parse: (html: string) => Document,
  options: BodyRootOptions = {},
): ParentNode {
  const container = parse(html).querySelector(BODY_SELECTOR);
  if (container) return container;
  if (options.requireContainer) {
    throw new Error("記事本文(news-body)が見つかりません。記事ページの URL か確認してください");
  }
  return parse(sanitizeNewsHtml(html, STRICT_HTML_CONFIG));
}

function squash(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function stripQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

function stripTrailingSlash(path: string): string {
  return path.replace(/(.)\/$/, "$1");
}

function normalizeHref(href: string): string {
  try {
    const url = new URL(href);
    if (!url.protocol.startsWith("http")) return href;
    const path = stripTrailingSlash(url.pathname) + url.search + url.hash;
    return SITE_HOSTS.has(url.hostname) ? path : url.origin + path;
  } catch {
    return stripTrailingSlash(href);
  }
}

function embedKeyFromIframe(src: string): string {
  const youtube = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
  if (youtube) return `youtube:${youtube[1]}`;
  const instagram = src.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/);
  if (instagram) return `instagram:${instagram[1]}`;
  return stripQuery(src);
}

/** 表の識別名。thead の見出し、無ければ1行目のセル(行見出しの文言変更で別の表扱いにしない)。 */
function tableKey(table: Element): string {
  const headRow = table.querySelector("thead tr") ?? table.querySelector("tr");
  const cells = headRow ? Array.from(headRow.querySelectorAll("th, td")) : [];
  return cells.map((cell) => squash(cell.textContent)).join(" / ");
}

function asideKind(aside: Element): string {
  return ASIDE_KINDS.find((kind) => aside.classList.contains(kind)) ?? "other";
}

/** 属性を持つ要素だけを、その属性値と組にして返す。 */
function withAttr(root: ParentNode, selector: string, name: string): Array<[Element, string]> {
  return Array.from(root.querySelectorAll(selector)).flatMap((el) => {
    const value = el.getAttribute(name);
    return value === null ? [] : [[el, value] as [Element, string]];
  });
}

function embedTokens(root: ParentNode): string[] {
  return withAttr(root, "a.embed", "data-embed-provider").flatMap(([el, provider]) => {
    const id = el.getAttribute("data-embed-id");
    return id === null ? [] : [`${provider}:${id}`];
  });
}

function extractElements(root: ParentNode): Elements {
  // 埋め込みの代替リンク(sr-only)は埋め込み側で数えるので、リンクには含めない。
  const links = withAttr(root, "a", "href")
    .filter(([a]) => a.closest(EMBED_SHELL_SELECTOR) === null)
    .map(([a, href]) => ({
    href: normalizeHref(href),
    text: squash(a.textContent),
    isCta: a.classList.contains("cta") || a.classList.contains("cta--ghost"),
  }));
  const images = withAttr(root, "img", "src").map(([img, src]) => ({
    src: stripQuery(src),
    alt: squash(img.getAttribute("alt")),
  }));
  const headings = Array.from(root.querySelectorAll(HEADING_SELECTOR), (h) => ({
    level: Number(h.tagName.slice(1)),
    text: squash(h.textContent),
  }));
  const tables = Array.from(root.querySelectorAll("table"), tableKey);
  const iframes = withAttr(root, "iframe", "src").map(([, src]) => embedKeyFromIframe(src));
  const asides = new Map<string, number>();
  root.querySelectorAll("aside").forEach((aside) => {
    const kind = asideKind(aside);
    asides.set(kind, (asides.get(kind) ?? 0) + 1);
  });
  return { links, images, headings, tables, embeds: [...embedTokens(root), ...iframes], asides };
}

/** before にあって after に無いもの(同じキーの個数差を含む)を before の順で返す。 */
function subtract<T>(before: T[], after: T[], key: (item: T) => string): T[] {
  const remaining = new Map<string, number>();
  after.forEach((item) => remaining.set(key(item), (remaining.get(key(item)) ?? 0) + 1));
  return before.filter((item) => {
    const count = remaining.get(key(item)) ?? 0;
    if (count === 0) return true;
    remaining.set(key(item), count - 1);
    return false;
  });
}

function asideChanges(before: Map<string, number>, after: Map<string, number>): AsideChange[] {
  return Array.from(before, ([kind, count]) => ({ kind, before: count, after: after.get(kind) ?? 0 })).filter(
    (change) => change.after < change.before,
  );
}

const identity = (value: string): string => value;
// CTA ボタンと同じ URL の普通のリンクは別物として数える(ボタンの格下げを見逃さない)。
const linkKey = (link: LinkItem): string => `${link.isCta ? "cta" : "link"} ${link.href}`;
const imageKey = (image: ImageItem): string => image.src;
const headingKey = (heading: HeadingItem): string => `${heading.level}:${heading.text}`;

export function diffBodies(oldRoot: ParentNode, newRoot: ParentNode): BodyDiff {
  const before = extractElements(oldRoot);
  const after = extractElements(newRoot);
  const missing = {
    links: subtract(before.links, after.links, linkKey),
    images: subtract(before.images, after.images, imageKey),
    headings: subtract(before.headings, after.headings, headingKey),
    tables: subtract(before.tables, after.tables, identity),
    embeds: subtract(before.embeds, after.embeds, identity),
    asides: asideChanges(before.asides, after.asides),
  };
  const missingCount =
    missing.links.length +
    missing.images.length +
    missing.headings.length +
    missing.tables.length +
    missing.embeds.length +
    missing.asides.reduce((sum, change) => sum + change.before - change.after, 0);
  const added = {
    links: subtract(after.links, before.links, linkKey).length,
    images: subtract(after.images, before.images, imageKey).length,
    headings: subtract(after.headings, before.headings, headingKey).length,
    tables: subtract(after.tables, before.tables, identity).length,
    embeds: subtract(after.embeds, before.embeds, identity).length,
  };
  return { missing, missingCount, added };
}

function orNone(text: string): string {
  return text === "" ? "(なし)" : text;
}

function section(title: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : [``, `## ${title}`, ...lines];
}

export function formatReport(diff: BodyDiff): string {
  if (diff.missingCount === 0) return "消えた要素はありません。\n";
  const { missing, added } = diff;
  const lines = [
    `消えた要素: ${diff.missingCount}件(意図した削除かどうかをオーナーに確認すること)`,
    ...section(
      "リンク",
      missing.links.map((link) => `- ${link.isCta ? "[CTA] " : ""}${orNone(link.text)} → ${link.href}`),
    ),
    ...section("見出し", missing.headings.map((heading) => `- h${heading.level} ${heading.text}`)),
    ...section("画像", missing.images.map((image) => `- ${orNone(image.alt)} (${image.src})`)),
    ...section("表", missing.tables.map((table) => `- ${table}`)),
    ...section("埋め込み", missing.embeds.map((embed) => `- ${embed}`)),
    ...section("注記ボックス", missing.asides.map((change) => `- ${change.kind}: ${change.before} → ${change.after}`)),
    ``,
    `増えた要素: リンク${added.links} / 画像${added.images} / 見出し${added.headings} / 表${added.tables} / 埋め込み${added.embeds}`,
  ];
  return `${lines.join("\n")}\n`;
}
