import { DISCLAIMER_MARK } from "../../src/app/growth/approve/draftQuality";

import { splitTopLevelBlocks } from "./decorate";

interface Range {
  start: number;
  end: number;
}

function disclaimerText(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
}

function containsDisclaimer(html: string): boolean {
  return disclaimerText(html).includes(DISCLAIMER_MARK);
}

function removeRanges(input: string, ranges: readonly Range[]): string {
  if (ranges.length === 0) return input;
  const sorted = mergeRanges([...ranges].sort((a, b) => a.start - b.start));
  let cursor = 0;
  let output = "";
  for (const range of sorted) {
    output += input.slice(cursor, range.start);
    cursor = range.end;
  }
  return output + input.slice(cursor);
}

function mergeRanges(sortedRanges: readonly Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of sortedRanges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

function isCleanupWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function emptyParagraphLengthAt(input: string, index: number): number {
  const match = input.slice(index).match(/^<p>\s*<\/p>/i);
  return match?.[0].length ?? 0;
}

function emptyParagraphLengthBefore(input: string, index: number): number {
  const match = input.slice(0, index).match(/<p>\s*<\/p>$/i);
  return match?.[0].length ?? 0;
}

function expandRangeForCleanup(input: string, range: Range): Range {
  let start = range.start;
  let end = range.end;

  while (start > 0) {
    while (start > 0 && isCleanupWhitespace(input[start - 1])) {
      start -= 1;
    }
    const emptyParagraphLength = emptyParagraphLengthBefore(input, start);
    if (emptyParagraphLength === 0) break;
    start -= emptyParagraphLength;
  }

  while (end < input.length) {
    while (end < input.length && isCleanupWhitespace(input[end])) {
      end += 1;
    }
    const emptyParagraphLength = emptyParagraphLengthAt(input, end);
    if (emptyParagraphLength === 0) break;
    end += emptyParagraphLength;
  }

  return { start, end };
}

function expandRangesForCleanup(input: string, ranges: readonly Range[]): Range[] {
  return mergeRanges(ranges.map((range) => expandRangeForCleanup(input, range)).sort((a, b) => a.start - b.start));
}

function disclaimerLineRanges(text: string, offset: number): Range[] {
  const ranges: Range[] = [];
  let lineStart = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const isEnd = index === text.length;
    if (!isEnd && text[index] !== "\n") continue;
    const lineEnd = isEnd ? index : index + 1;
    const line = text.slice(lineStart, lineEnd);
    if (line.includes(DISCLAIMER_MARK)) {
      ranges.push({ start: offset + lineStart, end: offset + lineEnd });
    }
    lineStart = index + 1;
  }
  return ranges;
}

function nakedDisclaimerRanges(html: string): Range[] {
  const blocks = splitTopLevelBlocks(html);
  const ranges: Range[] = [];
  let cursor = 0;
  for (const block of blocks) {
    if (cursor < block.start) {
      ranges.push(...disclaimerLineRanges(html.slice(cursor, block.start), cursor));
    }
    cursor = block.end;
  }
  if (cursor < html.length) {
    ranges.push(...disclaimerLineRanges(html.slice(cursor), cursor));
  }
  return ranges;
}

export function removeAiDisclaimer(bodyHtml: string): { body: string; removed: boolean } {
  if (!bodyHtml.includes(DISCLAIMER_MARK)) {
    return { body: bodyHtml, removed: false };
  }

  const blocks = splitTopLevelBlocks(bodyHtml);
  const blockRanges = blocks
    .filter((block) => containsDisclaimer(block.html))
    .map((block) => ({ start: block.start, end: block.end }));

  const withoutBlocks = removeRanges(bodyHtml, expandRangesForCleanup(bodyHtml, blockRanges));
  const nakedRanges = nakedDisclaimerRanges(withoutBlocks);
  const removed = blockRanges.length > 0 || nakedRanges.length > 0;
  if (!removed) {
    return { body: bodyHtml, removed: false };
  }

  return {
    body: removeRanges(withoutBlocks, expandRangesForCleanup(withoutBlocks, nakedRanges)),
    removed: true,
  };
}
