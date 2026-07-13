/**
 * 現構成案と AI 修正案をセクション単位で突き合わせ、選択反映できるようにする純ロジック。
 * 分割・再結合は outline.ts を唯一の権威として利用する。
 */

import {
  parseOutlineSections,
  serializeOutlineSections,
} from "./outline";
import type { OutlineSection } from "./outline";

export type OutlineAlignItem =
  | { id: number; kind: "unchanged"; before: OutlineSection; after: OutlineSection }
  | { id: number; kind: "modified"; before: OutlineSection; after: OutlineSection }
  | { id: number; kind: "added"; after: OutlineSection }
  | { id: number; kind: "removed"; before: OutlineSection };

type AlignItemWithoutId =
  | { kind: "unchanged"; before: OutlineSection; after: OutlineSection }
  | { kind: "modified"; before: OutlineSection; after: OutlineSection }
  | { kind: "added"; after: OutlineSection }
  | { kind: "removed"; before: OutlineSection };

/** セクション 1 件を構成案テキストへ正規化する薄いヘルパ。 */
export function sectionText(section: OutlineSection): string {
  return serializeOutlineSections([section]);
}

/** 見出しの完全一致を基準に、順序を保つ最長共通部分列の添字組を返す。 */
function headingLcs(before: readonly OutlineSection[], after: readonly OutlineSection[]): [number, number][] {
  const lengths = Array.from({ length: before.length + 1 }, () =>
    Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = before[i].heading.trim() === after[j].heading.trim()
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i].heading.trim() === after[j].heading.trim()) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/** LCS アンカーの間にある削除・追加候補を、出現順に変更/削除/追加へ変換する。 */
function alignGap(
  before: readonly OutlineSection[],
  after: readonly OutlineSection[],
): AlignItemWithoutId[] {
  const items: AlignItemWithoutId[] = [];
  const paired = Math.min(before.length, after.length);
  for (let i = 0; i < paired; i += 1) {
    items.push({ kind: "modified", before: before[i], after: after[i] });
  }
  for (let i = paired; i < before.length; i += 1) items.push({ kind: "removed", before: before[i] });
  for (let i = paired; i < after.length; i += 1) items.push({ kind: "added", after: after[i] });
  return items;
}

/**
 * 構成案と修正案を見出し LCS で対応付ける。
 * 対応付けできない空構成案は null とし、呼び出し元の全文差分表示へ委ねる。
 */
export function alignOutlineSections(currentText: string, proposalText: string): OutlineAlignItem[] | null {
  const before = parseOutlineSections(currentText);
  const after = parseOutlineSections(proposalText);
  if (before.length === 0 || after.length === 0) return null;

  const pairs = headingLcs(before, after);
  const items: AlignItemWithoutId[] = [];
  let beforeStart = 0;
  let afterStart = 0;
  for (const [beforeIndex, afterIndex] of pairs) {
    items.push(...alignGap(before.slice(beforeStart, beforeIndex), after.slice(afterStart, afterIndex)));
    items.push(
      sectionText(before[beforeIndex]) === sectionText(after[afterIndex])
        ? { kind: "unchanged", before: before[beforeIndex], after: after[afterIndex] }
        : { kind: "modified", before: before[beforeIndex], after: after[afterIndex] },
    );
    beforeStart = beforeIndex + 1;
    afterStart = afterIndex + 1;
  }
  items.push(...alignGap(before.slice(beforeStart), after.slice(afterStart)));
  const removedHeadings = new Set(
    items
      .filter((item): item is Extract<AlignItemWithoutId, { kind: "removed" }> => item.kind === "removed")
      .map((item) => item.before.heading.trim()),
  );
  const hasMovedHeading = items.some(
    (item) => item.kind === "added" && removedHeadings.has(item.after.heading.trim()),
  );
  if (hasMovedHeading) return null;
  return items.map((item, id) => ({ ...item, id }) as OutlineAlignItem);
}

/** 選択された差分だけを反映して、正規化済み構成案テキストを返す。 */
export function mergeOutlineSelection(
  items: readonly OutlineAlignItem[],
  selectedIds: ReadonlySet<number>,
): string {
  const sections: OutlineSection[] = [];
  for (const item of items) {
    if (item.kind === "unchanged") sections.push(item.before);
    else if (item.kind === "modified") sections.push(selectedIds.has(item.id) ? item.after : item.before);
    else if (item.kind === "added") {
      if (selectedIds.has(item.id)) sections.push(item.after);
    } else if (!selectedIds.has(item.id)) {
      sections.push(item.before);
    }
  }
  return serializeOutlineSections(sections);
}
