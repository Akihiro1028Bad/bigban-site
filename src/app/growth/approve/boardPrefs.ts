/**
 * 承認画面の表示プリファレンス＆操作補助(#109)の純ロジック。DOM 非依存。
 *
 * 密度トグル / コマンドパレットの絞り込み / 一括選択の集合操作 を提供する。
 * localStorage / dialog の結線は ApproveClient 側。
 */

export type Density = "comfortable" | "compact";

/** localStorage 等の生値 → 密度。compact 以外は comfortable に倒す。 */
export function parseDensity(raw: string | null): Density {
  return raw === "compact" ? "compact" : "comfortable";
}

/** 密度を切り替える。 */
export function nextDensity(density: Density): Density {
  return density === "comfortable" ? "compact" : "comfortable";
}

/** 密度 → リストの行間クラス。 */
export function densityListClass(density: Density): string {
  return density === "compact" ? "space-y-1" : "space-y-2";
}

/** タイトル部分一致でアイテムを絞り込む(コマンドパレット/検索)。空クエリは全件。 */
export function filterByQuery<T extends { title: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...items];
  return items.filter((item) => item.title.toLowerCase().includes(q));
}

/** 選択集合に id をトグルした新しい集合を返す(不変)。 */
export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** 選択のうち、まだ盤に存在する id だけ残す(取得更新で消えた選択を掃除)。 */
export function pruneSelection(
  selected: ReadonlySet<string>,
  presentIds: readonly string[],
): Set<string> {
  const present = new Set(presentIds);
  return new Set([...selected].filter((id) => present.has(id)));
}
