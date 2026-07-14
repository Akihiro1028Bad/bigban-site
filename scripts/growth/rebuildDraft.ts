/** 構成からの再生成で、既存microCMS下書きの決定的IDを引き継ぐ純ロジック。 */

import { slugToContentId } from "./content";
import { chunkRichText, REBUILD_SOURCE_ID_PROP, type NotionPage } from "./notion";

/** Notionの分割rich_textから退避済みcontentIdを読む。 */
export function rebuildSourceIdOf(page: NotionPage): string {
  const value = page.properties[REBUILD_SOURCE_ID_PROP] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((part) => part.plain_text ?? "").join("").trim();
}

/** 退避した既存contentIdを検証し、空なら通常生成として扱う。 */
export function validatedRebuildSourceId(sourceId: string): string | undefined {
  if (sourceId === "") return undefined;
  if (slugToContentId(sourceId) !== sourceId) {
    throw new Error(`再生成元下書きIDが不正です: ${sourceId}`);
  }
  return sourceId;
}

/** 再生成payloadのslugを、microCMS既存下書きから読み直した元slugへ固定する。 */
export function preserveRebuildSourceSlug(
  payload: Record<string, unknown>,
  sourceSlug: string
): Record<string, unknown> {
  return { ...payload, slug: sourceSlug };
}

/** 再生成が完了したら退避IDを空にするNotion更新値。 */
export function buildRebuildSourceClearProps(): Record<string, unknown> {
  return { [REBUILD_SOURCE_ID_PROP]: { rich_text: chunkRichText("") } };
}
