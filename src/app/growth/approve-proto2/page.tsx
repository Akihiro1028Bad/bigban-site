/**
 * 承認コンソール v2 (#proto2) — IA「パイプライン1本道」× ビジュアルC「クリアデイ」。
 *
 * 0ベース再設計の実装。現 approve-proto は温存し、本ルートで作り直す。
 * 段階を切り替えるのではなく記事が段階を進む。左レール=段階別ステーション、作業ホームは盤ひとつ。
 * 本increment: 基盤＋パイプライン盤(TopBar/StationRail/ArticleRow/StageStepper)。ドロワー等は後続。
 */
"use client";

import { useMemo, useState } from "react";

import { STAGE_META } from "../approve-proto/stages";
import type { Article, Stage } from "../approve-proto/types";
import { MOCK_ARTICLES } from "../approve-proto/mockData";
import "./proto2.css";

const STAGE_STEP: Record<Stage, number> = {
  idea: 1,
  outline_review: 2,
  generating: 3,
  draft_review: 4,
  scheduled: 5,
  published: 6,
};

/** 戻り(pull型の依頼の返り)が届いているか。決定済み(公開/予約/ネタ)は対象外。 */
function hasReturn(a: Article): boolean {
  if (a.stage === "published" || a.stage === "scheduled" || a.stage === "idea") return false;
  return (
    a.reviseStatus === "presenting" ||
    a.adviceStatus === "presenting" ||
    a.bodyCommentStatus === "presenting"
  );
}

interface Station {
  key: string;
  label: string;
  match: (a: Article) => boolean;
  /** バッジ色: accent=最優先(黒地)/ready=戻り(緑)/通常=ミュート。 */
  tone?: "accent" | "ready";
}

const STATIONS: Station[] = [
  { key: "awaiting", label: "要対応", match: (a) => a.awaitingYou, tone: "accent" },
  { key: "returned", label: "戻りあり", match: hasReturn, tone: "ready" },
  { key: "outline", label: "構成まち", match: (a) => a.stage === "outline_review" },
  { key: "draft", label: "下書きまち", match: (a) => a.stage === "draft_review" },
  { key: "scheduled", label: "予約まち", match: (a) => a.stage === "scheduled" },
  { key: "generating", label: "待機中", match: (a) => a.stage === "generating" },
  { key: "idea", label: "ネタ", match: (a) => a.stage === "idea" },
  { key: "published", label: "公開済み", match: (a) => a.stage === "published" },
];

interface NextAction {
  label: string;
  /** 承認可(黒CTA) / それ以外(ゴースト) / 無効(ミュート・触れない)。 */
  kind: "primary" | "ghost" | "muted";
}

function nextAction(a: Article): NextAction {
  switch (a.stage) {
    case "outline_review":
      return { label: "構成を承認", kind: a.awaitingYou ? "primary" : "ghost" };
    case "draft_review":
      return hasReturn(a)
        ? { label: "戻りを確認", kind: "ghost" }
        : { label: "下書きを承認", kind: a.awaitingYou ? "primary" : "ghost" };
    case "generating":
      return { label: `AIが執筆中${a.genProgress ? ` ${Math.round((a.genProgress / 100) * 4)}/4` : ""}`, kind: "muted" };
    case "scheduled":
      return { label: a.scheduledLabel ?? "公開予約済み", kind: "muted" };
    case "idea":
      return { label: "記事化を承認", kind: "ghost" };
    case "published":
      return { label: "成績を見る", kind: "muted" };
    default:
      return { label: "", kind: "muted" };
  }
}

function StageStepper({ stage }: { stage: Stage }) {
  const filled = STAGE_STEP[stage];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => {
        const done = i < filled;
        const cur = i === filled - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: cur ? 8 : 7,
                height: cur ? 8 : 7,
                borderRadius: "50%",
                background: done ? "var(--p-accent)" : "transparent",
                border: done ? "none" : "1.5px solid var(--p-border-strong)",
                boxShadow: cur ? "0 0 0 3px var(--p-accent-weak)" : "none",
              }}
            />
            {i < 5 && <span style={{ width: 7, height: 2, background: done ? "var(--p-accent)" : "var(--p-border)" }} />}
          </span>
        );
      })}
    </span>
  );
}

function StageChip({ stage }: { stage: Stage }) {
  const meta = STAGE_META[stage];
  const tone = meta.tone === "gray" ? "text-3" : meta.tone;
  const shortLabel = meta.label.replace("レビュー", "").replace("案", "");
  return (
    <span
      className="proto2-num"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 500,
        color: `var(--p-${tone})`,
        background: `var(--p-${tone}-weak)`,
        borderRadius: 999,
        padding: "2px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {shortLabel}
    </span>
  );
}

function ArticleRow({
  article,
  active,
  onSelect,
}: {
  article: Article;
  active: boolean;
  onSelect: () => void;
}) {
  const na = nextAction(article);
  const returned = hasReturn(article);
  const muted = article.stage === "generating";
  const tone = STAGE_META[article.stage].tone;
  const toneVar = tone === "gray" ? "text-3" : tone;

  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "11px 13px",
        textAlign: "left",
        borderRadius: 10,
        background: active ? "var(--p-surface)" : muted ? "var(--p-surface-2)" : "var(--p-surface)",
        border: active ? "0.5px solid var(--p-border-strong)" : "0.5px solid var(--p-border)",
        boxShadow: active ? "0 0 0 1px var(--p-border-strong)" : "none",
        opacity: muted ? 0.82 : 1,
        transition: "background 0.14s cubic-bezier(0.2,0,0,1), border-color 0.14s",
      }}
    >
      <StageStepper stage={article.stage} />
      <span
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 8,
          background: `var(--p-${toneVar}-weak)`,
          border: "0.5px solid var(--p-border)",
        }}
      />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "block",
            fontSize: 13.5,
            fontWeight: 500,
            color: muted ? "var(--p-text-3)" : "var(--p-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {article.title}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--p-text-3)", marginTop: 1 }}>{article.keyword}</span>
      </span>
      {returned && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--p-ready)", flexShrink: 0 }}>
          <span className="proto2-dot" style={{ background: "var(--p-ready)" }} /> 戻りあり
        </span>
      )}
      <StageChip stage={article.stage} />
      <span
        style={{
          fontSize: 12,
          fontWeight: na.kind === "muted" ? 400 : 500,
          color: na.kind === "primary" ? "var(--p-accent)" : na.kind === "muted" ? "var(--p-text-3)" : "var(--p-text-2)",
          flexShrink: 0,
          whiteSpace: "nowrap",
          minWidth: 88,
          textAlign: "right",
        }}
      >
        {na.kind === "muted" ? na.label : `次：${na.label}`}
      </span>
    </button>
  );
}

export default function ApproveConsoleV2() {
  const articles = useMemo(() => MOCK_ARTICLES, []);
  const counts = useMemo(
    () => STATIONS.map((s) => ({ ...s, count: articles.filter(s.match).length })),
    [articles]
  );
  const [stationKey, setStationKey] = useState("awaiting");
  const station = STATIONS.find((s) => s.key === stationKey) ?? STATIONS[0];
  const rows = useMemo(() => articles.filter(station.match), [articles, station]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const awaitingCount = articles.filter((a) => a.awaitingYou).length;

  return (
    <div className="proto2-root flex flex-col">
      {/* TopBar: ループヘルス + 投げた依頼トレイ + ⌘K */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 48,
          padding: "0 16px",
          borderBottom: "0.5px solid var(--p-border)",
          background: "var(--p-surface)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500 }}>承認コンソール</span>
        <span
          className="proto2-num"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--p-green)", background: "var(--p-green-weak)", border: "0.5px solid #cdebd6", borderRadius: 999, padding: "3px 10px" }}
        >
          <span className="proto2-dot" style={{ background: "var(--p-ready)" }} /> ループ：最終巡回 14:20 ✓
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--p-muted)" }}>
          投げた依頼：修正2・画像1待機
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--p-text-2)" }}>
            <span className="proto2-dot" style={{ background: "var(--p-ready)" }} /> 1件戻りあり
          </span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--p-muted)", border: "0.5px solid var(--p-border)", borderRadius: 7, padding: "3px 9px", fontFamily: "var(--p-mono)" }}>⌘K</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左レール: 段階別ステーション */}
        <nav
          className="proto2-scroll"
          style={{ width: 172, flexShrink: 0, padding: "8px 8px", borderRight: "0.5px solid var(--p-border)", background: "var(--p-surface)" }}
          aria-label="パイプライン段階"
        >
          {counts.map((s) => {
            const isActive = s.key === stationKey;
            return (
              <button
                key={s.key}
                onClick={() => { setStationKey(s.key); setActiveId(null); }}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  height: 34,
                  padding: "0 9px",
                  borderRadius: 7,
                  background: isActive ? "var(--p-surface-2)" : "transparent",
                  color: isActive ? "var(--p-text)" : "var(--p-text-2)",
                  fontSize: 12.5,
                  fontWeight: isActive ? 500 : 400,
                  textAlign: "left",
                }}
              >
                {isActive && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: 0, background: "var(--p-accent)" }} />}
                {s.tone && s.count > 0 && (
                  <span className="proto2-dot" style={{ background: s.tone === "accent" ? "var(--p-accent)" : "var(--p-ready)" }} />
                )}
                <span style={{ flex: 1 }}>{s.label}</span>
                {s.count > 0 && (
                  <span
                    className="proto2-num"
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      minWidth: 18,
                      textAlign: "center",
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: s.tone === "accent" ? "var(--p-ink)" : s.tone === "ready" ? "var(--p-fail-weak)" : "transparent",
                      color: s.tone === "accent" ? "#fff" : s.tone === "ready" ? "#a32d2d" : "var(--p-muted)",
                    }}
                  >
                    {s.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* 盤本体 */}
        <main className="proto2-scroll" style={{ flex: 1, minWidth: 0, padding: "14px 18px", background: "var(--p-bg)" }}>
          <div style={{ maxWidth: 880, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <h1 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{station.label}</h1>
              <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>
                {station.key === "awaiting"
                  ? `あなた待ち ${awaitingCount}件 ・ 推定18分`
                  : `${rows.length}件`}
              </span>
            </div>

            {rows.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: "var(--p-muted)", fontSize: 13 }}>
                このステーションは空です。
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.map((a) => (
                  <ArticleRow key={a.id} article={a} active={a.id === activeId} onSelect={() => setActiveId(a.id)} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
