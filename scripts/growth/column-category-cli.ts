/**
 * 記事タイプ → コラムカテゴリ(content ID)を**正典から解決**する薄い入口(#222)。
 *
 *   npm run growth:column-category -- 資産            # 既定マッピングを解決 → rules
 *   npm run growth:column-category -- 資産 improve    # コラムカテゴリ上書き優先 → improve
 *   npm run growth:column-category                     # 正典マッピング表を一覧表示
 *
 * 下書きオーケストレーターが `payload.category` を決める際にこれを使う。マッピングは
 * `columnCategory.ts` の `ARTICLE_TYPE_TO_CATEGORY` を単一ソースとし、プロンプト側に
 * 手書きの表を持たない(二重管理・転記ズレの排除 = #222)。
 *
 * 優先順位(resolveColumnCategoryId): Notion 任意プロパティ `コラムカテゴリ`(第2引数) >
 * 記事タイプからの既定マッピング。解決できなければ何も出力しない(= category 省略・欠落耐性)。
 * 純ロジックは columnCategory.ts でテスト済み。薄い I/O 配線のためカバレッジ対象外。
 */

import {
  ARTICLE_TYPE_TO_CATEGORY,
  resolveColumnCategoryId,
} from "./columnCategory";

const [articleType, override] = process.argv.slice(2);

if (!articleType) {
  // 引数なしは正典表を一覧表示する。
  process.stdout.write("記事タイプ→コラムカテゴリ 既定マッピング(正典・単一ソース):\n");
  for (const [ja, id] of Object.entries(ARTICLE_TYPE_TO_CATEGORY)) {
    process.stdout.write(`  ${ja}→${id}\n`);
  }
  process.stdout.write(
    "※ Notion `コラムカテゴリ`(任意)があればそれを優先。無ければ上表で解決。\n",
  );
  process.exit(0);
}

const resolved = resolveColumnCategoryId(articleType, override);
if (resolved) {
  process.stdout.write(`${resolved}\n`);
} else {
  // 解決不能は category 省略の合図。沈黙させず stderr に理由を出す。
  process.stderr.write(
    `記事タイプ「${articleType}」から category を解決できません(category を省略してください)。\n`,
  );
  process.exitCode = 1;
}
