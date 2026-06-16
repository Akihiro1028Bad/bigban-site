/**
 * 週次 LINE 通知の組み立てに使う純関数群。
 *
 * スナップショット/Notion ページからの抽出と URL 組み立てを I/O から切り離し、
 * テスト可能にする。配線(読込・送信)は notify-line.ts が担う。
 */

import type { MetricValue, WeeklyMetrics } from "./digest";
import type { NotionPage } from "./notion";

interface MetricTriple {
  current?: number;
  prior?: number;
  deltaPct?: number | null;
}

interface SummaryRow {
  metrics?: Record<string, MetricTriple>;
}

export interface SnapshotShape {
  period?: { start?: string; end?: string };
  ga4?: { summary?: SummaryRow[] };
  gsc?: { summary?: SummaryRow[] };
}

function toMetric(m: MetricTriple | undefined): MetricValue | undefined {
  if (!m || typeof m.current !== "number") return undefined;
  return { current: m.current, prior: m.prior ?? 0, deltaPct: m.deltaPct ?? null };
}

export function extractMetrics(snapshot: SnapshotShape): WeeklyMetrics {
  const ga4 = snapshot.ga4?.summary?.[0]?.metrics ?? {};
  const gsc = snapshot.gsc?.summary?.[0]?.metrics ?? {};
  return {
    sessions: toMetric(ga4.sessions),
    clicks: toMetric(gsc.clicks),
    impressions: toMetric(gsc.impressions),
    position: toMetric(gsc.position),
  };
}

export function periodLabel(snapshot: SnapshotShape): string {
  return `${snapshot.period?.start ?? ""}〜${snapshot.period?.end ?? ""}`;
}

function getTitleText(page: NotionPage, propName: string): string {
  const prop = page.properties[propName] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (prop?.title ?? [])
    .map((part) => part.plain_text ?? "")
    .join("")
    .trim();
}

/** ページ群の title プロパティから空でないものを最大 max 件取り出す。 */
export function extractActionTitles(
  pages: NotionPage[],
  propName: string,
  max: number
): string[] {
  return pages
    .map((page) => getTitleText(page, propName))
    .filter((title) => title.length > 0)
    .slice(0, max);
}

/** 公開済み Notion DB のページ公開URL(ダッシュ無しID)を組み立てる。 */
export function buildPublicNotionUrl(
  domain: string | undefined,
  pageId: string
): string | null {
  if (!domain) return null;
  return `https://${domain}/${pageId.replace(/-/g, "")}`;
}

/** 承認ページのトークン付きURLを組み立てる。 */
export function buildApproveUrl(
  siteUrl: string | undefined,
  secret: string | undefined
): string | null {
  if (!siteUrl || !secret) return null;
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/growth/approve?token=${encodeURIComponent(secret)}`;
}
