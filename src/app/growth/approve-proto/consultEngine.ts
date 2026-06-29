/**
 * AI相談(#proto・往復統合)の純関数エンジン。
 *
 * ライフサイクル(requested→presenting→failed)と提示の反映を、Reactやタイマー無しの
 * 純関数として持つ。型専用 import のみ(HTML加工は薄い useConsult 側に置く)。
 */
import type {
  Article,
  Consult,
  ConsultInput,
  ConsultKind,
  ConsultResult,
  ReviseProposal,
  ReviseTarget,
} from "./types";

export function createConsult(
  id: string,
  kind: ConsultKind,
  input: ConsultInput,
): Consult {
  return { id, kind, status: "requested", input };
}

export function upsertConsult(list: Consult[], c: Consult): Consult[] {
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) return [...list, c];
  return list.map((x) => (x.id === c.id ? c : x));
}

export function findConsult(list: Consult[], id: string): Consult | undefined {
  return list.find((x) => x.id === id);
}

export function removeConsult(list: Consult[], id: string): Consult[] {
  return list.filter((x) => x.id !== id);
}

export function resolveConsult(c: Consult, result: ConsultResult): Consult {
  return { ...c, status: "presenting", result };
}

export function failConsult(c: Consult): Consult {
  return { ...c, status: "failed", result: undefined };
}

/** revise の対象 1つを Article 本体へ反映する(イミュータブル)。result 不在/対象不在なら素通し。 */
export function applyReviseTarget(
  article: Article,
  c: Consult,
  target: ReviseTarget,
): Article {
  const p = c.result?.revise;
  if (!p) return article;
  if (target === "title" && p.title) return { ...article, title: p.title.to };
  if (target === "body" && p.body) return { ...article, bodyHtml: p.body.to };
  if (target === "outline" && p.outline) return { ...article, outline: p.outline.to };
  return article;
}

/** revise result から対象を除く。残り0なら null(相談を畳む合図)。 */
export function settleReviseTarget(c: Consult, target: ReviseTarget): Consult | null {
  const p = c.result?.revise;
  if (!p) return c;
  const next: ReviseProposal = { ...p };
  delete next[target];
  if (Object.keys(next).length === 0) return null;
  return { ...c, result: { ...c.result, revise: next } };
}
