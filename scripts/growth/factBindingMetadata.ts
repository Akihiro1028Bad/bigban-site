export const FACT_BINDING_VERSION = 1;

export interface FactBindingMetadata {
  version: number;
  bodyHash: string;
}

/** Browser と Node の双方で同じ値になる、本文照合専用の決定的 hash。 */
export function bindingBodyHash(bodyHtml: string): string {
  let high = 0x811c9dc5;
  let low = 0x9e3779b9;
  for (let index = 0; index < bodyHtml.length; index += 1) {
    const code = bodyHtml.charCodeAt(index);
    high = Math.imul(high ^ code, 0x01000193) >>> 0;
    low = Math.imul(low ^ code, 0x85ebca6b) >>> 0;
  }
  return `fnv1a64:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}
