/**
 * ニュース面のロケール別ラベル。
 * 一覧のメタ title・一覧/詳細のパンくずで共用し、表記の分岐を1か所に閉じる
 * (コラム側の columnsLabel と対になる)。
 *
 * パンくずは従来 ja でも "News" 固定だったため、見出し・title と食い違って
 * いた。表示ラベルに合わせる。
 */
export function newsLabel(locale: string): string {
  return locale === "ja" ? "ニュース" : "News";
}
