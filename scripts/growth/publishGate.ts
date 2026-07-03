/**
 * 下書き投入直前の品質ゲート(P1-B 案B)。DOM/IO 非依存の純ロジック。
 *
 * 既存の機械チェック `src/app/growth/approve/draftQuality.ts`(#128)を**単一ソース**として
 * 共有し、その block(赤=公開不可)が1つでもあれば投入を止める。
 * 承認画面UIが「公開」をブロックするのと同じ基準を、生成パイプライン(`publish-draft-cli.ts`)の
 * **投入前**にも適用し、不合格の下書きを黙って作らないようにする。
 *
 * block 例: §5 AI免責文の欠落 / §13 doNotWrite(未確定=料金・所要分)の断定 /
 *           §15 壊れた内部リンク(knownNewsPaths を渡したときのみ)。
 */

import {
  draftQuality,
  type ArticleType,
} from "../../src/app/growth/approve/draftQuality";

export interface PublishGateInput {
  /** 下書き本文 HTML(画像置換前で可。block 判定は本文テキストとリンクに依存)。 */
  bodyHtml: string;
  /** 記事タイトル。 */
  title: string;
  /** 記事タイプ(未指定は single)。 */
  articleType?: ArticleType;
  /** 既知の記事リンクパス。渡すと壊れた内部リンクを block にする。 */
  knownNewsPaths?: ReadonlySet<string>;
}

export interface PublishGateResult {
  /** block が1つも無ければ true(投入可)。 */
  ok: boolean;
  /** block 該当の理由(ラベル: 値(ヒント))の配列。ok のときは空。 */
  blockReasons: string[];
}

/**
 * 下書きを投入してよいかを判定する。draftQuality の block 項目だけを抽出して返す。
 * 本文(プレーン)は bodyHtml からタグ除去で得るため body は渡さない(投入スペックは HTML のみ)。
 * 理由文字列はラベルと値で組み立てる(draftQuality の block は値に不合格内容を持つ)。
 */
export function evaluatePublishGate(input: PublishGateInput): PublishGateResult {
  const checks = draftQuality({
    bodyHtml: input.bodyHtml,
    body: "",
    title: input.title,
    articleType: input.articleType,
    knownNewsPaths: input.knownNewsPaths,
  });
  const blockReasons = checks
    .filter((c) => c.level === "block")
    .map((c) => `${c.label}: ${c.value}`);
  return { ok: blockReasons.length === 0, blockReasons };
}
