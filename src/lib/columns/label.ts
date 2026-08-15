/**
 * コラム面のロケール別ラベル。
 * 一覧のメタ title・一覧/詳細のパンくずで共用し、表記の分岐を1か所に閉じる。
 */
export function columnsLabel(locale: string): string {
  return locale === "ja" ? "コラム" : "Column";
}
