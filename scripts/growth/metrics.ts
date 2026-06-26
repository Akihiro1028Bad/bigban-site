/**
 * 計測ループ(C4)の純ロジック。GA4 の topPages(pagePath→表示数/ユーザー数)を、
 * 公開記事(microCMS slug/locale から組み立てた pagePath)へ突き合わせる。
 *
 * I/O は持たない(GA4 取得・microCMS 読み・Notion 書きは CLI 側)。
 * 承認画面は Notion ミラー(`成績データ`)を読むだけ(プル型)。
 */

import { z } from "zod";

import type { MergedRow } from "./transform";

/** 1指標の今期/前期/前週比。 */
export interface MetricDelta {
  current: number;
  prior: number;
  /** 前週比(%・小数第1位)。prior が 0 のときは null。 */
  deltaPct: number | null;
}

/** 1記事ぶんの成績(承認画面の成績ボードで表示)。 */
export interface ArticleMetrics {
  pagePath: string;
  views: MetricDelta;
  users: MetricDelta;
  period: { start: string; end: string };
}

/** Notion 記事ネタ案DB に事前追加が必要なミラー用プロパティ名。 */
export const METRICS_PROPS = {
  data: "成績データ",
  updatedAt: "成績更新時刻",
} as const;

const VIEWS_METRIC = "screenPageViews";
const USERS_METRIC = "activeUsers";

/** 公開記事の GA4 pagePath を組み立てる。ja は接頭辞なし、それ以外(en)は /en。 */
export function articlePagePath(slug: string, locale: string): string {
  return locale === "ja" ? `/news/${slug}` : `/en/news/${slug}`;
}

/** GA4 pagePath を突き合わせ用に正規化する(クエリ/ハッシュ・末尾スラッシュを除去)。 */
export function normalizePagePath(path: string): string {
  const base = path.split(/[?#]/)[0];
  if (base === "/") return "/";
  return base.replace(/\/+$/, "") || "/";
}

/** 前週比(%・小数第1位)。prior が 0 以下なら null。 */
function deltaPct(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

/**
 * pagePath に一致する GA4 行(クエリ違いで分割されることがあるので合算)から成績を作る。
 * 一致が無ければ null。
 */
export function metricsForPagePath(
  pagePath: string,
  rows: readonly MergedRow[],
  period: { start: string; end: string }
): ArticleMetrics | null {
  const target = normalizePagePath(pagePath);
  const matching = rows.filter((r) => normalizePagePath(r.keys[0] ?? "") === target);
  if (matching.length === 0) return null;

  let viewsC = 0;
  let viewsP = 0;
  let usersC = 0;
  let usersP = 0;
  for (const r of matching) {
    viewsC += r.metrics[VIEWS_METRIC]?.current ?? 0;
    viewsP += r.metrics[VIEWS_METRIC]?.prior ?? 0;
    usersC += r.metrics[USERS_METRIC]?.current ?? 0;
    usersP += r.metrics[USERS_METRIC]?.prior ?? 0;
  }
  return {
    pagePath: target,
    views: { current: viewsC, prior: viewsP, deltaPct: deltaPct(viewsC, viewsP) },
    users: { current: usersC, prior: usersP, deltaPct: deltaPct(usersC, usersP) },
    period,
  };
}

const deltaSchema = z.object({
  current: z.number(),
  prior: z.number(),
  deltaPct: z.number().nullable(),
});

const metricsSchema = z.object({
  pagePath: z.string(),
  views: deltaSchema,
  users: deltaSchema,
  period: z.object({ start: z.string(), end: z.string() }),
});

/** ArticleMetrics を Notion 保存用 JSON 文字列にする。 */
export function serializeMetrics(metrics: ArticleMetrics): string {
  return JSON.stringify(metrics);
}

/** Notion `成績データ` の JSON を ArticleMetrics に戻す。不正・空は null(安全側)。 */
export function parseMetrics(json: string): ArticleMetrics | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = metricsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Notion ミラー更新用プロパティ(`成績データ`＋`成績更新時刻`)を作る。 */
export function buildMetricsMirrorProps(
  metrics: ArticleMetrics,
  updatedAtIso: string
): Record<string, unknown> {
  return {
    [METRICS_PROPS.data]: { rich_text: [{ text: { content: serializeMetrics(metrics) } }] },
    [METRICS_PROPS.updatedAt]: { date: { start: updatedAtIso } },
  };
}

/** 成績ボードのヘッダー用集計(計測済み記事の合計・最高表示数)。 */
export function summarizeMetrics(
  items: readonly {
    title: string;
    metrics?: { views?: { current?: number }; users?: { current?: number } };
  }[]
): { totalViews: number; totalUsers: number; count: number; top: { title: string; views: number } | null } {
  let totalViews = 0;
  let totalUsers = 0;
  let count = 0;
  let top: { title: string; views: number } | null = null;
  for (const item of items) {
    const views = item.metrics?.views?.current;
    if (typeof views !== "number") continue;
    count += 1;
    totalViews += views;
    totalUsers += item.metrics?.users?.current ?? 0;
    if (!top || views > top.views) top = { title: item.title, views };
  }
  return { totalViews, totalUsers, count, top };
}
