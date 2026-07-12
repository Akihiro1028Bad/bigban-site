/**
 * 文体チェック(#proto・StyleHints・#C5/§6/§14)。DOM非依存の純ロジック。
 *
 * NG語(誇大・煽り)/AI定型表現/記事自己言及/用語ゆれを決定的に検出し件数で返す。
 * #146 スタイリングアドバイス(AIの主観提案・確率的)とは別物の「機械的・確定」検査で、
 * 公開前チェック(draftQuality)と同じ確定ファミリーとしてフッターに同居させる。
 */
import { stripTags } from "./bodyBlocks";
import type { QualityCheck } from "./draftQuality";
import type { Article } from "./types";

const NG_WORDS = ["絶対", "必ず", "誰でも簡単に", "最高の", "日本一", "業界No.1", "驚異の"];
const AI_CLICHE = ["いかがでしたか", "まとめると", "本記事では", "ぜひ試してみてください", "〜していきましょう"];
const SELF_MENTION = ["この記事では", "本記事は", "今回の記事"];
// 用語ゆれ: 正規表記とブレ表記のペア。
const TERM_VARIANTS: [string, string][] = [
  ["ピックルボール", "ピクルボール"],
  ["コート", "コ―ト"],
  ["パドル", "パドル "],
];

function countHits(text: string, words: string[]): { word: string }[] {
  return words.flatMap((w) => (text.includes(w) ? [{ word: w }] : []));
}

export interface StyleFinding {
  category: "ng" | "cliche" | "self" | "term";
  label: string;
  hits: string[];
}

export function styleFindings(article: Article): StyleFinding[] {
  const text = stripTags(article.bodyHtml);
  const findings: StyleFinding[] = [];
  const ng = countHits(text, NG_WORDS).map((h) => h.word);
  if (ng.length) findings.push({ category: "ng", label: "誇大・煽り表現", hits: ng });
  const cliche = countHits(text, AI_CLICHE).map((h) => h.word);
  if (cliche.length) findings.push({ category: "cliche", label: "AI定型表現", hits: cliche });
  const self = countHits(text, SELF_MENTION).map((h) => h.word);
  if (self.length) findings.push({ category: "self", label: "記事の自己言及", hits: self });
  const term = TERM_VARIANTS.filter(([, variant]) => text.includes(variant)).map(([std, v]) => `${v}→${std}`);
  if (term.length) findings.push({ category: "term", label: "用語ゆれ", hits: term });
  return findings;
}

export function styleHintCount(article: Article): number {
  return styleFindings(article).reduce((n, f) => n + f.hits.length, 0);
}

/** 公開前チェック(QualityChecklist)に合流させる文体チェック行。 */
export function styleChecks(article: Article): QualityCheck[] {
  const findings = styleFindings(article);
  if (findings.length === 0) {
    return [{ id: "style-ok", level: "ok", label: "文体チェック: 指摘なし" }];
  }
  return findings.map((f) => ({
    id: `style-${f.category}`,
    level: "warn" as const,
    label: `文体: ${f.label} ${f.hits.length}件`,
    detail: f.hits.slice(0, 3).join(" / "),
  }));
}
