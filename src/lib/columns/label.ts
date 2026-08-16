/**
 * コラム面のロケール別ラベル。
 * 一覧のメタ title・一覧/詳細のパンくずで共用し、表記の分岐を1か所に閉じる。
 *
 * メッセージの `Columns.heading` (en では表示用の全大文字 "COLUMN") とは
 * 意図的に別物にしている。パンくず・title は既存の他面 ("HYROX" / "News" /
 * "About" / "Reserve") に揃えたセンテンスケースを使う。
 */
export function columnsLabel(locale: string): string {
  return locale === "ja" ? "コラム" : "Column";
}
