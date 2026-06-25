/**
 * 記事本文の確定的スタイル linter(#C5 / WRITE-02)。DOM/IO 非依存。
 *
 * style-guide §6(誇大・煽り・医療断定)/§14(AI定型・括弧書き直訳・メタ言及) の辞書に基づき、
 * 本文プレーンテキストから該当箇所を機械的に検出する。AI 往復(advise)に依存せず 0 秒・確定で判定する。
 *
 * 注意: これは「人が見直すためのハイライト補助」であり自動却下ではない(誇大語などは文脈で適切な場合もある)。
 * 公開ブロックには使わず、件数とカテゴリを公開前チェックに出して編集者の確認を促す。
 */

export type StyleLintCategory =
  | "誇大"
  | "煽り"
  | "医療断定"
  | "AI定型"
  | "メタ言及"
  | "括弧直訳";

export interface StyleLintHit {
  category: StyleLintCategory;
  /** 一致した語句。 */
  term: string;
  /** プレーンテキスト中の開始位置。 */
  index: number;
}

/** 単純な語句辞書(部分一致)。 */
const DICTIONARIES: ReadonlyArray<{ category: StyleLintCategory; terms: readonly string[] }> = [
  { category: "誇大", terms: ["業界No.1", "業界No1", "日本一", "絶対", "最高", "No.1"] },
  { category: "煽り", terms: ["今だけ", "急げ", "見逃すな", "殺到"] },
  { category: "医療断定", terms: ["痩せる", "治る"] },
  {
    category: "AI定型",
    terms: [
      "と言われています",
      "だと言えるでしょう",
      "ではないでしょうか",
      "いかがでしょうか",
      "と感じています",
    ],
  },
  { category: "メタ言及", terms: ["この記事では", "本記事では", "紹介します", "先に答えておきます"] },
];

/** 括弧書き直訳: 英単語(3文字以上)＋直後の括弧書き。例: belonging（帰属の感覚）。 */
const PAREN_GLOSS = /[A-Za-z][A-Za-z-]{2,}\s*[（(][^）)]{1,40}[）)]/g;

/** 本文プレーンテキストから NG 表現を検出して位置順に返す。 */
export function styleLint(plain: string): StyleLintHit[] {
  const hits: StyleLintHit[] = [];
  for (const { category, terms } of DICTIONARIES) {
    for (const term of terms) {
      let from = 0;
      for (;;) {
        const index = plain.indexOf(term, from);
        if (index === -1) break;
        hits.push({ category, term, index });
        from = index + term.length;
      }
    }
  }
  for (const match of plain.matchAll(PAREN_GLOSS)) {
    hits.push({ category: "括弧直訳", term: match[0], index: match.index });
  }
  return hits.sort((a, b) => a.index - b.index);
}

export interface TermHit {
  /** 一致した語。 */
  term: string;
  /** 置換候補(統一すべき表記)。 */
  suggestion: string;
  index: number;
}

/** 用語統一(#H22)。ゆれ・誤用しやすい語と、統一すべき置換候補。 */
const TERM_RULES: ReadonlyArray<{ wrong: string; suggestion: string }> = [
  { wrong: "ラケット", suggestion: "パドル（ピックルボールの用具）" },
  { wrong: "Pickleball", suggestion: "ピックルボール" },
  { wrong: "pickleball", suggestion: "ピックルボール" },
  { wrong: "ピックルボール場", suggestion: "ピックルボールコート" },
];

/** 表記ゆれ・用語の誤用を検出し、置換候補とともに位置順で返す(#H22)。 */
export function termHints(plain: string): TermHit[] {
  const hits: TermHit[] = [];
  for (const { wrong, suggestion } of TERM_RULES) {
    let from = 0;
    for (;;) {
      const index = plain.indexOf(wrong, from);
      if (index === -1) break;
      hits.push({ term: wrong, suggestion, index });
      from = index + wrong.length;
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

export interface StyleLintCount {
  category: StyleLintCategory;
  count: number;
}

/** カテゴリ別の件数(0 件のカテゴリは含めない・件数降順→カテゴリ順)。 */
export function styleLintSummary(hits: readonly StyleLintHit[]): StyleLintCount[] {
  const order: StyleLintCategory[] = ["誇大", "煽り", "医療断定", "AI定型", "メタ言及", "括弧直訳"];
  return order
    .map((category) => ({ category, count: hits.filter((h) => h.category === category).length }))
    .filter((c) => c.count > 0);
}
