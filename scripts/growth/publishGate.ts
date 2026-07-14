/**
 * 下書き投入直前の品質ゲート(P1-B 案B)。DOM/IO 非依存の純ロジック。
 *
 * 既存の機械チェック `src/app/growth/approve/draftQuality.ts`(#128)を**単一ソース**として
 * 共有し、その block(赤=公開不可)が1つでもあれば投入を止める。
 * 承認画面UIが「公開」をブロックするのと同じ基準を、生成パイプライン(`publish-draft-cli.ts`)の
 * **投入前**にも適用し、不合格の下書きを黙って作らないようにする。
 *
 * block 例: §5 AI免責文の欠落 / 明確な禁止表現 / 禁止HTML・危険属性 /
 *           §15 壊れた内部リンク(knownNewsPaths を渡したときのみ)。料金・徒歩分数は warn。
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
  confirmedFacts?: readonly string[];
}

export interface PublishGateResult {
  /** block が1つも無ければ true(投入可)。 */
  ok: boolean;
  /** block 該当の理由(ラベル: 値(ヒント))の配列。ok のときは空。 */
  blockReasons: string[];
}

export interface RegateInput {
  before: string;
  after: string;
  title: string;
  articleType?: ArticleType;
  knownNewsPaths?: ReadonlySet<string>;
  confirmedFacts?: readonly string[];
}

export interface RegateResult {
  newBlocks: string[];
  ok: boolean;
}

/**
 * quality-gate の文字数閾値軸を payload から解決する。
 * microCMS の articleType(select)とは別軸のため、明示 cornerstone フラグだけを採用する。
 */
export function resolveGateArticleType(payload: unknown): ArticleType {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "cornerstone" in payload &&
    payload.cornerstone === true
  ) {
    return "cornerstone";
  }
  return "single";
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
    confirmedFacts: input.confirmedFacts,
  });
  const blockReasons = checks
    .filter((c) => c.level === "block")
    .map((c) => `${c.label}: ${c.value}`);
  return { ok: blockReasons.length === 0, blockReasons };
}

/** 公開直前の再ゲート理由。block が無ければ null。 */
export function publishGateReason(
  bodyHtml: string,
  title: string,
  articleType?: ArticleType,
  knownNewsPaths?: ReadonlySet<string>,
  confirmedFacts?: readonly string[]
): string | null {
  const result = evaluatePublishGate({ bodyHtml, title, articleType, knownNewsPaths, confirmedFacts });
  if (result.ok) return null;
  return result.blockReasons.join(" / ");
}

/**
 * AI 修正適用時の再ゲート。before に既に存在した block は修正機会を奪わないため許容し、
 * after で新規発生した block だけを止める。
 */
export function evaluateRegate(input: RegateInput): RegateResult {
  const before = evaluatePublishGate({
    bodyHtml: input.before,
    title: input.title,
    articleType: input.articleType,
    knownNewsPaths: input.knownNewsPaths,
    confirmedFacts: input.confirmedFacts,
  });
  const after = evaluatePublishGate({
    bodyHtml: input.after,
    title: input.title,
    articleType: input.articleType,
    knownNewsPaths: input.knownNewsPaths,
    confirmedFacts: input.confirmedFacts,
  });
  const existing = new Set(before.blockReasons);
  const newBlocks = after.blockReasons.filter((reason) => !existing.has(reason));
  return { newBlocks, ok: newBlocks.length === 0 };
}
