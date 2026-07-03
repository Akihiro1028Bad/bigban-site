/**
 * 公開前チェックリスト(#128/#H3/#H4/#H18/#H21)の純ロジック。DOM/IO 非依存。
 *
 * 下書き本文(HTML/プレーン)とタイトルから各項目を **3段階(ok=緑 / warn=黄 / block=赤)** で判定する。
 * 赤(block)が1つでもあれば公開をブロックする(明示オーバーライドを要求)。しきい値は記事タイプ別に定数化。
 *
 * - block: §5 AI免責文の欠落 / §13 doNotWrite(未確定=料金・所要分)の断定
 * - warn : 文字数不足/過多・見出し/画像/内部リンク不足・タイトル長超過
 */

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
  maxTitleLen: 32,
} as const;

const SITE_HOST = "thepicklebang.com";

/** §5: 末尾に必須の AI 免責文(部分一致で存在を見る)。 */
const DISCLAIMER_MARK = "AIが作成した下書き";

/**
 * §13 doNotWrite: 断定してはいけない**未確定**情報のパターン(料金・所要分)。
 *
 * #217: 営業時間(6:00-23:00)・コート面数(3面)・サーフェス(デコターフ)は about/PR TIMES/
 * PJ連盟公式で公表済みのため封印を解除し、confirmed(`facility-context.json`)へ移した。
 * 未確定のまま残すのは料金(価格)と各駅からの正確な所要分のみ。
 */
const DO_NOT_WRITE: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "料金", pattern: /[0-9０-９][0-9０-９,，]*\s*円|月額|入会金|月会費/ },
  { label: "所要時間", pattern: /徒歩\s*[0-9０-９]+\s*分|駅から[^。]{0,8}?[0-9０-９]+\s*分/ },
];

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

/** §13: 断定してはいけない可変情報が本文に含まれるか(該当ラベルの配列)。 */
export function detectDoNotWrite(plain: string): string[] {
  return DO_NOT_WRITE.filter((rule) => rule.pattern.test(plain)).map((rule) => rule.label);
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

export function draftQuality(input: DraftQualityInput): QualityCheck[] {
  const t = QUALITY_THRESHOLDS;
  const plain = plainText(input);
  const type = articleType(input);
  const headings = countMatches(input.bodyHtml, /<h[23][\s>]/gi);
  const images = countMatches(input.bodyHtml, /<img[\s>]/gi);
  const internalLinks = countInternalLinks(input.bodyHtml);
  const titleLen = input.title.length;
  const doNotWrite = detectDoNotWrite(plain);
  const hasDisclaimer = plain.includes(DISCLAIMER_MARK);

  return [
    charsCheck(plain, type),
    warnIf("見出し", `${headings}`, headings < t.minHeadings, `${t.minHeadings}個以上を推奨`),
    warnIf("画像", `${images} / 3`, images < t.minImages, "1枚以上を推奨"),
    warnIf("内部リンク", `${internalLinks}`, internalLinks < t.minInternalLinks, "1本以上を検討"),
    warnIf("タイトル長", `${titleLen}字`, titleLen > t.maxTitleLen, `${t.maxTitleLen}字以内に`),
    {
      label: "AI免責文",
      value: hasDisclaimer ? "あり" : "なし",
      level: hasDisclaimer ? "ok" : "block",
      hint: hasDisclaimer ? undefined : "末尾に§5の免責文が必要",
    },
    {
      label: "断定NG(可変情報)",
      value: doNotWrite.length > 0 ? doNotWrite.join("・") : "なし",
      level: doNotWrite.length > 0 ? "block" : "ok",
      hint: doNotWrite.length > 0 ? "§13: 未確定の料金/所要分は断定しない(営業時間・面数は公表済みで解禁)" : undefined,
    },
    ...brokenLinkChecks(input),
  ];
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
