import type { NotionPage } from "./notion";

export const DRAFTS_AUTO_STATUSES = ["承認", "生成中"] as const;
export const DRAFTS_AUTO_STATUS_PROP = "ステータス";
export const DRAFTS_AUTO_DRAFT_ID_PROP = "下書きID";
export const DRAFTS_AUTO_OUTLINE_PROP = "構成案";

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
  return pages.filter(isRunnableDraftsAutoTarget).length;
}

/** 構成案に最低1つのH2/H3があり、Claudeへ渡してよい行か。 */
export function isRunnableDraftsAutoTarget(page: NotionPage): boolean {
  return isDraftsAutoTarget(page) && /^#{2,3}\s+\S+/m.test(richText(page, DRAFTS_AUTO_OUTLINE_PROP));
}

/** 1 Claude セッションに渡す1件。中断再開の生成中を承認済み新規より優先する。 */
export function selectDraftsAutoTarget(pages: readonly NotionPage[]): NotionPage | null {
  const targets = pages.filter(isRunnableDraftsAutoTarget);
  return (
    targets.find((page) => selectName(page, DRAFTS_AUTO_STATUS_PROP) === "生成中") ??
    targets.find((page) => selectName(page, DRAFTS_AUTO_STATUS_PROP) === "承認") ??
    null
  );
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
