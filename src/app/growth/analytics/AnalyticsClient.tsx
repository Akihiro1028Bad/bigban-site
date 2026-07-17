"use client";

import { useEffect, useState } from "react";

import { collectingSections, formatSyncedAtJst, freshnessOf, heatmapCells, kpiCards, moneyPanel, sortedInsights } from "@/lib/growth/analyticsView";
import { readJsonObject } from "@/lib/growth/safeJson";
import { snapshotSchema } from "@/lib/growth/snapshotSchema";
import { sessionHeaders } from "../approve/sessionHeaders";
import { CollectingSection } from "./components/CollectingSection";
import { DemandHeatmap } from "./components/DemandHeatmap";
import { FreshnessBanner } from "./components/FreshnessBanner";
import { InsightFeed } from "./components/InsightFeed";
import { KpiHeader } from "./components/KpiHeader";
import { MoneyPanel } from "./components/MoneyPanel";
import { WardList } from "./components/WardList";

function todayYmd(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()); }

export function AnalyticsClient() {
  const [state, setState] = useState<{ loading: boolean; error: string | null; snapshot: ReturnType<typeof snapshotSchema.parse> | null }>({ loading: true, error: null, snapshot: null });
  useEffect(() => { void (async () => { try { const response = await fetch("/api/growth/analytics/snapshot", { headers: sessionHeaders() }); const json = await readJsonObject(response); if (!response.ok || json.success !== true) throw new Error(json.error ?? "経営ボードの取得に失敗しました。"); setState({ loading: false, error: null, snapshot: json.snapshot === null ? null : snapshotSchema.parse(json.snapshot) }); } catch (error: unknown) { setState({ loading: false, error: error instanceof Error ? error.message : "経営ボードの取得に失敗しました。", snapshot: null }); } })(); }, []);
  if (state.loading) return <main className="analytics-page"><p role="status">経営ボードを読み込んでいます。</p></main>;
  if (state.error) return <main className="analytics-page"><p role="alert">{state.error}</p></main>;
  if (state.snapshot === null) return <main className="analytics-page"><h1>経営ボード</h1><p>まだ取り込みがありません。npm run growth:ingest を実行してください。</p></main>;
  const snapshot = state.snapshot;
  return <main className="analytics-page"><h1>経営ボード</h1><FreshnessBanner freshness={freshnessOf(snapshot, todayYmd())} /><KpiHeader cards={kpiCards(snapshot)} /><InsightFeed insights={sortedInsights(snapshot)} /><DemandHeatmap cells={heatmapCells(snapshot)} /><WardList wards={snapshot.catalog.wards} /><MoneyPanel money={moneyPanel(snapshot)} /><CollectingSection sections={collectingSections(snapshot)} /><footer>最終同期: {formatSyncedAtJst(snapshot.meta.sourceSyncedAt)} / 除外: {snapshot.meta.excludedCount}件</footer></main>;
}
