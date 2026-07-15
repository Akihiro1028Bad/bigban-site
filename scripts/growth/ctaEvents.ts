/** CTAイベント名・分類・合算の単一ソース。 */

import { computeDeltaPct } from "./transform";

export const CTA_EVENTS = {
  instagram: "instagram_click",
  line: "line_click",
  reservation: "reservation_click",
  reserveEntry: "reserve_entry_click",
  contactSubmit: "contact_submit",
  newsletterSignup: "newsletter_signup",
  externalLink: "external_link_click",
  contentClick: "content_click",
  access: "access_click",
  price: "price_click",
  newsCta: "news_cta_click",
} as const;

export type CtaEventName = (typeof CTA_EVENTS)[keyof typeof CTA_EVENTS];
export type CtaEventBucket =
  | "reservationClick"
  | "reserveEntryClick"
  | "lineClick"
  | "instagramClick"
  | "other";

export interface MetricDeltaValue {
  current: number;
  prior: number;
  deltaPct: number | null;
}

export interface CtaEventMetrics {
  reservationClick: MetricDeltaValue;
  reserveEntryClick: MetricDeltaValue;
  lineClick: MetricDeltaValue;
  instagramClick: MetricDeltaValue;
  other: MetricDeltaValue;
}

const BUCKET_BY_EVENT: Readonly<Record<CtaEventName, CtaEventBucket>> = {
  reservation_click: "reservationClick",
  reserve_entry_click: "reserveEntryClick",
  line_click: "lineClick",
  instagram_click: "instagramClick",
  contact_submit: "other",
  newsletter_signup: "other",
  external_link_click: "other",
  content_click: "other",
  access_click: "other",
  price_click: "other",
  news_cta_click: "other",
};

export const CTA_EVENT_NAMES: readonly CtaEventName[] = Object.values(CTA_EVENTS);

export function ctaBucketOf(eventName: string): CtaEventBucket | null {
  return Object.prototype.hasOwnProperty.call(BUCKET_BY_EVENT, eventName)
    ? BUCKET_BY_EVENT[eventName as CtaEventName]
    : null;
}

export function metricDelta(current: number, prior: number): MetricDeltaValue {
  return { current, prior, deltaPct: computeDeltaPct(current, prior) };
}

export function combineMetricDeltas(values: readonly MetricDeltaValue[]): MetricDeltaValue {
  const totals = values.reduce(
    (sum, value) => ({ current: sum.current + value.current, prior: sum.prior + value.prior }),
    { current: 0, prior: 0 }
  );
  return metricDelta(totals.current, totals.prior);
}

export function aggregateCtaEvents(
  events: readonly { eventName: string; current: number; prior: number }[]
): CtaEventMetrics {
  const totals: Record<CtaEventBucket, { current: number; prior: number }> = {
    reservationClick: { current: 0, prior: 0 },
    reserveEntryClick: { current: 0, prior: 0 },
    lineClick: { current: 0, prior: 0 },
    instagramClick: { current: 0, prior: 0 },
    other: { current: 0, prior: 0 },
  };
  for (const event of events) {
    const bucket = ctaBucketOf(event.eventName);
    if (bucket === null) continue;
    totals[bucket].current += event.current;
    totals[bucket].prior += event.prior;
  }
  return {
    reservationClick: metricDelta(totals.reservationClick.current, totals.reservationClick.prior),
    reserveEntryClick: metricDelta(totals.reserveEntryClick.current, totals.reserveEntryClick.prior),
    lineClick: metricDelta(totals.lineClick.current, totals.lineClick.prior),
    instagramClick: metricDelta(totals.instagramClick.current, totals.instagramClick.prior),
    other: metricDelta(totals.other.current, totals.other.prior),
  };
}

export function reservationIntent(metrics: CtaEventMetrics): MetricDeltaValue {
  return combineMetricDeltas([metrics.reservationClick, metrics.reserveEntryClick]);
}

export function socialCta(metrics: CtaEventMetrics): MetricDeltaValue {
  return combineMetricDeltas([metrics.lineClick, metrics.instagramClick]);
}
