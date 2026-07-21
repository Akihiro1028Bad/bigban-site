import { Parser } from "htmlparser2";

export const FACT_BINDING_VERSION = 1;

export interface FactBindingMetadata {
  version: number;
  bodyHash: string;
}

export interface StoredFactReference {
  factId: string;
  excerpt: string;
  container: "p" | "li" | "th" | "td";
  containerIndex: number;
  sectionPath?: string;
  containerTextHash?: string;
  containerMatchCount?: number;
}

/** Browser と Node の双方で同じ値になる、本文照合専用の決定的 hash。 */
export function bindingBodyHash(bodyHtml: string): string {
  let high = 0x811c9dc5;
  let low = 0x9e3779b9;
  for (let index = 0; index < bodyHtml.length; index += 1) {
    const code = bodyHtml.charCodeAt(index);
    high = Math.imul(high ^ code, 0x01000193) >>> 0;
    low = Math.imul(low ^ code, 0x85ebca6b) >>> 0;
  }
  return `fnv1a64:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

function normalizedBindingText(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

export function bindingContainerTextHash(value: string): string {
  return bindingBodyHash(normalizedBindingText(value));
}

interface ParsedContainer {
  name: StoredFactReference["container"];
  index: number;
  sectionPath: string;
  text: string;
}

interface ParsedBindingBody {
  containers: ParsedContainer[];
  unboundBlocks: ParsedUnboundBlock[];
  rootText: string;
}

type UnboundBlockName = "h2" | "h3" | "h4" | "aside" | "blockquote" | "figure" | "figcaption" | "caption";

interface ParsedUnboundBlock {
  name: UnboundBlockName;
  text: string;
}

const CONTAINERS = new Set<StoredFactReference["container"]>(["p", "li", "th", "td"]);
const UNBOUND_BLOCKS = new Set<UnboundBlockName>([
  "h2", "h3", "h4", "aside", "blockquote", "figure", "figcaption", "caption",
]);
const HEADING_BLOCKS = new Set<UnboundBlockName>(["h2", "h3", "h4"]);
const ROOT_TEXT_BOUNDARIES = new Set([
  "h2", "h3", "h4", "p", "ul", "ol", "li", "blockquote", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "aside",
]);

function parseBindingBody(bodyHtml: string): ParsedBindingBody {
  const containers: ParsedContainer[] = [];
  const containerStack: ParsedContainer[] = [];
  const unboundBlocks: ParsedUnboundBlock[] = [];
  const unboundBlockStack: ParsedUnboundBlock[] = [];
  const counts: Record<StoredFactReference["container"], number> = { p: 0, li: 0, th: 0, td: 0 };
  const headings: string[] = [];
  const headingTexts: string[] = [];
  let rootText = "";
  const parser = new Parser({
    onopentag(name) {
      if (ROOT_TEXT_BOUNDARIES.has(name)) rootText += "\u0000";
      if (name === "h2" || name === "h3") headingTexts.push("");
      if (UNBOUND_BLOCKS.has(name as UnboundBlockName)) {
        unboundBlockStack.push({ name: name as UnboundBlockName, text: "" });
      }
      if (CONTAINERS.has(name as StoredFactReference["container"])) {
        const containerName = name as StoredFactReference["container"];
        const container: ParsedContainer = {
          name: containerName,
          index: ++counts[containerName],
          sectionPath: headings.filter(Boolean).join(" > "),
          text: "",
        };
        containers.push(container);
        containerStack.push(container);
      }
    },
    ontext(text) {
      if (headingTexts.length > 0) headingTexts[headingTexts.length - 1] += text;
      const container = containerStack.at(-1);
      if (container) {
        container.text += text;
        return;
      }
      const unboundBlock = unboundBlockStack.at(-1);
      if (unboundBlock) unboundBlock.text += text;
      else rootText += text;
    },
    onclosetag(name) {
      if (name === "h2" || name === "h3") {
        const text = headingTexts.pop()!.trim();
        if (name === "h2") headings.splice(0, headings.length, text);
        else headings.splice(1, headings.length - 1, text);
      }
      if (CONTAINERS.has(name as StoredFactReference["container"])) containerStack.pop();
      if (UNBOUND_BLOCKS.has(name as UnboundBlockName)) {
        const block = unboundBlockStack.pop()!;
        if (block.text.trim()) unboundBlocks.push(block);
      }
      if (ROOT_TEXT_BOUNDARIES.has(name)) rootText += "\u0000";
    },
  }, { decodeEntities: true, lowerCaseTags: true });
  parser.end(bodyHtml);
  return { containers, unboundBlocks, rootText };
}

function containerIncludesExcerpt(container: ParsedContainer, excerpt: string): boolean {
  return normalizedBindingText(container.text).includes(normalizedBindingText(excerpt));
}

const NUMBER_SOURCE = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const UNBOUND_FACT_PATTERNS = [
  /(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{4}年\d{1,2}月(?:\d{1,2}日)?|\d{1,2}月\d{1,2}日)/,
  new RegExp(`(?:[￥¥]${NUMBER_SOURCE}|${NUMBER_SOURCE}(?:万|千)?円|入会金|参加費|月額|無料|有料)`),
  new RegExp(`(?:\d{1,2}:\d{2}|(?:午前|午後)?\d{1,2}時(?:\d{1,2}分)?|徒歩${NUMBER_SOURCE}分|${NUMBER_SOURCE}(?:時間|分|秒))`),
  new RegExp(`${NUMBER_SOURCE}(?:%|％|割|人|名|件|面|本|台|回|km|m|kg|g|日|週|か月|年|月|倍|位)`, "i"),
  /最安|最高|最低|最大|最小|最多|最短|No\.?1|平均|中央値|割合|調査では/i,
  /血圧を下げ(?:る|ます)|怪我を予防(?:する|します)|心肺機能が改善(?:する|します)|治(?:る|ります)|痩せ(?:る|ます)/,
  /[一-龯々ぁ-んァ-ヶーA-Za-z0-9]{2,}(?:駅|体育館|クラブ|協会|連盟)/,
] as const;
const UNBOUND_ASCII_PROPER_NOUN_PATTERN = /\b(?=[A-Za-z0-9]*[A-Z])[A-Za-z][A-Za-z0-9]{2,}\b/;

function containsUnboundFactClaim(value: string): boolean {
  const normalized = normalizedBindingText(value);
  return UNBOUND_FACT_PATTERNS.some((pattern) => pattern.test(normalized))
    || UNBOUND_ASCII_PROPER_NOUN_PATTERN.test(normalized);
}

function containsUnboundHeadingFactClaim(value: string): boolean {
  const normalized = normalizedBindingText(value);
  return UNBOUND_FACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function removeBoundExcerpts(
  container: ParsedContainer,
  references: readonly StoredFactReference[],
): string | null {
  let remaining = normalizedBindingText(container.text);
  const excerpts = [...new Set(references.map((reference) => normalizedBindingText(reference.excerpt)))];
  for (const excerpt of excerpts) {
    const index = remaining.indexOf(excerpt);
    if (index < 0) return null;
    remaining = remaining.slice(0, index) + remaining.slice(index + excerpt.length);
  }
  return remaining;
}

/** 生成時にfactへ結合した要素内に、同じ抜粋が現在も残っているかを照合する。 */
export function bindingReferencesMatchBody(
  bodyHtml: string,
  references: readonly StoredFactReference[],
): boolean {
  if (references.length === 0) return false;
  const { containers, unboundBlocks, rootText } = parseBindingBody(bodyHtml);
  const matchedReferences = new Map<ParsedContainer, StoredFactReference[]>();
  for (const reference of references) {
    const exact = containers.find(
      (container) => container.name === reference.container && container.index === reference.containerIndex,
    );
    let matched = exact && containerIncludesExcerpt(exact, reference.excerpt) ? exact : undefined;
    if (!matched) {
      if (
        reference.containerMatchCount !== 1
        || reference.containerTextHash === undefined
        || reference.sectionPath === undefined
      ) {
        return false;
      }
      const relocated = containers.filter(
        (container) =>
          container.name === reference.container
          && container.sectionPath === reference.sectionPath
          && bindingContainerTextHash(container.text) === reference.containerTextHash
          && containerIncludesExcerpt(container, reference.excerpt),
      );
      if (relocated.length !== 1) return false;
      [matched] = relocated;
    }
    const matchedForContainer = matchedReferences.get(matched) ?? [];
    matchedForContainer.push(reference);
    matchedReferences.set(matched, matchedForContainer);
  }
  if (containsUnboundFactClaim(rootText)) return false;
  if (unboundBlocks.some((block) =>
    HEADING_BLOCKS.has(block.name)
      ? containsUnboundHeadingFactClaim(block.text)
      : containsUnboundFactClaim(block.text)
  )) return false;
  return containers.every((container) => {
    const remaining = removeBoundExcerpts(container, matchedReferences.get(container) ?? []);
    return remaining !== null && !containsUnboundFactClaim(remaining);
  });
}
