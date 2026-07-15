/**
 * 成績ボード(#C4 計測ループ)。公開記事の GA4 成績(Notion ミラー)を一覧する。
 * プル型: データは Notion `成績データ` 由来で、ここは表示のみ。
 *
 * 見た目は proto(#proto approve-proto/PerformanceBoard) へ再スキン:
 * サマリーカード＋「いちばん伸びた記事」バナー＋行リスト＋GSC(検索)行展開(RowDetail)。
 * 期間切替(7/28/90日)ボタンと Sparkline は本番では出さない(単一期間・日次 series 無し)。
 */

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { type ArticleMetrics, summarizeMetrics } from "@/lib/growth/metrics";
import { daysSincePublished, isLowSample, reviewLabels, type ReviewLabel } from "@/lib/growth/metricsReview";
import { reservationIntent, socialCta, type MetricDeltaValue } from "@/lib/growth/ctaEvents";
import { isReservationDataFresh, selectLatestReservationSnapshot } from "@/lib/growth/reservations";

import {
  type DeltaTone,
  formatCount,
  formatCtr,
  formatDelta,
  formatPosition,
} from "./articleMetricsView";
import { cardHue } from "./boardCardView";
import {
  IconArrowDown,
  IconArrowUp,
  IconChart,
  IconChevronDown,
  IconPlus,
  IconSearch,
  IconSparkles,
} from "./ui/icons";
import { EyecatchThumb } from "./ui/eyecatchThumb";

// 前週比トーンの表示色(proto トーン)。
const DELTA_COLOR: Record<DeltaTone, string> = {
  up: "var(--p-green)",
  down: "var(--p-red)",
  flat: "var(--p-text-3)",
  none: "var(--p-text-3)",
};

// #計測強化 S3: 判定ラベルの配色(行動の緊急度で色分け・proto トーン)。
const LABEL_TONE: Record<ReviewLabel, { color: string; bg: string }> = {
  伸びている: { color: "var(--p-green)", bg: "var(--p-green-weak)" },
  CTR弱い: { color: "var(--p-amber)", bg: "var(--p-amber-weak)" },
  順位あと少し: { color: "var(--p-accent)", bg: "var(--p-accent-weak)" },
  読まれるが予約意図弱い: { color: "var(--p-amber)", bg: "var(--p-amber-weak)" },
  予約意図未計測: { color: "var(--p-text-3)", bg: "var(--p-bg-active)" },
  要改稿: { color: "var(--p-red)", bg: "var(--p-red-weak)" },
  未計測: { color: "var(--p-text-3)", bg: "var(--p-bg-active)" },
};

/** 成績ボードが必要とする最小形状(lib/ApproveClient どちらの記事 item でも満たす)。 */
interface MetricsItem {
  id: string;
  title: string;
  contentId?: string;
  eyecatchUrl?: string;
  metrics?: ArticleMetrics;
}

/** 計測済み記事(metrics 非 undefined を型で確定させたもの)。 */
interface MeasuredRow {
  item: MetricsItem;
  metrics: ArticleMetrics;
}

interface PerformanceBoardProps {
  items: readonly MetricsItem[];
  /** 伸びた記事から次のネタ案へ橋渡しする(任意・未指定ならバナー/CTA の追加ボタンは出さない)。 */
  onAddIdea?: (item: MetricsItem) => void;
}

export function PerformanceBoard({ items, onAddIdea }: PerformanceBoardProps) {
  // #計測強化 S3: 公開後経過日数(要改稿判定)の基準時刻はマウント時に1度だけ確定する(描画の純粋性)。
  const [nowMs] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const measured: MeasuredRow[] = items
    .map((item) => (item.metrics ? { item, metrics: item.metrics } : null))
    .filter((x): x is MeasuredRow => x !== null)
    .sort((a, b) => b.metrics.views.current - a.metrics.views.current);

  const summary = summarizeMetrics(items.map((item) => ({ title: item.title, metrics: item.metrics })));
  const latestReservations = selectLatestReservationSnapshot(
    measured.flatMap(({ metrics }) => metrics.actualReservations ? [metrics.actualReservations] : [])
  );
  const hasFreshReservations = latestReservations
    ? isReservationDataFresh(latestReservations.syncedAt, new Date(nowMs).toISOString())
    : false;

  // proto「いちばん伸びた記事」= 表示前週比が最大(かつプラス)の記事。
  const risers: { row: MeasuredRow; delta: number }[] = [];
  for (const row of measured) {
    const delta = row.metrics.views.deltaPct;
    if (delta !== null && delta > 0) risers.push({ row, delta });
  }
  const best = risers.reduce<{ row: MeasuredRow; delta: number } | null>(
    (acc, cur) => (acc && acc.delta >= cur.delta ? acc : cur),
    null
  );

  // 行バーの相対幅の基準(全記事の最大表示数)。
  const maxViews = Math.max(1, ...measured.map((r) => r.metrics.views.current));

  if (summary.count === 0) {
    return (
      <section aria-label="成績ボード" className="mx-auto max-w-[880px] px-6 py-7">
        <BoardHeading />
        <p className="mt-3 text-[13px]" style={{ color: "var(--p-text-3)" }}>
          まだ計測データがありません。公開記事の成績は計測ループ更新後に表示されます。
        </p>
      </section>
    );
  }

  return (
    <section aria-label="成績ボード" className="mx-auto max-w-[880px] px-6 py-7">
      <BoardHeading />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="合計表示数" value={formatCount(summary.totalViews)} />
        <SummaryCard label="合計ユーザー数" value={formatCount(summary.totalUsers)} />
        <SummaryCard label="計測記事数" value={String(summary.count)} />
        {latestReservations ? (
          <SummaryCard
            label={hasFreshReservations ? "施設全体の実予約" : "施設全体の実予約（古い）"}
            value={formatCount(latestReservations.facility.current)}
          />
        ) : null}
      </div>

      {best && (
        <div
          className="mb-5 flex items-center gap-3 rounded-[12px] p-3.5"
          style={{ background: "var(--p-green-weak)", border: "1px solid var(--p-green)" }}
        >
          <IconArrowUp size={18} style={{ color: "var(--p-green)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px]" style={{ color: "var(--p-green)" }}>
              いちばん伸びた記事
            </div>
            <div className="truncate text-[13.5px] font-medium">{best.row.item.title}</div>
          </div>
          <div className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--p-green)" }}>
            {formatDelta(best.row.metrics.views.deltaPct).text}
          </div>
          {onAddIdea ? (
            <button
              type="button"
              onClick={() => onAddIdea(best.row.item)}
              className="approve-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
              style={{ background: "var(--p-green)", color: "var(--p-accent-ink)" }}
            >
              <IconPlus size={13} /> 似た企画をネタ案に
            </button>
          ) : null}
        </div>
      )}

      <ul className="flex list-none flex-col gap-2 p-0">
        {measured.map(({ item, metrics }) => {
          const up = (metrics.views.deltaPct ?? 0) >= 0;
          const expanded = expandedId === item.id;
          const labels = reviewLabels(
            metrics,
            metrics.publishedAt ? daysSincePublished(metrics.publishedAt, nowMs) : null
          );
          const hasLowSample = isLowSample(metrics);
          return (
            <li
              key={item.id}
              className="rounded-[12px]"
              style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : item.id)}
                className="approve-row flex w-full items-center gap-2.5 p-3 text-left sm:gap-3.5 sm:p-3.5"
              >
                <EyecatchThumb
                  hue={cardHue(item.id)}
                  has={typeof item.contentId === "string" && item.contentId.length > 0}
                  url={item.eyecatchUrl || undefined}
                  size={44}
                  alt=""
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{item.title}</div>
                  <div className="mt-1.5 h-[6px] overflow-hidden rounded-full" style={{ background: "var(--p-bg-active)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(metrics.views.current / maxViews) * 100}%`, background: "var(--p-accent)" }}
                    />
                  </div>
                </div>
                {/* 判定ラベルは画面幅に応じて開示する(行のクリップ回避)。 */}
                {labels.length > 0 ? (
                  <span className="hidden shrink-0 flex-wrap justify-end gap-1 md:flex" style={{ maxWidth: 160 }}>
                    {labels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full px-2 py-[2px] text-[11px] font-medium"
                        style={{ background: LABEL_TONE[label].bg, color: LABEL_TONE[label].color }}
                      >
                        {label}
                      </span>
                    ))}
                    {hasLowSample ? (
                      <span
                        className="rounded-full px-2 py-[2px] text-[11px] font-medium"
                        style={{ background: "var(--p-bg-active)", color: "var(--p-text-3)" }}
                      >
                        母数小・参考値
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <div className="hidden w-[92px] text-right sm:block">
                  <div className="text-[14px] font-semibold tabular-nums">{formatCount(metrics.views.current)}</div>
                  <div className="text-[11px]" style={{ color: "var(--p-text-3)" }}>表示数</div>
                </div>
                <div
                  className="flex w-[64px] items-center justify-end gap-1 text-[13px] font-medium tabular-nums"
                  style={{ color: metrics.views.deltaPct === null ? "var(--p-text-3)" : up ? "var(--p-green)" : "var(--p-red)" }}
                >
                  {metrics.views.deltaPct !== null ? (up ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : null}
                  {formatDelta(metrics.views.deltaPct).text}
                </div>
                <span
                  className="transition-transform"
                  style={{ color: "var(--p-text-3)", transform: expanded ? "rotate(180deg)" : "none" }}
                >
                  <IconChevronDown size={16} />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <RowDetail
                      metrics={metrics}
                      onAddIdea={onAddIdea ? () => onAddIdea(item) : undefined}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BoardHeading() {
  return (
    <div className="mb-5 flex items-center gap-3">
      <IconChart size={18} style={{ color: "var(--p-accent)" }} />
      <h2 className="text-[16px] font-semibold">成績ボード</h2>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] p-4" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <div className="text-[12px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
      <div className="mt-1.5 text-[24px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** GSC(検索)行展開: クリック/表示/CTR/順位＋CTA＋上位クエリ(本番 search 実データ)。 */
function RowDetail({ metrics, onAddIdea }: { metrics: ArticleMetrics; onAddIdea?: () => void }) {
  const search = metrics.search;
  const cta = metrics.ctaEvents;
  return (
    <div className="border-t px-3.5 py-4" style={{ borderColor: "var(--p-border)" }}>
      <div
        className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--p-text-3)" }}
      >
        <IconSearch size={13} /> 検索（GSC）
      </div>
      {search ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="クリック" value={formatCount(search.clicks.current)} delta={search.clicks.deltaPct} />
            <Stat label="表示回数" value={formatCount(search.impressions.current)} />
            <Stat label="CTR" value={formatCtr(search.ctr.current)} />
            <Stat label="平均掲載順位" value={formatPosition(search.position.current)} />
          </div>
          {search.topQueries.length > 0 ? (
            <div className="mt-2.5">
              <div className="mb-1 text-[11px]" style={{ color: "var(--p-text-3)" }}>上位クエリ</div>
              <div className="flex flex-wrap gap-1.5">
                {search.topQueries.map((q) => (
                  <span
                    key={q.query}
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11.5px]"
                    style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
                    title={`クリック ${q.clicks} / 表示 ${q.impressions} / CTR ${formatCtr(q.ctr)} / 順位 ${formatPosition(q.position)}`}
                  >
                    {q.query}
                    <span className="tabular-nums" style={{ color: "var(--p-text-3)" }}>
                      {q.clicks}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>検索成績は未計測です。</div>
      )}
      {cta ? (
        <div className="mt-4 space-y-3">
          {metrics.ctaEventsMeasured === true ? (
            <>
              <CtaGroup label="予約意図" total={reservationIntent(cta)}>
                <CtaMetric label="reservation_click" value={cta.reservationClick} />
                <CtaMetric label="reserve_entry_click" value={cta.reserveEntryClick} />
              </CtaGroup>
              <CtaGroup label="SNS" total={socialCta(cta)}>
                <CtaMetric label="LINE" value={cta.lineClick} />
                <CtaMetric label="Instagram" value={cta.instagramClick} />
              </CtaGroup>
              <CtaGroup label="その他CTA" total={cta.other}>
                <CtaMetric label="その他CTA 合計" value={cta.other} />
              </CtaGroup>
            </>
          ) : (
            <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
              予約意図・SNS・その他CTAはイベント別未計測です。数値0とは区別されます。
            </div>
          )}
        </div>
      ) : null}
      <ActualReservations metrics={metrics} />
      {/* #218: CTA(予約クリック等)キーイベントは search の有無に依らず、存在すれば常に表示する。 */}
      {metrics.keyEvents ? (
        <div className="mt-2.5 text-[12px]" style={{ color: "var(--p-text-2)" }}>
          CTA（キーイベント）{" "}
          <span className="font-semibold tabular-nums" style={{ color: "var(--p-text)" }}>
            {metrics.keyEventsMeasured === false ? "未計測" : formatCount(metrics.keyEvents.current)}
          </span>
        </div>
      ) : null}
      {onAddIdea ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-[10px] p-3"
          style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
        >
          <IconSparkles size={15} style={{ color: "var(--p-accent)" }} />
          <span className="flex-1 text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
            上位クエリの周辺テーマを増やすと、検索流入が伸びやすい傾向です。
          </span>
          <button
            type="button"
            onClick={onAddIdea}
            className="approve-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
            style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
          >
            <IconPlus size={13} /> 似た企画をネタ案に追加
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CtaGroup({
  label,
  total,
  children,
}: {
  label: string;
  total: MetricDeltaValue;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className="rounded-[10px] p-3" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold">
        <span>{label}</span>
        <span className="tabular-nums">今週 {formatCount(total.current)} / 前週 {formatCount(total.prior)} / {formatDelta(total.deltaPct).text}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function CtaMetric({ label, value }: { label: string; value: MetricDeltaValue }) {
  return (
    <div className="flex items-center justify-between text-[11.5px]" style={{ color: "var(--p-text-2)" }}>
      <span>{label}</span>
      <span className="tabular-nums">今週 {formatCount(value.current)} / 前週 {formatCount(value.prior)} / {formatDelta(value.deltaPct).text}</span>
    </div>
  );
}

function ActualReservations({ metrics }: { metrics: ArticleMetrics }) {
  const actual = metrics.actualReservations;
  if (!actual) return null;
  if (actual.state === "missing") {
    const coverageText = actual.reason === "coverage_incomplete" && actual.coverage
      ? `予約CSVの収録期間が不足しています（当週=${actual.coverage.current ? "収録" : "未収録"} / 前週=${actual.coverage.prior ? "収録" : "未収録"}）。予約意図を代理指標として扱います。`
      : "実予約は未取得です。予約意図を代理指標として扱います。";
    return (
      <div className="mt-3 rounded-[10px] p-3 text-[12.5px]" style={{ background: "var(--p-bg-raised)", color: "var(--p-text-2)" }}>
        {coverageText}
      </div>
    );
  }
  const isFresh = isReservationDataFresh(actual.syncedAt, new Date().toISOString());
  return (
    <div className="mt-3 rounded-[10px] p-3 text-[12.5px]" style={{ background: "var(--p-bg-raised)", color: "var(--p-text-2)" }}>
      <div className="font-semibold">{isFresh ? "実予約" : "実予約（データが古い・予約意図を代理指標）"}</div>
      <div>施設全体: 今週 {actual.facility.current} / 前週 {actual.facility.prior} / {formatDelta(actual.facility.deltaPct).text}</div>
      <div>{actual.article ? `記事帰属の実予約: 今週 ${actual.article.current} / 前週 ${actual.article.prior} / ${formatDelta(actual.article.deltaPct).text}` : "施設全体の実予約のみ（記事別帰属なし）"}</div>
      <div style={{ color: "var(--p-text-3)" }}>最終取込 {actual.syncedAt}</div>
    </div>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  // delta 未指定(undefined)は前週比バッジを出さない。null(未計測)は "—" を出さず省く。
  const d = typeof delta === "number" ? formatDelta(delta) : null;
  return (
    <div className="rounded-[10px] p-2.5" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      <div className="text-[11px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold tabular-nums">{value}</span>
        {d ? (
          <span className="text-[11px] font-medium tabular-nums" style={{ color: DELTA_COLOR[d.tone] }}>
            {d.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
