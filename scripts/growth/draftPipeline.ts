import { Parser } from "htmlparser2";
import { z } from "zod";

import type { SourceLedgerEntry } from "./sourceLedger";
import type { FactReference } from "./factBinding";
import type { FactBindingMetadata } from "./factBindingMetadata";

export const RESERVE_URL = "https://www.thepicklebang.com/reserve";

export const RESEARCH_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "facts"],
  properties: {
    version: { type: "integer", enum: [1] },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "statement",
          "role",
          "sourceType",
          "source",
          "sourceLabel",
          "isStatistic",
          "isHealthClaim",
          "publishedYear",
        ],
        properties: {
          id: { type: "string" },
          statement: { type: "string" },
          role: { type: "string", enum: ["option", "constraint", "detail"] },
          sourceType: {
            type: "string",
            enum: ["facility-context", "primary-note", "official-site"],
          },
          source: { type: "string" },
          sourceLabel: { type: ["string", "null"] },
          isStatistic: { type: "boolean" },
          isHealthClaim: { type: "boolean" },
          publishedYear: { type: ["integer", "null"] },
        },
      },
    },
  },
} as const;

const researchFactSchema = z
  .object({
    id: z.string().regex(/^fact-[a-z0-9-]+$/i, "fact id は fact- で始めてください"),
    statement: z.string().trim().min(1),
    role: z.enum(["option", "constraint", "detail"]),
    sourceType: z.enum(["facility-context", "primary-note", "official-site"]),
    source: z.string().trim().min(1),
    sourceLabel: z.string().trim().min(1).nullish().transform((value) => value ?? undefined),
    isStatistic: z.boolean().nullish().transform((value) => value ?? undefined),
    isHealthClaim: z.boolean().nullish().transform((value) => value ?? undefined),
    publishedYear: z.number().int().min(1900).max(2200).nullish().transform((value) => value ?? undefined),
  })
  .superRefine((fact, ctx) => {
    const isReferenceClaim = fact.isStatistic === true || fact.isHealthClaim === true;
    if (fact.sourceType === "official-site") {
      if (!fact.sourceLabel) {
        ctx.addIssue({ code: "custom", path: ["sourceLabel"], message: "公式情報源にはsourceLabelが必要です" });
      }
      try {
        const url = new URL(fact.source);
        if (url.protocol !== "https:") throw new Error("https only");
      } catch {
        ctx.addIssue({ code: "custom", path: ["source"], message: "公式情報源はHTTPS URLにしてください" });
      }
    }
    if (isReferenceClaim && fact.sourceType !== "official-site") {
      ctx.addIssue({
        code: "custom",
        path: ["sourceType"],
        message: "統計・健康情報は公式確認済みのofficial-site factにしてください",
      });
    }
    if (isReferenceClaim && fact.publishedYear === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["publishedYear"],
        message: "統計・健康情報にはpublishedYearが必要です",
      });
    }
  });

const researchPacketSchema = z
  .object({
    version: z.literal(1),
    facts: z.array(researchFactSchema),
  })
  .superRefine((packet, ctx) => {
    const seen = new Set<string>();
    packet.facts.forEach((fact, index) => {
      if (seen.has(fact.id)) {
        ctx.addIssue({ code: "custom", path: ["facts", index, "id"], message: `fact id が重複しています: ${fact.id}` });
      }
      seen.add(fact.id);
    });
  });

const writerOutputSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  excerpt: z.string().trim().min(1),
  bodyHtml: z.string().min(1),
  usedFactIds: z.array(z.string()).default([]),
});

export type ResearchFact = z.infer<typeof researchFactSchema>;
export type ResearchPacket = z.infer<typeof researchPacketSchema>;
export type WriterOutput = z.infer<typeof writerOutputSchema>;
export interface ValidatedWriterOutput extends Omit<WriterOutput, "bodyHtml"> {
  bodyHtml: string;
  factReferences: FactReference[];
  binding: FactBindingMetadata;
}

export interface ResearchTrustedSources {
  facilityName: string;
  facilityConfirmed: readonly string[];
  facilityLocation: readonly string[];
  primaryNotes: string;
}

export function parseResearchPacket(value: unknown): ResearchPacket {
  return researchPacketSchema.parse(value);
}

function normalizeTrustedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

function normalizePrimaryNoteStatement(value: string): string {
  return normalizeTrustedText(value)
    .replace(/^(?:(?:[-*・●■▪◦])|(?:\d+[.)、]))+/, "")
    .replace(/[。！？!?]+$/, "");
}

function normalizedPrimaryNoteStatements(value: string): Set<string> {
  return new Set(
    value
      .split(/[\n。！？!?]+/)
      .map(normalizePrimaryNoteStatement)
      .filter(Boolean),
  );
}

/** AIが正典由来と申告したfactを、実際に渡した正典の原文と照合する。 */
export function validateResearchPacketSources(
  packet: ResearchPacket,
  trusted: ResearchTrustedSources,
): ResearchPacket {
  const facilityFacts = [trusted.facilityName, ...trusted.facilityConfirmed, ...trusted.facilityLocation].map(normalizeTrustedText);
  const primaryNoteStatements = normalizedPrimaryNoteStatements(trusted.primaryNotes);
  for (const fact of packet.facts) {
    const statement = normalizeTrustedText(fact.statement);
    if (fact.sourceType === "facility-context") {
      if (fact.source !== "facility-context.json") {
        throw new Error(`facility-context factのsourceが不正です: ${fact.source}`);
      }
      if (!facilityFacts.includes(statement)) {
        throw new Error(`facility-contextにないfactです: ${fact.statement}`);
      }
    }
    if (fact.sourceType === "primary-note") {
      if (fact.source !== "一次情報メモ") {
        throw new Error(`一次情報メモfactのsourceが不正です: ${fact.source}`);
      }
      const primaryStatement = normalizePrimaryNoteStatement(fact.statement);
      if (!primaryStatement || !primaryNoteStatements.has(primaryStatement)) {
        throw new Error(`一次情報メモにないfactです: ${fact.statement}`);
      }
    }
  }
  return packet;
}

export function parseWriterOutput(value: unknown, research: ResearchPacket): WriterOutput {
  const output = writerOutputSchema.parse(value);
  const available = new Set(research.facts.map((fact) => fact.id));
  const missing = output.usedFactIds.filter((id) => !available.has(id));
  if (missing.length > 0) throw new Error(`未確認のfact idです: ${missing.join(", ")}`);
  if (new Set(output.usedFactIds).size !== output.usedFactIds.length) throw new Error("usedFactIdsに重複があります");
  return output;
}

export function buildSourceLedgerFromUsedFacts(
  research: ResearchPacket,
  usedFactIds: readonly string[],
  factReferences: readonly FactReference[] = [],
  recheckReasonForReference?: (statement: string, excerpt: string) => string | undefined,
  binding?: FactBindingMetadata,
): SourceLedgerEntry[] {
  const used = new Set(usedFactIds);
  const grouped = new Map<string, SourceLedgerEntry>();
  for (const fact of research.facts) {
    if (!used.has(fact.id)) continue;
    const key = `${fact.sourceType}\u0000${fact.source}`;
    const current = grouped.get(key);
    if (current) {
      if (!current.confirmedFacts.includes(fact.statement)) current.confirmedFacts.push(fact.statement);
      appendFactReferences(current, fact, factReferences, recheckReasonForReference, binding);
      continue;
    }
    grouped.set(key, {
      sourceType: fact.sourceType,
      source: fact.source,
      confirmedFacts: [fact.statement],
    });
    appendFactReferences(grouped.get(key)!, fact, factReferences, recheckReasonForReference, binding);
  }
  return [...grouped.values()];
}

function appendFactReferences(
  entry: SourceLedgerEntry,
  fact: ResearchFact,
  references: readonly FactReference[],
  recheckReasonForReference?: (statement: string, excerpt: string) => string | undefined,
  binding?: FactBindingMetadata,
): void {
  const matching = references.filter((reference) => reference.factId === fact.id);
  if (matching.length === 0) return;
  const target = entry.factReferences ?? (entry.factReferences = []);
  for (const reference of matching) {
    if (target.some((current) => current.factId === reference.factId
      && current.container === reference.container
      && current.containerIndex === reference.containerIndex
      && current.excerpt === reference.excerpt)) continue;
    const reason = recheckReasonForReference?.(fact.statement, reference.excerpt);
    target.push({
      factId: fact.id,
      statement: fact.statement,
      excerpt: reference.excerpt,
      sectionPath: reference.sectionPath,
      container: reference.container,
      containerIndex: reference.containerIndex,
      recheckBeforePublish: reason !== undefined,
      ...(reason ? { recheckReason: reason } : {}),
      ...(binding ? { bindingVersion: binding.version, bodyHash: binding.bodyHash } : {}),
    });
  }
}

function externalLinks(html: string): string[] {
  const links: string[] = [];
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name !== "a") return;
      const href = attributes.href?.trim();
      if (href && (/^(?:https?:\/\/|mailto:|tel:)/i.test(href) || href.startsWith("//"))) links.push(href);
    },
  }, {
    decodeEntities: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
  });
  parser.end(html);
  return links;
}

export function duplicateExternalLinks(html: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const href of externalLinks(html)) {
    if (seen.has(href)) duplicates.add(href);
    seen.add(href);
  }
  return [...duplicates];
}

export function externalLinksOutsideFacts(
  html: string,
  research: ResearchPacket,
  usedFactIds: readonly string[],
): string[] {
  const used = new Set(usedFactIds);
  const allowed = new Set([
    RESERVE_URL,
    ...research.facts
      .filter((fact) => used.has(fact.id) && fact.sourceType === "official-site")
      .map((fact) => fact.source),
  ]);
  return [...new Set(externalLinks(html).filter((href) => !allowed.has(href)))];
}
