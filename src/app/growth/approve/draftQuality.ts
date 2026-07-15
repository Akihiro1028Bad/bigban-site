/**
 * 公開前チェックリスト(#128/#H3/#H4/#H18/#H21)の純ロジック。DOM/IO 非依存。
 *
 * 下書き本文(HTML/プレーン)とタイトルから各項目を **3段階(ok=緑 / warn=黄 / block=赤)** で判定する。
 * 赤(block)が1つでもあれば公開をブロックする(明示オーバーライドを要求)。しきい値は記事タイプ別に定数化。
 *
 * - block: §5 AI免責文の欠落 / 明確な禁止表現 / 危険HTML / 壊れた内部記事リンク
 * - warn : 文字数不足/過多・見出し/画像/内部リンク不足・要出典情報・外部リンク・文体注意
 */

import { styleLint, styleLintSummary } from "@/lib/growth/styleLint";

/** 各チェックの重大度。 */
export type CheckLevel = "ok" | "warn" | "block";

/** 記事タイプ。未指定は single 扱い(欠落耐性)。 */
export type ArticleType = "single" | "cornerstone";

export interface QualityCheck {
  label: string;
  /** 表示用の値(例 "2,400字" / "0 / 3")。 */
  value: string;
  level: CheckLevel;
  /** なぜ warn/block かの補足(任意)。 */
  hint?: string;
}

export interface DraftQualityInput {
  bodyHtml: string;
  body: string;
  title: string;
  /** 記事タイプ(未指定は single)。 */
  articleType?: ArticleType;
  /** #H19: 既知の記事リンクパス(/ja/news/<slug>)集合。渡されれば壊れ内部リンクを赤(block)で検査する。 */
  knownNewsPaths?: ReadonlySet<string>;
  /** 公式ページ・施設正典で確認し、確認済み情報源リストに保存した本文用事実。 */
  confirmedFacts?: readonly string[];
}

export const QUALITY_THRESHOLDS = {
  /** 文字数下限/上限(タイプ別)。下限未満・上限超過(水増し疑い)は warn。 */
  chars: {
    single: { min: 1500, max: 6000 },
    cornerstone: { min: 3000, max: 12000 },
  },
  minHeadings: 2,
  minImages: 1,
  minInternalLinks: 1,
} as const;

const SITE_HOST = "thepicklebang.com";

/** §5: 末尾に必須の AI 免責文(部分一致で存在を見る)。 */
export const DISCLAIMER_MARK = "AIが作成した下書き";

/** 出典の確認を人へ促す可変情報。存在だけでは公開を止めない。 */
const CITATION_REQUIRED: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "料金", pattern: /[0-9０-９][0-9０-９,，]*\s*円|月額|入会金|月会費/ },
  {
    label: "所要時間",
    pattern: /徒歩\s*[0-9０-９]+\s*分|駅から[^。]{0,8}?[0-9０-９]+\s*分/,
  },
  { label: "キャンペーン・クーポン", pattern: /キャンペーン|割引率|クーポンコード/ },
  {
    label: "イベント",
    pattern: /イベント|体験会|クリニック|レッスン|大会/,
  },
];

/** facility-context の doNotWrite から、文脈に依存せず機械判定できる表現だけを block する。 */
const PROHIBITED_CLAIMS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
  requiresConfirmation?: boolean;
}> = [
  { label: "24時間営業", pattern: /24\s*時間営業/ },
  { label: "国内最大", pattern: /国内最大(?:規模)?/ },
  { label: "キャンペーン価格", pattern: /キャンペーン価格|期間限定価格|期限付きキャンペーン/, requiresConfirmation: true },
  { label: "割引率", pattern: /割引率/, requiresConfirmation: true },
  { label: "クーポンコード", pattern: /クーポンコード/, requiresConfirmation: true },
  {
    label: "未確定イベント",
    pattern:
      /(?:イベント|体験会|クリニック|レッスン|大会)[^。]{0,50}(?:[0-9０-９]{1,2}月[0-9０-９]{1,2}日|開催(?:します|予定(?:です|となっています|があります|と(?:案内|発表)されています|[。！!]))|参加料金|参加費|定員|出演者)/,
    requiresConfirmation: true,
  },
  {
    label: "ラウンジ利用",
    pattern:
      /ラウンジ(?:スペース)?[^。]{0,20}(?:利用できます|利用可能(?:です|となっています)|使えます|開放しています)/,
  },
];

const NEGATED_CLAIM_SUFFIX = /^[^。]{0,16}(?:ではありません|ではない|ではなく|しません|しない|していません|ありません|できません)/;

const FORBIDDEN_HTML_TAGS = [
  "script",
  "iframe",
  "style",
  "base",
  "link",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "section",
  "article",
  "header",
  "footer",
  "svg",
  "math",
  "details",
  "video",
  "audio",
  "h1",
] as const;

const FORBIDDEN_HTML_ATTRIBUTES = ["style", "formaction"] as const;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function plainText(input: DraftQualityInput): string {
  const body = input.body.trim();
  return body.length > 0 ? body : stripTags(input.bodyHtml);
}

/** 本文のプレーンテキスト(body 優先、無ければ bodyHtml からタグ除去)。文体チェック等で再利用する。 */
export function draftPlainText(bodyHtml: string, body: string): string {
  return plainText({ bodyHtml, body, title: "" });
}

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

function countInternalLinks(html: string): number {
  const hrefs = html.match(/href="([^"]*)"/gi) ?? [];
  return hrefs.filter((raw) => {
    const url = raw.slice(6, -1); // href=" ... "
    return url.includes(SITE_HOST) || url.startsWith("/");
  }).length;
}

function countExternalLinks(html: string): number {
  const hrefs = html.match(/href="([^"]*)"/gi) ?? [];
  return hrefs.filter((raw) => {
    const url = raw.slice(6, -1);
    return /^https:\/\//i.test(url) && !url.includes(SITE_HOST);
  }).length;
}

/** 内部リンクの正規化パス(host除去・クエリ/ハッシュ/末尾スラッシュ除去)を抽出する。外部リンクは除く。 */
export function extractInternalLinkPaths(html: string): string[] {
  const hrefs = html.match(/href="([^"]*)"/gi) ?? [];
  const paths: string[] = [];
  for (const raw of hrefs) {
    let url = raw.slice(6, -1).trim();
    const hostIdx = url.indexOf(SITE_HOST);
    if (hostIdx !== -1) url = url.slice(hostIdx + SITE_HOST.length);
    if (!url.startsWith("/")) continue; // 外部はスキップ
    url = url.split(/[?#]/)[0].replace(/\/+$/, "");
    paths.push(url === "" ? "/" : url);
  }
  return paths;
}

/**
 * 記事詳細リンクのパスパターン。公開先が `news`(既定)でも `columns` でも同じ検査に載せる
 * ため、両セグメントを許容する(#columns)。一覧(`/ja/news`)や施設/トップ等の静的パスは
 * `.+` 要求で対象外になり誤検出しない。
 */
const ARTICLE_LINK_PATTERN = /^\/ja\/(?:news|columns)\/.+/;

/**
 * 壊れた内部リンク(#H19)。検証対象は `/ja/news/<slug>` および `/ja/columns/<slug>` の
 * 記事リンクのみ(誤検出を避け、一覧/施設/トップ等の静的パスは検証しない)。
 * knownNewsPaths(=公開先に応じて呼び出し側が組み立てた既知パス集合)に無い記事リンクを返す。
 */
export function findBrokenInternalLinks(
  html: string,
  knownNewsPaths: ReadonlySet<string>
): string[] {
  return extractInternalLinkPaths(html).filter(
    (path) => ARTICLE_LINK_PATTERN.test(path) && !knownNewsPaths.has(path)
  );
}

/** 料金・徒歩分数など、確認済み情報源と公式情報の確認が必要なカテゴリを返す。 */
export function detectCitationRequired(plain: string): string[] {
  return CITATION_REQUIRED.filter((rule) => rule.pattern.test(plain)).map((rule) => rule.label);
}

function sentenceAt(plain: string, index: number): string {
  const before = plain.slice(0, index);
  const start = Math.max(before.lastIndexOf("。"), before.lastIndexOf("！"), before.lastIndexOf("？"), before.lastIndexOf("\n")) + 1;
  const rest = plain.slice(index);
  const offsets = [rest.indexOf("。"), rest.indexOf("！"), rest.indexOf("？"), rest.indexOf("\n")]
    .filter((offset) => offset >= 0);
  const end = offsets.length > 0 ? index + Math.min(...offsets) : plain.length;
  return plain.slice(start, end).trim();
}

function normalizeConfirmedFact(value: string): string {
  return value.normalize("NFKC").replace(/[\s。、，,.!?！？「」『』（）()]+/g, "");
}

function isConfirmedClaim(sentence: string, confirmedFacts: readonly string[]): boolean {
  const normalizedSentence = normalizeConfirmedFact(sentence);
  return confirmedFacts.some((fact) => {
    const normalizedFact = normalizeConfirmedFact(fact);
    return normalizedFact.length >= 6 &&
      (normalizedSentence.includes(normalizedFact) || normalizedFact.includes(normalizedSentence));
  });
}

/** 文脈に依存せず明確に禁止できる断定を返す。 */
export function detectProhibitedClaims(
  plain: string,
  confirmedFacts: readonly string[] = []
): string[] {
  return PROHIBITED_CLAIMS.filter((rule) => {
    const pattern = new RegExp(rule.pattern.source, `${rule.pattern.flags.replace("g", "")}g`);
    for (const match of plain.matchAll(pattern)) {
      const end = match.index + match[0].length;
      if (NEGATED_CLAIM_SUFFIX.test(plain.slice(end, end + 24))) continue;
      if (rule.requiresConfirmation && isConfirmedClaim(sentenceAt(plain, match.index), confirmedFacts)) {
        continue;
      }
      return true;
    }
    return false;
  }).map((rule) => rule.label);
}

/** AI HTML 契約で禁止されているタグ・属性を重複なしで返す。 */
export function detectUnsafeHtml(html: string): string[] {
  const hits: string[] = [];
  if (/<!--\s*FACT:/i.test(html)) hits.push("FACT marker");
  for (const tag of FORBIDDEN_HTML_TAGS) {
    if (new RegExp(`<\\/?${tag}(?:\\s|>)`, "i").test(html)) hits.push(tag);
  }
  for (const attribute of FORBIDDEN_HTML_ATTRIBUTES) {
    if (new RegExp(`\\s${attribute}\\s*=`, "i").test(html)) hits.push(attribute);
  }
  const eventAttributes = html.match(/\son[a-z0-9_-]+\s*=/gi) ?? [];
  for (const raw of eventAttributes) {
    const attribute = raw.trim().split(/\s*=/)[0].toLowerCase();
    if (!hits.includes(attribute)) hits.push(attribute);
  }
  detectUnsafeLinkAttributes(html, hits);
  return hits;
}

function addUnique(hits: string[], attribute: string): void {
  if (!hits.includes(attribute)) hits.push(attribute);
}

function hasHtmlAttribute(tag: string, attribute: string): boolean {
  return new RegExp(`\\s${attribute}\\s*=`, "i").test(tag);
}

function htmlAttributeValue(tag: string, attribute: string): string | null {
  const source =
    "\\s" + attribute + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>`]+))";
  const match = new RegExp(source, "i").exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3]!;
}

/**
 * 外部リンクのサニタイザーが付与する安全な組み合わせだけを許可する。
 * target/rel を全タグで一律許可せず、a@target=_blank には tabnabbing 防止の
 * noopener+noreferrer を必須にする。
 */
function detectUnsafeLinkAttributes(html: string, hits: string[]): void {
  const tags = html.match(/<[a-z][^>]*>/gi) ?? [];
  for (const tag of tags) {
    const hasTarget = hasHtmlAttribute(tag, "target");
    const hasRel = hasHtmlAttribute(tag, "rel");
    if (!hasTarget && !hasRel) continue;

    const tagName = /^<([a-z][a-z0-9-]*)/i.exec(tag)?.[1]?.toLowerCase();
    if (tagName !== "a") {
      if (hasTarget) addUnique(hits, "target");
      if (hasRel) addUnique(hits, "rel");
      continue;
    }

    const target = htmlAttributeValue(tag, "target")?.toLowerCase();
    const relTokens = (htmlAttributeValue(tag, "rel") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const hasSafeRel =
      relTokens.includes("noopener") &&
      relTokens.includes("noreferrer") &&
      !relTokens.includes("opener");

    if (hasTarget && target !== "_blank") addUnique(hits, "target");
    if (hasTarget && !hasSafeRel) addUnique(hits, "rel");
  }
}

function articleType(input: DraftQualityInput): ArticleType {
  return input.articleType === "cornerstone" ? "cornerstone" : "single";
}

function charsCheck(plain: string, type: ArticleType): QualityCheck {
  const { min, max } = QUALITY_THRESHOLDS.chars[type];
  const chars = plain.length;
  const value = `${chars.toLocaleString()}字`;
  if (chars < min) return { label: "文字数", value, level: "warn", hint: `${min}字以上を推奨` };
  if (chars > max) return { label: "文字数", value, level: "warn", hint: "水増し疑い(冗長)" };
  return { label: "文字数", value, level: "ok" };
}

function warnIf(label: string, value: string, fail: boolean, hint?: string): QualityCheck {
  return fail ? { label, value, level: "warn", hint } : { label, value, level: "ok" };
}

function styleWarningCheck(plain: string): QualityCheck {
  const hits = styleLint(plain);
  const summary = styleLintSummary(hits);
  const total = hits.length;
  const value =
    total > 0
      ? `${total}(${summary.map((s) => `${s.category}${s.count}`).join("・")})`
      : "0";

  if (total === 0) return { label: "文体注意", value, level: "ok" };
  return {
    label: "文体注意",
    value,
    level: "warn",
    hint: "§6/§14 の要確認語(誤検知あり・人が判断)",
  };
}

export function draftQuality(input: DraftQualityInput): QualityCheck[] {
  const t = QUALITY_THRESHOLDS;
  const plain = plainText(input);
  const type = articleType(input);
  const headings = countMatches(input.bodyHtml, /<h[23][\s>]/gi);
  const images = countMatches(input.bodyHtml, /<img[\s>]/gi);
  const internalLinks = countInternalLinks(input.bodyHtml);
  const externalLinks = countExternalLinks(input.bodyHtml);
  const citationRequired = detectCitationRequired(plain);
  const prohibitedClaims = detectProhibitedClaims(plain, input.confirmedFacts);
  const unsafeHtml = detectUnsafeHtml(input.bodyHtml);
  const hasDisclaimer = plain.includes(DISCLAIMER_MARK);

  return [
    charsCheck(plain, type),
    warnIf("見出し", `${headings}`, headings < t.minHeadings, `${t.minHeadings}個以上を推奨`),
    warnIf("画像", `${images} / 3`, images < t.minImages, "1枚以上を推奨"),
    warnIf("内部リンク", `${internalLinks}`, internalLinks < t.minInternalLinks, "1本以上を検討"),
    warnIf(
      "外部リンク",
      `${externalLinks}`,
      externalLinks > 0,
      "確認済み情報源リストにある公式URLか人が確認"
    ),
    styleWarningCheck(plain),
    {
      label: "要出典",
      value: citationRequired.length > 0 ? citationRequired.join("・") : "なし",
      level: citationRequired.length > 0 ? "warn" : "ok",
      hint: citationRequired.length > 0 ? "料金・所要時間は確認済み情報源と公式情報を確認" : undefined,
    },
    {
      label: "禁止表現",
      value: prohibitedClaims.length > 0 ? prohibitedClaims.join("・") : "なし",
      level: prohibitedClaims.length > 0 ? "block" : "ok",
      hint: prohibitedClaims.length > 0 ? "facility-context の明確な禁止事項" : undefined,
    },
    {
      label: "HTML安全性",
      value: unsafeHtml.length > 0 ? unsafeHtml.join("・") : "OK",
      level: unsafeHtml.length > 0 ? "block" : "ok",
      hint: unsafeHtml.length > 0 ? "禁止タグ・属性を削除" : undefined,
    },
    {
      label: "AI免責文",
      value: hasDisclaimer ? "あり" : "なし",
      level: hasDisclaimer ? "ok" : "block",
      hint: hasDisclaimer ? undefined : "末尾に§5の免責文が必要",
    },
    ...brokenLinkChecks(input),
  ];
}

/** styleLint 由来の文体注意 warn を人向け1行に要約する(0件なら null)。 */
export function summarizeStyleWarnings(bodyHtml: string, title: string): string | null {
  const check = draftQuality({ bodyHtml, body: "", title }).find(
    (c) => c.label === "文体注意"
  );
  if (!check || check.level !== "warn") return null;
  return `${check.value}: ${check.hint}`;
}

/** #H19: knownNewsPaths が渡されたときだけ、壊れた記事リンクを赤(block)で検査する。 */
function brokenLinkChecks(input: DraftQualityInput): QualityCheck[] {
  if (!input.knownNewsPaths) return [];
  const broken = findBrokenInternalLinks(input.bodyHtml, input.knownNewsPaths);
  return [
    {
      label: "内部リンク先",
      value: broken.length > 0 ? `壊れ ${broken.length}` : "OK",
      level: broken.length > 0 ? "block" : "ok",
      hint: broken.length > 0 ? `存在しない記事へのリンク(§15): ${broken.join(", ")}` : undefined,
    },
  ];
}

/** 公開をブロックすべき赤(block)が1つでもあるか。 */
export function hasBlockingCheck(checks: readonly QualityCheck[]): boolean {
  return checks.some((c) => c.level === "block");
}

/** チェックをレベル別に集計する(proto QualityChecklist の件数ピル用・#proto P3b)。 */
export function countByLevel(checks: readonly QualityCheck[]): Record<CheckLevel, number> {
  return checks.reduce(
    (acc, c) => {
      acc[c.level] += 1;
      return acc;
    },
    { ok: 0, warn: 0, block: 0 } as Record<CheckLevel, number>,
  );
}
