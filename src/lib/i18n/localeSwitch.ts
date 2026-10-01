export type LocaleSwitchSection = "news" | "columns";

export interface LocaleSwitchInput {
  section: LocaleSwitchSection;
  /** 相手言語に同じ slug の記事があるか。 */
  hasCounterpart: boolean;
  /** 相手言語でコラム一覧を出すか(英語コラム0件のとき false)。 */
  counterpartShowsColumns: boolean;
}

/**
 * 記事詳細で言語切替を押したときの行き先(ロケールなしのパス)を返す。
 * 相手言語版があれば undefined(= 現在のパスのまま言語だけ切り替える)。
 * 無ければ、中身のある相手言語の一覧へ逃がして 404 を作らない。
 */
export function resolveLocaleSwitchPath({
  section,
  hasCounterpart,
  counterpartShowsColumns,
}: LocaleSwitchInput): string | undefined {
  if (hasCounterpart) return undefined;
  if (section === "columns" && counterpartShowsColumns) return "/columns";
  return "/news";
}
