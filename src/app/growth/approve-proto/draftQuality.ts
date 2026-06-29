/**
 * 公開前チェックリスト(#proto・品質ゲート3段階)。DOM非依存の純ロジック。
 *
 * block(赤=公開不可) / warn(黄=要確認) / ok(緑) を本文・タイトルから決定的に判定する。
 * 承認画面が「公開」を止めるのと同じ基準を、プロトでも見せる(なぜ公開できないかを提示)。
 */
import { stripTags } from "./bodyBlocks";
import type { Article } from "./types";

export type QualityLevel = "block" | "warn" | "ok";

export interface QualityCheck {
  id: string;
  level: QualityLevel;
  label: string;
  detail?: string;
}

/** 既知の有効な内部パス(これ以外への内部リンクは「切れ」とみなす・厳密一致)。 */
const KNOWN_NEWS_PATHS = new Set([
  "/ja/facility",
  "/ja/services",
  "/facility",
  "/services",
  "/ja/news/pickleball-basics",
  "/ja/news/indoor-comfort",
]);

// §13 doNotWrite: 料金・営業時間・面数・所要分の断定(数値つき)。
const ASSERT_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /\d[\d,]*\s*円/, what: "料金" },
  { re: /\d{1,2}\s*時(?:から|〜|～|まで)/, what: "営業時間" },
  { re: /\d+\s*面/, what: "コート面数" },
  { re: /所要\s*\d+\s*分/, what: "所要時間" },
];

function internalLinks(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((m) => m[1]);
}

function brokenLinks(html: string): string[] {
  // 内部パス(/始まり)で、既知の有効パスに厳密一致しないものを「切れ」とみなす。
  return internalLinks(html).filter((href) => href.startsWith("/") && !KNOWN_NEWS_PATHS.has(href));
}

export function qualityChecks(article: Article): QualityCheck[] {
  const text = stripTags(article.bodyHtml);
  const checks: QualityCheck[] = [];

  // --- block ---
  const assertHit = ASSERT_PATTERNS.find((p) => p.re.test(text) || p.re.test(article.title));
  checks.push(
    assertHit
      ? { id: "assert", level: "block", label: "未確定情報の断定", detail: `${assertHit.what}を数値で断定しています(§13)` }
      : { id: "assert", level: "ok", label: "未確定情報の断定なし" }
  );

  const broken = brokenLinks(article.bodyHtml);
  checks.push(
    broken.length
      ? { id: "links", level: "block", label: "内部リンク切れ", detail: `存在しないパス: ${broken[0]}` }
      : { id: "links", level: "ok", label: "内部リンク切れなし" }
  );

  const hasDisclaimer = /AIが作成|担当者が確認|公式情報をご確認/.test(text);
  checks.push(
    hasDisclaimer
      ? { id: "disclaimer", level: "ok", label: "AI生成の注記あり" }
      : { id: "disclaimer", level: "block", label: "AI生成の注記が無い", detail: "§5: AIが作成した旨の注記が必要" }
  );

  // --- warn ---
  checks.push(
    article.wordCount >= 1200
      ? { id: "words", level: "ok", label: `文字数 ${article.wordCount.toLocaleString()}字` }
      : { id: "words", level: "warn", label: "文字数が少なめ", detail: `${article.wordCount}字 (目安 1,200字)` }
  );

  const headings = (article.bodyHtml.match(/<h2\b/gi) ?? []).length;
  checks.push(
    headings >= 2
      ? { id: "headings", level: "ok", label: `見出し ${headings}本` }
      : { id: "headings", level: "warn", label: "見出しが少ない", detail: `H2 ${headings}本 (目安 2本以上)` }
  );

  checks.push(
    article.bodyImages > 0
      ? { id: "images", level: "ok", label: `本文画像 ${article.bodyImages}枚` }
      : { id: "images", level: "warn", label: "本文画像なし", detail: "図解/イメージの追加を検討" }
  );

  checks.push(
    internalLinks(article.bodyHtml).length > 0
      ? { id: "internal", level: "ok", label: "内部リンクあり" }
      : { id: "internal", level: "warn", label: "内部リンクなし", detail: "関連ページへの導線を検討" }
  );

  checks.push(
    article.title.length <= 32
      ? { id: "title", level: "ok", label: `タイトル ${article.title.length}字` }
      : { id: "title", level: "warn", label: "タイトルが長い", detail: `${article.title.length}字 (目安 32字以内)` }
  );

  return checks;
}

export function countByLevel(checks: QualityCheck[]): Record<QualityLevel, number> {
  return checks.reduce(
    (acc, c) => {
      acc[c.level] += 1;
      return acc;
    },
    { block: 0, warn: 0, ok: 0 } as Record<QualityLevel, number>
  );
}
