import type { NotionPage } from "./notion";

export const INITIATIVES_AUTO_STATUS_PROP = "ステータス";
export const INITIATIVES_AUTO_TARGET_STATUS = "承認";

function selectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

export function isInitiativesAutoTarget(page: NotionPage): boolean {
  return selectName(page, INITIATIVES_AUTO_STATUS_PROP) === INITIATIVES_AUTO_TARGET_STATUS;
}

export function countInitiativesAutoTargets(pages: readonly NotionPage[]): number {
  return pages.filter(isInitiativesAutoTarget).length;
}

export function initiativesAutoQueryFilter(): unknown {
  return {
    property: INITIATIVES_AUTO_STATUS_PROP,
    select: { equals: INITIATIVES_AUTO_TARGET_STATUS },
  };
}
