import type { NotionPage } from "./notion";

export const DRAFTS_AUTO_STATUSES = ["承認", "生成中"] as const;
export const DRAFTS_AUTO_STATUS_PROP = "ステータス";
export const DRAFTS_AUTO_DRAFT_ID_PROP = "下書きID";

function selectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function richText(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { rich_text?: { plain_text?: string }[] } | undefined;
  return (value?.rich_text ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

export function isDraftsAutoTarget(page: NotionPage): boolean {
  const status = selectName(page, DRAFTS_AUTO_STATUS_PROP);
  return DRAFTS_AUTO_STATUSES.includes(status as (typeof DRAFTS_AUTO_STATUSES)[number])
    && richText(page, DRAFTS_AUTO_DRAFT_ID_PROP) === "";
}

export function countDraftsAutoTargets(pages: readonly NotionPage[]): number {
  return pages.filter(isDraftsAutoTarget).length;
}

export function draftsAutoQueryFilter(): unknown {
  return {
    and: [
      {
        or: DRAFTS_AUTO_STATUSES.map((status) => ({
          property: DRAFTS_AUTO_STATUS_PROP,
          select: { equals: status },
        })),
      },
      { property: DRAFTS_AUTO_DRAFT_ID_PROP, rich_text: { is_empty: true } },
    ],
  };
}
