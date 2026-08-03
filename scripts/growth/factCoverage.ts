/**
 * 値カバレッジ方式の fact 検証(marker 廃止版)。
 *
 * ブロック判定は「本文に書かれた値(金額・時刻・日付・数量・統計・健康断定)が
 * fact 全体の和集合に存在するか」だけで行い、帰属(どの文がどの fact か)は検証しない。
 * 台帳は機械の逆引きで生成し、言語理解が要る判定(捏造施設名の疑い)は warnings に降格する。
 *
 * 設計: .superpowers/sdd/task-fc-1.md。旧実装 factBinding.ts からの移植で、
 * marker 走査・配置検査・usedFactIds 整合・表の列見出し照合は持ち込まない。
 */

import { Parser } from "htmlparser2";

import {
  bindingBodyHash,
  bindingContainerTextHash,
  FACT_BINDING_VERSION,
} from "./factBindingMetadata";

import type { ResearchFact } from "./draftPipeline";

export type FactClaimKind =
  | "price"
  | "date"
  | "time"
  | "quantity"
  | "statistic"
  | "health"
  | "proper-noun";

export interface FactReference {
  factId: string;
  excerpt: string;
  sectionPath: string;
  container: "p" | "li" | "th" | "td";
  containerIndex: number;
  containerTextHash: string;
  containerMatchCount: number;
  claimKinds: FactClaimKind[];
}

export interface FactCoverageWarning {
  /** 将来種別が増える前提の union。 */
  kind: "unverified-facility-noun";
  text: string;
  excerpt: string;
}

export interface ValidatedFactCoverage {
  cleanBodyHtml: string;
  references: FactReference[];
  warnings: FactCoverageWarning[];
  binding: {
    version: number;
    bodyHash: string;
  };
}

interface Atom {
  kind: FactClaimKind;
  canonical: string;
  /** エラーメッセージへ出す本文の字面(NFKC 正規化後)。 */
  text: string;
  start: number;
  end: number;
}

interface FactSupport {
  keys: ReadonlySet<string>;
  normalizedText: string;
}

interface ContainerState {
  name: FactReference["container"];
  index: number;
  text: string;
  sectionPath: string;
}

const CONTAINERS = new Set<FactReference["container"]>(["p", "li", "th", "td"]);
const HEALTH_PATTERNS = [
  /血圧を下げ(?:る|ます)/g,
  /怪我を予防(?:する|します)/g,
  /心肺機能が改善(?:する|します)/g,
  /治(?:る|ります)/g,
  /痩せ(?:る|ます)/g,
] as const;
const STATISTIC_WORDS = /最安|最高|最低|最大|最小|最多|最短|No\.?\s*1|平均|中央値|割合|調査では/gi;
const EXCLUDED_PROPER_NOUNS = new Set(["AI"]);
const NUMBER_SOURCE = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const BARE_NUMBER_PREFIX = "number:";
const FACILITY_SUFFIX_SOURCE = String.raw`(?:駅|体育館|クラブ|協会|連盟)`;
const FACILITY_NOUN_PATTERN = new RegExp(`[一-龯々ぁ-んァ-ヶーA-Za-z0-9]{2,}${FACILITY_SUFFIX_SOURCE}`, "g");
const FACILITY_SUFFIX_TAIL = new RegExp(`${FACILITY_SUFFIX_SOURCE}$`);
const FACILITY_PARTICLE_SPLIT = /[のはをがにでとへ]|より|から/;
/** 特定の施設を指さない修飾語。「地域クラブ」を施設名として扱わないために使う。 */
const GENERIC_FACILITY_PREFIXES = new Set([
  "地域", "地元", "近隣", "近所", "周辺", "市内", "都内", "県内", "沿線", "複数", "一般", "民間", "公営",
]);
const FACT_MARKER_PATTERN = /<!--\s*FACT:[\s\S]*?-->/g;
const SENTENCE_TERMINATORS = new Set(["。", "！", "？", "!", "?"]);
const CLAIM_KIND_LABELS: Record<FactClaimKind, string> = {
  price: "金額",
  time: "時刻",
  date: "日付",
  quantity: "数量",
  statistic: "統計",
  health: "健康",
  "proper-noun": "名称",
};

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[〜～]/g, "-")
    .replace(/，/g, ",")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
}

function pushMatches(
  atoms: Atom[],
  text: string,
  pattern: RegExp,
  kind: FactClaimKind,
  canonical: (match: RegExpMatchArray) => string = (match) => normalized(match[0]),
): void {
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    atoms.push({
      kind,
      canonical: canonical(match),
      text: match[0],
      start,
      end: start + match[0].length,
    });
  }
}

/**
 * 施設系接尾辞を含む語から施設名だけを取り出す。一般名詞なら null。
 *
 * 助詞で前置きを落としたうえで(「近くの本八幡駅」→「本八幡駅」)、次は施設名として扱わない。
 * - 接尾辞だけが残るもの(「沿線の駅」→「駅」)
 * - 前置きに活用や助詞が残る句(「地域で活動するクラブ」)。施設名の前置きは地名・組織名で、ひらがなを含まない
 * - 特定の施設を指さない一般修飾語(「地域クラブ」)
 */
function facilityProperNoun(matchText: string): string | null {
  const segments = matchText.split(FACILITY_PARTICLE_SPLIT).filter(Boolean);
  const noun = segments.at(-1)!;
  const prefix = noun.replace(FACILITY_SUFFIX_TAIL, "");
  if (prefix === "") return null;
  if (/[ぁ-ん]/.test(prefix)) return null;
  if (GENERIC_FACILITY_PREFIXES.has(prefix)) return null;
  return noun;
}

interface FacilityNoun {
  text: string;
  start: number;
  end: number;
}

/** 本文から施設系固有名詞を位置付きで拾う(warnings 生成用・ブロック判定には使わない)。 */
function facilityProperNouns(value: string): FacilityNoun[] {
  const nouns: FacilityNoun[] = [];
  for (const match of value.matchAll(FACILITY_NOUN_PATTERN)) {
    const noun = facilityProperNoun(match[0]);
    if (noun === null) continue;
    const start = match.index + match[0].lastIndexOf(noun);
    nouns.push({ text: noun, start, end: start + noun.length });
  }
  return nouns;
}

function knownProperNouns(facts: readonly ResearchFact[]): string[] {
  const nouns = new Set<string>();
  for (const fact of facts) {
    if (fact.sourceLabel) nouns.add(fact.sourceLabel.normalize("NFKC"));
    const statement = fact.statement.normalize("NFKC");
    for (const token of statement.matchAll(/\b[A-Za-z][A-Za-z0-9]{2,}\b/g)) {
      if ((/[A-Z]/.test(token[0]) || /\d/.test(token[0])) && !EXCLUDED_PROPER_NOUNS.has(token[0])) {
        nouns.add(token[0]);
      }
    }
    for (const noun of facilityProperNouns(statement)) nouns.add(noun.text);
  }
  return [...nouns].filter((noun) => noun.length > 0).sort((a, b) => b.length - a.length);
}

function numeric(match: string): number {
  return Number(match.replace(/,/g, ""));
}

function canonicalYen(match: string): string {
  const normalizedMatch = match.normalize("NFKC").replace(/\s+/g, "");
  const amount = numeric(normalizedMatch.match(new RegExp(NUMBER_SOURCE))![0]);
  const multiplier = normalizedMatch.includes("万") ? 10_000 : normalizedMatch.includes("千") ? 1_000 : 1;
  return `yen:${amount * multiplier}`;
}

function canonicalClock(match: string): string {
  const value = match.normalize("NFKC");
  const numbers = value.match(/\d+/g)!;
  let hour = Number(numbers[0]);
  if (value.includes("午後") && hour < 12) hour += 12;
  if (value.includes("午前") && hour === 12) hour = 0;
  return `clock:${hour}:${Number(numbers[1] ?? 0)}`;
}

/**
 * 他アトムに覆われた冗長アトムか。
 * - 日付の一部を数量として二重計上しない(「2026年4月17日」の「17日」)
 * - 表セルの裸数値は、時刻・金額などの上位アトムに含まれるなら二重計上しない
 *   (エラーメッセージを「値1つにつき1件」に保つため)
 */
function isCoveredByOtherAtom(atom: Atom, atoms: readonly Atom[]): boolean {
  if (atom.kind === "quantity") {
    return atoms.some((other) => other.kind === "date" && atom.start >= other.start && atom.end <= other.end);
  }
  if (atom.canonical.startsWith(BARE_NUMBER_PREFIX)) {
    return atoms.some((other) =>
      !other.canonical.startsWith(BARE_NUMBER_PREFIX)
      && atom.start >= other.start
      && atom.end <= other.end);
  }
  return false;
}

function extractAtoms(text: string, facts: readonly ResearchFact[], isTableCell = false): Atom[] {
  const value = text.normalize("NFKC");
  const atoms: Atom[] = [];
  pushMatches(atoms, value, /(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日)/g, "date", (match) => {
    const numbers = match[0].match(/\d+/g)!;
    return numbers.length === 3
      ? `date:${Number(numbers[0])}-${Number(numbers[1])}-${Number(numbers[2])}`
      : `date:${Number(numbers[0])}-${Number(numbers[1])}`;
  });
  pushMatches(atoms, value, /\d{4}年\d{1,2}月(?!\d)/g, "date", (match) => {
    const numbers = match[0].match(/\d+/g)!;
    return `year-month:${Number(numbers[0])}-${Number(numbers[1])}`;
  });
  pushMatches(atoms, value, /(?<!\d)\d{1,2}月(?!\d{1,2}日)/g, "date", (match) => `month:${Number(match[0].match(/\d+/)![0])}`);
  pushMatches(atoms, value, /(?:発行年(?:の|は)?\s*)?\d{4}年(?!\d{1,2}月)/g, "date", (match) => `year:${match[0].match(/\d{4}/)![0]}`);
  pushMatches(atoms, value, new RegExp(`(?:[￥¥]\\s*${NUMBER_SOURCE}|${NUMBER_SOURCE}\\s*(?:万|千)?円)`, "g"), "price", (match) => canonicalYen(match[0]));
  pushMatches(atoms, value, /入会金|参加費|月額|無料|有料/g, "price");
  pushMatches(atoms, value, /\d{1,2}:\d{2}(?:\s*[-〜～]\s*\d{1,2}:\d{2})?/g, "time", (match) => `time:${normalized(match[0])}`);
  pushMatches(atoms, value, /(?:午前|午後)?\d{1,2}時(?:\d{1,2}分)?/g, "time", (match) => canonicalClock(match[0]));
  pushMatches(atoms, value, new RegExp(`徒歩\\s*${NUMBER_SOURCE}\\s*分`, "g"), "time", (match) => `walk-minutes:${numeric(match[0].match(new RegExp(NUMBER_SOURCE))![0])}`);
  pushMatches(atoms, value, new RegExp(`${NUMBER_SOURCE}\\s*(?:時間|分|秒)`, "g"), "time", (match) => `duration:${normalized(match[0])}`);
  pushMatches(atoms, value, new RegExp(`(?<![\\d,])${NUMBER_SOURCE}\\s*(?:%|％|割|人|名|件|面|本|台|回|km|m|kg|g|日|週|か月|年|月|分|秒|倍|位)`, "gi"), "quantity", (match) => normalized(match[0]));
  pushMatches(atoms, value, STATISTIC_WORDS, "statistic");
  if (isTableCell) pushMatches(atoms, value, new RegExp(NUMBER_SOURCE, "g"), "statistic", (match) => `${BARE_NUMBER_PREFIX}${numeric(match[0])}`);
  for (const pattern of HEALTH_PATTERNS) pushMatches(atoms, value, pattern, "health");
  for (const noun of knownProperNouns(facts)) {
    let offset = 0;
    while (offset <= value.length) {
      const start = value.indexOf(noun, offset);
      if (start < 0) break;
      const before = value[start - 1] ?? "";
      const after = value[start + noun.length] ?? "";
      const isAsciiName = /^[A-Za-z0-9 ]+$/.test(noun);
      if (!isAsciiName || (!/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after))) {
        atoms.push({
          kind: "proper-noun",
          canonical: normalized(noun),
          text: noun,
          start,
          end: start + noun.length,
        });
      }
      offset = start + noun.length;
    }
  }
  const unique = new Map<string, Atom>();
  for (const atom of atoms) {
    if (isCoveredByOtherAtom(atom, atoms)) continue;
    unique.set(`${atom.kind}\u0000${atom.canonical}\u0000${atom.start}\u0000${atom.end}`, atom);
  }
  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function atomKey(atom: Atom): string {
  return `${atom.kind}:${atom.canonical}`;
}

function supportKeys(atom: Atom): string[] {
  const keys = [atomKey(atom)];
  if (atom.kind === "date" && /^date:\d+-\d+-\d+$/.test(atom.canonical)) {
    const [, month, day] = atom.canonical.match(/^date:\d+-(\d+)-(\d+)$/)!;
    keys.push(`date:date:${month}-${day}`);
  }
  return keys;
}

function supportForFact(fact: ResearchFact, facts: readonly ResearchFact[]): FactSupport {
  const value = `${fact.statement} ${fact.sourceLabel ?? ""}`;
  const supported = new Set(extractAtoms(value, facts).flatMap((atom) => supportKeys(atom)));
  for (const match of value.normalize("NFKC").matchAll(new RegExp(NUMBER_SOURCE, "g"))) {
    supported.add(`statistic:${BARE_NUMBER_PREFIX}${numeric(match[0])}`);
  }
  if (fact.publishedYear !== undefined) supported.add(`date:year:${fact.publishedYear}`);
  return { keys: supported, normalizedText: normalized(value) };
}

function unionSupport(facts: readonly ResearchFact[]): FactSupport {
  const keys = new Set<string>();
  const texts: string[] = [];
  for (const fact of facts) {
    const support = supportForFact(fact, facts);
    for (const key of support.keys) keys.add(key);
    texts.push(support.normalizedText);
  }
  return { keys, normalizedText: texts.join("\u0000") };
}

function isAtomSupported(atom: Atom, supported: FactSupport): boolean {
  return supportKeys(atom).some((key) => supported.keys.has(key));
}

function sectionPath(headings: readonly string[]): string {
  return headings.filter(Boolean).join(" > ");
}

function lastSentenceStart(value: string): number {
  const indices = [value.lastIndexOf("。"), value.lastIndexOf("！"), value.lastIndexOf("？"), value.lastIndexOf("!"), value.lastIndexOf("?")];
  return Math.max(...indices) + 1;
}

function sentenceEnd(value: string, from: number): number {
  for (let index = from; index < value.length; index += 1) {
    if (SENTENCE_TERMINATORS.has(value[index])) return index;
  }
  return value.length;
}

/** 一致箇所を含む1文を切り出す。表セルはセル全文を抜粋にする。 */
function excerptAt(container: ContainerState, value: string, start: number, end: number): string {
  if (container.name === "td" || container.name === "th") return value.trim();
  return value.slice(lastSentenceStart(value.slice(0, start)), sentenceEnd(value, end)).trim();
}

function scanContainers(bodyHtml: string): ContainerState[] {
  const headings: string[] = [];
  const headingTexts: string[] = [];
  const containers: ContainerState[] = [];
  const containerStack: ContainerState[] = [];
  const containerCounts: Record<FactReference["container"], number> = { p: 0, li: 0, th: 0, td: 0 };
  const parser = new Parser({
    onopentag(name) {
      if (name === "h2" || name === "h3") headingTexts.push("");
      if (CONTAINERS.has(name as FactReference["container"])) {
        const containerName = name as FactReference["container"];
        const container: ContainerState = {
          name: containerName,
          index: ++containerCounts[containerName],
          text: "",
          sectionPath: sectionPath(headings),
        };
        containers.push(container);
        containerStack.push(container);
      }
    },
    ontext(text) {
      if (headingTexts.length > 0) headingTexts[headingTexts.length - 1] += text;
      const container = containerStack.at(-1);
      if (container) {
        container.text += text;
      } else if (headingTexts.length === 0 && text.replace(/\{\{IMG:\d+\}\}/g, "").trim()) {
        throw new Error("見出し以外の可視テキストがp/li/th/td container外にあります");
      }
    },
    onclosetag(name) {
      if (name === "h2" || name === "h3") {
        const text = headingTexts.pop()!.trim();
        if (name === "h2") headings.splice(0, headings.length, text);
        else headings.splice(1, headings.length - 1, text);
      }
      if (CONTAINERS.has(name as FactReference["container"])) containerStack.pop();
    },
  }, { decodeEntities: true, lowerCaseTags: true });
  parser.end(bodyHtml);
  return containers;
}

function containerAtoms(container: ContainerState, facts: readonly ResearchFact[]): Atom[] {
  return extractAtoms(container.text, facts, container.name === "td" || container.name === "th");
}

/** L1: 本文の値が fact 全体の和集合に無ければ、全違反を1メッセージで列挙して throw する。 */
function assertValuesAreCovered(
  containers: readonly ContainerState[],
  facts: readonly ResearchFact[],
  union: FactSupport,
): void {
  const violations = new Map<string, Atom>();
  for (const container of containers) {
    for (const atom of containerAtoms(container, facts)) {
      if (atom.kind === "proper-noun") continue;
      if (isAtomSupported(atom, union)) continue;
      violations.set(`${atom.kind}\u0000${atom.text}`, atom);
    }
  }
  if (violations.size === 0) return;
  const listed = [...violations.values()]
    .map((atom) => `${atom.text}(${CLAIM_KIND_LABELS[atom.kind]})`)
    .join(" / ");
  throw new Error(`根拠のない値があります: ${listed}`);
}

function containerMatchCount(
  containers: readonly ContainerState[],
  container: ContainerState,
): number {
  const hash = bindingContainerTextHash(container.text);
  return containers.filter(
    (candidate) =>
      candidate.name === container.name
      && candidate.sectionPath === container.sectionPath
      && bindingContainerTextHash(candidate.text) === hash,
  ).length;
}

/** L2: fact の値アトムが本文のどこに現れるかを逆引きして台帳を組む。 */
function buildReferences(
  containers: readonly ContainerState[],
  facts: readonly ResearchFact[],
): FactReference[] {
  const references = new Map<string, FactReference>();
  for (const container of containers) {
    const value = container.text.normalize("NFKC");
    const atoms = containerAtoms(container, facts);
    for (const fact of facts) {
      const support = supportForFact(fact, facts);
      for (const atom of atoms) {
        if (!isAtomSupported(atom, support)) continue;
        const excerpt = excerptAt(container, value, atom.start, atom.end);
        const key = `${fact.id}\u0000${container.name}\u0000${container.index}\u0000${excerpt}`;
        const current = references.get(key);
        if (current) {
          if (!current.claimKinds.includes(atom.kind)) current.claimKinds.push(atom.kind);
          continue;
        }
        references.set(key, {
          factId: fact.id,
          excerpt,
          sectionPath: container.sectionPath,
          container: container.name,
          containerIndex: container.index,
          containerTextHash: bindingContainerTextHash(container.text),
          containerMatchCount: containerMatchCount(containers, container),
          claimKinds: [atom.kind],
        });
      }
    }
  }
  return [...references.values()];
}

/** L3: fact に無い施設系固有名詞を非ブロックの警告として報告する。 */
function collectWarnings(
  containers: readonly ContainerState[],
  union: FactSupport,
): FactCoverageWarning[] {
  const warnings = new Map<string, FactCoverageWarning>();
  for (const container of containers) {
    const value = container.text.normalize("NFKC");
    for (const noun of facilityProperNouns(value)) {
      if (union.normalizedText.includes(normalized(noun.text))) continue;
      const excerpt = excerptAt(container, value, noun.start, noun.end);
      warnings.set(`${noun.text}\u0000${excerpt}`, {
        kind: "unverified-facility-noun",
        text: noun.text,
        excerpt,
      });
    }
  }
  return [...warnings.values()];
}

export function validateFactCoverage(params: {
  bodyHtml: string;
  facts: readonly ResearchFact[];
}): ValidatedFactCoverage {
  const { facts } = params;
  // 旧キャッシュ・移行期の防御。marker は判定に使わないので無条件に落とす。
  const cleanBodyHtml = params.bodyHtml.replace(FACT_MARKER_PATTERN, "");
  const containers = scanContainers(cleanBodyHtml);
  const union = unionSupport(facts);
  assertValuesAreCovered(containers, facts, union);
  return {
    cleanBodyHtml,
    references: buildReferences(containers, facts),
    warnings: collectWarnings(containers, union),
    binding: {
      version: FACT_BINDING_VERSION,
      bodyHash: bindingBodyHash(cleanBodyHtml),
    },
  };
}

/*
 * 公開前の再確認判定(旧 factBinding.ts から移設・実装は不変)。
 * 台帳の各参照について、可変情報(料金・営業時間 等)や doNotWrite に触れる主張を人の確認対象として印を付ける。
 */

const RECHECK_RULES: ReadonlyArray<{ reason: string; pattern: RegExp }> = [
  { reason: "料金", pattern: /料金|価格|月額|入会金|参加費|有料|無料|割引|キャンペーン|クーポン/ },
  { reason: "営業時間", pattern: /営業時間|営業日|定休日|\d{1,2}:\d{2}/ },
  { reason: "イベント日時", pattern: /イベント|体験会|大会|開催日|開催時刻/ },
  { reason: "定員", pattern: /定員|\d+\s*(?:人|名)/ },
  { reason: "予約サービス名", pattern: /予約サービス|予約システム/ },
  { reason: "利用可否", pattern: /利用(?:でき|可能|不可|可否)|貸出|レンタル|予約/ },
  { reason: "現在の肩書き", pattern: /代表|館長|社長|会長|コーチ|肩書き/ },
  { reason: "比較優位", pattern: /国内最大|最高|最多|最安|No\.?\s*1/ },
];

const DO_NOT_WRITE_TOPICS: ReadonlyArray<{
  reason: string;
  canonicalPattern: RegExp;
  claimPattern: RegExp;
}> = [
  { reason: "料金", canonicalPattern: /キャンペーン|割引率|クーポンコード/, claimPattern: /キャンペーン|割引|クーポン|期間限定/ },
  { reason: "予約サービス名", canonicalPattern: /予約先|RESERVA|LaBOLA/, claimPattern: /予約(?:先|サービス|システム)|RESERVA|LaBOLA/ },
  { reason: "イベント日時", canonicalPattern: /イベント|体験会|出演者/, claimPattern: /イベント|体験会|クリニック|レッスン|大会|開催|出演者|参加料金|参加費|定員/ },
  { reason: "利用可否", canonicalPattern: /ラウンジ/, claimPattern: /ラウンジ/ },
  { reason: "営業時間", canonicalPattern: /24時間営業/, claimPattern: /24\s*時間|営業時間/ },
  { reason: "比較優位", canonicalPattern: /国内最大|比較根拠|優位表現/, claimPattern: /国内最大|最大規模|最高|最多|最安|No\.?\s*1/ },
  { reason: "料金", canonicalPattern: /会員制度|月額料金|貸切料金|法人利用料金/, claimPattern: /会員制度|月額|貸切料金|法人利用料金/ },
  { reason: "現在の肩書き", canonicalPattern: /肩書き|実績/, claimPattern: /肩書き|代表|館長|社長|会長|コーチ|監督|選手の実績/ },
];

export function recheckReasonForFactReference(
  statement: string,
  excerpt: string,
  doNotWrite: readonly string[],
): string | undefined {
  const target = `${statement} ${excerpt}`.normalize("NFKC");
  for (const rule of RECHECK_RULES) {
    if (rule.pattern.test(target)) return rule.reason;
  }
  const canonical = doNotWrite.join("\n").normalize("NFKC");
  for (const topic of DO_NOT_WRITE_TOPICS) {
    if (topic.canonicalPattern.test(canonical) && topic.claimPattern.test(target)) return topic.reason;
  }
  return undefined;
}
