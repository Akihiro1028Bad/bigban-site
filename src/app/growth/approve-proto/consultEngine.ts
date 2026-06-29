/**
 * AI相談(#proto・往復統合)の純関数エンジン。
 *
 * ライフサイクル(requested→presenting→failed)と提示の反映を、Reactやタイマー無しの
 * 純関数として持つ。型専用 import のみ(HTML加工は薄い useConsult 側に置く)。
 */
import type { Consult, ConsultInput, ConsultKind } from "./types";

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
