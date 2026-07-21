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

export interface ValidatedFactBindings {
  cleanBodyHtml: string;
  usedFactIds: string[];
  references: FactReference[];
  binding: {
    version: number;
    bodyHash: string;
  };
}

interface Atom {
  kind: FactClaimKind;
  canonical: string;
  start: number;
  end: number;
}

interface FactSupport {
  keys: ReadonlySet<string>;
  normalizedText: string;
}

interface BoundRange {
  start: number;
  end: number;
}

interface ContainerState {
  name: FactReference["container"];
  index: number;
  text: string;
  ranges: BoundRange[];
  sectionPath: string;
  tableHeader?: string;
}

interface MarkerRecord {
  start: number;
  end: number;
  ids: string[];
  excerpt: string;
  sectionPath: string;
  container: ContainerState;
  atoms: Atom[];
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
    atoms.push({ kind, canonical: canonical(match), start, end: start + match[0].length });
  }
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
    for (const match of statement.matchAll(/[一-龯々ぁ-んァ-ヶーA-Za-z0-9]{2,}(?:駅|体育館|クラブ|協会|連盟)/g)) {
      const segments = match[0].split(/[のはをがにでとへ]|より|から/).filter(Boolean);
      const noun = segments.at(-1)!;
      nouns.add(noun);
    }
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

function pushJapaneseProperNouns(atoms: Atom[], value: string): void {
  for (const match of value.matchAll(/[一-龯々ぁ-んァ-ヶーA-Za-z0-9]{2,}(?:駅|体育館|クラブ|協会|連盟)/g)) {
    const segments = match[0].split(/[のはをがにでとへ]|より|から/).filter(Boolean);
    const noun = segments.at(-1)!;
    const relativeStart = match[0].lastIndexOf(noun);
    const start = match.index + relativeStart;
    atoms.push({ kind: "proper-noun", canonical: normalized(noun), start, end: start + noun.length });
  }
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
  if (isTableCell) pushMatches(atoms, value, new RegExp(NUMBER_SOURCE, "g"), "statistic", (match) => `number:${numeric(match[0])}`);
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
        atoms.push({ kind: "proper-noun", canonical: normalized(noun), start, end: start + noun.length });
      }
      offset = start + noun.length;
    }
  }
  pushJapaneseProperNouns(atoms, value);
  const unique = new Map<string, Atom>();
  for (const atom of atoms) {
    const isDatePart = atom.kind === "quantity"
      && atoms.some((candidate) => candidate.kind === "date" && atom.start >= candidate.start && atom.end <= candidate.end);
    if (!isDatePart) unique.set(`${atom.kind}\u0000${atom.canonical}\u0000${atom.start}\u0000${atom.end}`, atom);
  }
  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function supportForFact(fact: ResearchFact, facts: readonly ResearchFact[]): FactSupport {
  const value = `${fact.statement} ${fact.sourceLabel ?? ""}`;
  const supported = new Set(extractAtoms(value, facts).flatMap((atom) => supportKeys(atom)));
  for (const match of value.normalize("NFKC").matchAll(new RegExp(NUMBER_SOURCE, "g"))) {
    supported.add(`statistic:number:${numeric(match[0])}`);
  }
  if (fact.publishedYear !== undefined) supported.add(`date:year:${fact.publishedYear}`);
  return { keys: supported, normalizedText: normalized(value) };
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

function isAtomSupported(atom: Atom, supported: FactSupport): boolean {
  if (atom.canonical.startsWith("table:")) {
    const [, header, value] = atom.canonical.split(":");
    return supported.normalizedText.includes(value)
      && (header.length === 0 || supported.normalizedText.includes(header));
  }
  return supportKeys(atom).some((key) => supported.keys.has(key));
}

function sectionPath(headings: readonly string[]): string {
  return headings.filter(Boolean).join(" > ");
}

function tableClaimAtom(value: string, header: string | undefined): Atom | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[A-Za-z]$/.test(trimmed)) return undefined;
  return {
    kind: "statistic",
    canonical: `table:${normalized(header ?? "")}:${normalized(trimmed)}`,
    start: 0,
    end: value.length,
  };
}

function atomsForContainerText(
  text: string,
  container: ContainerState,
  facts: readonly ResearchFact[],
): Atom[] {
  const atoms = extractAtoms(text, facts, container.name === "td" || container.name === "th");
  if (container.name === "td") {
    const tableAtom = tableClaimAtom(text, container.tableHeader);
    if (tableAtom) atoms.push(tableAtom);
  }
  return atoms;
}

function lastSentenceStart(value: string): number {
  const indices = [value.lastIndexOf("。"), value.lastIndexOf("！"), value.lastIndexOf("？"), value.lastIndexOf("!"), value.lastIndexOf("?")];
  return Math.max(...indices) + 1;
}

function assertMarkerPlacement(bodyHtml: string, marker: MarkerRecord): void {
  const after = bodyHtml.slice(marker.end + 1);
  if (marker.container.name === "td" || marker.container.name === "th") {
    if (!new RegExp(`^\\s*</${marker.container.name}\\s*>`, "i").test(after)) {
      throw new Error("fact markerは表セル終端直前に置いてください");
    }
    return;
  }
  if (!/^[。！？!?]/.test(after)) {
    throw new Error("fact markerは主張文の句読点直前に置いてください");
  }
}

function assertIdSets(markerIds: readonly string[], usedFactIds: readonly string[]): void {
  if (new Set(usedFactIds).size !== usedFactIds.length) throw new Error("usedFactIdsに重複があります");
  const markerSet = [...new Set(markerIds)].sort();
  const usedSet = [...new Set(usedFactIds)].sort();
  if (markerSet.join("\u0000") !== usedSet.join("\u0000")) {
    throw new Error("本文markerのfact ID集合とusedFactIdsが一致しません");
  }
}

export function validateAndStripFactBindings(params: {
  bodyHtml: string;
  usedFactIds: readonly string[];
  facts: readonly ResearchFact[];
}): ValidatedFactBindings {
  const { bodyHtml, facts, usedFactIds } = params;
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const headings: string[] = [];
  const tagStack: string[] = [];
  const headingTexts: string[] = [];
  const containers: ContainerState[] = [];
  const containerStack: ContainerState[] = [];
  const containerCounts: Record<FactReference["container"], number> = { p: 0, li: 0, th: 0, td: 0 };
  const markers: MarkerRecord[] = [];
  let tableHeaders: string[] | undefined;
  let tableColumn = 0;
  const parser = new Parser({
    onopentag(name) {
      tagStack.push(name);
      if (name === "table") tableHeaders = [];
      if (name === "tr") tableColumn = 0;
      if (name === "h2" || name === "h3") headingTexts.push("");
      if (CONTAINERS.has(name as FactReference["container"])) {
        const containerName = name as FactReference["container"];
        const container: ContainerState = {
          name: containerName,
          index: ++containerCounts[containerName],
          text: "",
          ranges: [],
          sectionPath: sectionPath(headings),
          ...(containerName === "td" && tableHeaders ? { tableHeader: tableHeaders[tableColumn] } : {}),
        };
        containers.push(container);
        containerStack.push(container);
      }
    },
    ontext(text) {
      if (headingTexts.length > 0) headingTexts[headingTexts.length - 1] += text;
      const container = containerStack[containerStack.length - 1];
      if (container) {
        container.text += text;
      } else if (headingTexts.length === 0 && text.replace(/\{\{IMG:\d+\}\}/g, "").trim()) {
        throw new Error("見出し以外の可視テキストがp/li/th/td container外にあります");
      }
    },
    oncomment(data) {
      if (!data.startsWith("FACT:")) return;
      const match = /^FACT:(fact-[a-z0-9-]+(?:,fact-[a-z0-9-]+)*)$/i.exec(data);
      if (!match) throw new Error(`fact marker形式が不正です: ${data}`);
      if (tagStack.some((name) => name === "h2" || name === "h3")) throw new Error("見出し内にfact markerは置けません");
      const container = containerStack[containerStack.length - 1];
      if (!container) throw new Error("fact markerはp/li/th/td内に置いてください");
      const claimStart = lastSentenceStart(container.text);
      const excerpt = container.text.slice(claimStart).trim();
      if (!excerpt) throw new Error("空の主張にfact markerは置けません");
      const ids = match[1].split(",");
      if (new Set(ids).size !== ids.length) throw new Error("同一marker内のfact IDが重複しています");
      const atoms = atomsForContainerText(excerpt, container, facts);
      const marker: MarkerRecord = {
        start: parser.startIndex,
        end: parser.endIndex,
        ids,
        excerpt,
        sectionPath: container.sectionPath,
        container,
        atoms,
      };
      assertMarkerPlacement(bodyHtml, marker);
      container.ranges.push({ start: claimStart, end: container.text.length });
      markers.push(marker);
    },
    onclosetag(name) {
      if (name === "h2" || name === "h3") {
        const text = headingTexts.pop()!.trim();
        if (name === "h2") headings.splice(0, headings.length, text);
        else headings.splice(1, headings.length - 1, text);
      }
      if (CONTAINERS.has(name as FactReference["container"])) {
        const container = containerStack.pop();
        if (container && tableHeaders && (name === "th" || name === "td")) {
          if (name === "th" && tableHeaders[tableColumn] === undefined) tableHeaders[tableColumn] = container.text.trim();
          tableColumn += 1;
        }
      }
      if (name === "table") tableHeaders = undefined;
      tagStack.pop();
    },
  }, { decodeEntities: true, lowerCaseTags: true });

  parser.end(bodyHtml);
  const factSyntaxCount = bodyHtml.match(/<!--\s*FACT(?::|\b)/gi)?.length ?? 0;
  if (factSyntaxCount !== markers.length || /<!--FACT:[\s\S]*$/.test(bodyHtml.slice(markers.at(-1)?.end !== undefined ? markers.at(-1)!.end + 1 : 0))) {
    throw new Error("不完全または不正なfact markerがあります");
  }

  const markerIds = markers.flatMap((marker) => marker.ids);
  assertIdSets(markerIds, usedFactIds);
  for (const id of markerIds) {
    if (!factsById.has(id)) throw new Error(`未知のfact IDです: ${id}`);
  }

  for (const container of containers) {
    const atoms = atomsForContainerText(container.text, container, facts);
    const unbound = atoms.filter((atom) => !container.ranges.some((range) => atom.start >= range.start && atom.end <= range.end));
    if (unbound.length > 0) throw new Error(`fact markerのない必須主張があります: ${container.text.trim()}`);
  }

  const references: FactReference[] = [];
  for (const marker of markers) {
    if (marker.atoms.length === 0) throw new Error(`fact markerの主張をfactが支えているか判定できません: ${marker.excerpt}`);
    const supportByFact = new Map<string, FactSupport>();
    for (const id of marker.ids) {
      const targetFact = factsById.get(id)!;
      supportByFact.set(id, supportForFact(targetFact, facts));
    }
    for (const atom of marker.atoms) {
      if (![...supportByFact.values()].some((supported) => isAtomSupported(atom, supported))) {
        throw new Error(`主張とfact内容が一致しません: ${marker.excerpt}`);
      }
    }
    for (const id of marker.ids) {
      const supported = supportByFact.get(id)!;
      if (!marker.atoms.some((atom) => isAtomSupported(atom, supported))) {
        throw new Error(`指定factが主張を支えていません: ${id}`);
      }
      references.push({
        factId: id,
        excerpt: marker.excerpt,
        sectionPath: marker.sectionPath,
        container: marker.container.name,
        containerIndex: marker.container.index,
        containerTextHash: bindingContainerTextHash(marker.container.text),
        containerMatchCount: containers.filter(
          (container) =>
            container.name === marker.container.name
            && container.sectionPath === marker.container.sectionPath
            && bindingContainerTextHash(container.text) === bindingContainerTextHash(marker.container.text),
        ).length,
        claimKinds: [...new Set(marker.atoms.map((atom) => atom.kind))],
      });
    }
  }

  let cleanBodyHtml = bodyHtml;
  for (const marker of [...markers].sort((a, b) => b.start - a.start)) {
    cleanBodyHtml = cleanBodyHtml.slice(0, marker.start) + cleanBodyHtml.slice(marker.end + 1);
  }
  return {
    cleanBodyHtml,
    usedFactIds: [...usedFactIds],
    references,
    binding: {
      version: FACT_BINDING_VERSION,
      bodyHash: bindingBodyHash(cleanBodyHtml),
    },
  };
}

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
