/**
 * 承認コンソール v2 (#proto2) — IA「パイプライン1本道」× ビジュアルC「クリアデイ」。
 *
 * 0ベース再設計の実装。現 approve-proto は温存し、本ルートで作り直す。
 * 段階を切り替えるのではなく記事が段階を進む。左レール=段階別ステーション、作業ホームは盤ひとつ。
 * 本increment: 盤＋ドロワー(承認の核)。pull型トレイ/校正/素材/一括は後続。
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence } from "framer-motion";

import { countByLevel, qualityChecks } from "../approve-proto/draftQuality";
import type { Article, Stage } from "../approve-proto/types";
import { MOCK_ARTICLES } from "../approve-proto/mockData";
import { Drawer } from "./Drawer";
import { hasReturn, StageChip, StageStepper, stageToneVar } from "./parts";
import "./proto2.css";

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

interface RowProps {
  article: Article;
  active: boolean;
  cursor: boolean;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
}

function ArticleRow({ article, active, cursor, selected, selectable, onSelect, onToggleSelect }: RowProps) {
  const na = nextAction(article);
  const returned = hasReturn(article);
  const muted = article.stage === "generating";
  const toneVar = stageToneVar(article.stage);

  return (
    <button
      onClick={onSelect}
      data-row={article.id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        width: "100%",
        padding: "11px 13px",
        textAlign: "left",
        borderRadius: 10,
        background: selected ? "var(--p-info-weak)" : muted ? "var(--p-surface-2)" : "var(--p-surface)",
        border: "0.5px solid var(--p-border)",
        boxShadow: cursor ? "0 0 0 2px var(--p-accent)" : active ? "0 0 0 1px var(--p-border-strong)" : "none",
        opacity: muted ? 0.82 : 1,
        transition: "background 0.14s cubic-bezier(0.2,0,0,1), border-color 0.14s, box-shadow 0.1s",
      }}
    >
      {selectable ? (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label="選択"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            borderRadius: 5,
            border: selected ? "none" : "1.5px solid var(--p-border-strong)",
            background: selected ? "var(--p-accent)" : "transparent",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
          }}
        >
          {selected ? "✓" : ""}
        </span>
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}
      <StageStepper stage={article.stage} />
      <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 8, background: `var(--p-${toneVar}-weak)`, border: "0.5px solid var(--p-border)" }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: muted ? "var(--p-text-3)" : "var(--p-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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

const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  idea: "outline_review",
  outline_review: "generating",
  draft_review: "scheduled",
};

export default function ApproveConsoleV2() {
  const [articles, setArticles] = useState<Article[]>(MOCK_ARTICLES);
  const [stationKey, setStationKey] = useState("awaiting");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursorId, setCursorId] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const counts = useMemo(() => STATIONS.map((s) => ({ ...s, count: articles.filter(s.match).length })), [articles]);
  const station = STATIONS.find((s) => s.key === stationKey) ?? STATIONS[0];
  const rows = useMemo(() => articles.filter(station.match), [articles, station]);
  const awaitingCount = useMemo(() => articles.filter((a) => a.awaitingYou).length, [articles]);
  const activeArticle = articles.find((a) => a.id === activeId) ?? null;

  const patch = (id: string, p: Partial<Article>) => setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));

  const approve = (id: string) => {
    const a = articles.find((x) => x.id === id);
    if (!a) return;
    const next = NEXT_STAGE[a.stage];
    if (!next) return;
    if (a.stage === "outline_review") { patch(id, { stage: next, awaitingYou: false, genProgress: 8 }); showToast("構成を承認しました。本文生成を依頼（取り消し）"); }
    else if (a.stage === "draft_review") { patch(id, { stage: next, awaitingYou: false, scheduledLabel: "明日 09:00" }); showToast("下書きを承認しました。公開予約（取り消し）"); }
    else { patch(id, { stage: next, awaitingYou: true }); showToast("記事化を承認しました"); }
    setActiveId(null);
  };
  const revise = (id: string) => { patch(id, { awaitingYou: false, reviseStatus: "requested" }); showToast("修正を依頼しました（取り消し）"); setActiveId(null); };
  const reject = (id: string) => { patch(id, { awaitingYou: false }); showToast("却下しました（取り消し）"); setActiveId(null); };
  const revert = (id: string) => { patch(id, { stage: "outline_review", awaitingYou: true, reviseStatus: "none" }); showToast("構成からやり直します"); setActiveId(null); };

  const selectableOf = (a: Article) => a.awaitingYou && !!NEXT_STAGE[a.stage];
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelect = () => setSelectedIds(new Set());

  // 一括承認の安全境界: 選択中＋承認可＋(下書きはゲート全通過)のみ。block記事は自動除外。
  const bulkEligible = (a: Article) =>
    selectedIds.has(a.id) && selectableOf(a) &&
    !(a.stage === "draft_review" && countByLevel(a.bodyHtml ? qualityChecks(a) : []).block > 0);
  const eligibleCount = articles.filter(bulkEligible).length;

  const bulkApprove = () => {
    const ids = new Set(articles.filter(bulkEligible).map((t) => t.id));
    if (ids.size === 0) return;
    setArticles((prev) =>
      prev.map((a) => {
        if (!ids.has(a.id)) return a;
        const next = NEXT_STAGE[a.stage];
        if (!next) return a;
        if (a.stage === "outline_review") return { ...a, stage: next, awaitingYou: false, genProgress: 8 };
        if (a.stage === "draft_review") return { ...a, stage: next, awaitingYou: false, scheduledLabel: "明日 09:00" };
        return { ...a, stage: next, awaitingYou: true };
      })
    );
    showToast(`${ids.size}件を承認しました（取り消し）`);
    clearSelect();
  };
  const bulkReject = () => {
    const n = selectedIds.size;
    setArticles((prev) => prev.map((a) => (selectedIds.has(a.id) ? { ...a, awaitingYou: false } : a)));
    showToast(`${n}件を却下しました（取り消し）`);
    clearSelect();
  };

  // キーボード操作(週次バッチ): J/K=カーソル移動・Enter=ドロワー・A=承認・X=選択・Esc=閉/選択解除。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") {
        if (activeId) setActiveId(null);
        else if (selectedIds.size) clearSelect();
        return;
      }
      if (activeId) return;
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return;
      const idx = cursorId ? ids.indexOf(cursorId) : -1;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursorId(ids[Math.min(ids.length - 1, idx + 1)] ?? ids[0]); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursorId(idx <= 0 ? ids[0] : ids[idx - 1]); }
      else if (e.key === "Enter") { if (cursorId) setActiveId(cursorId); }
      else if (k === "a") { const a = articles.find((x) => x.id === cursorId); if (a && selectableOf(a)) approve(a.id); }
      else if (k === "x") { const a = articles.find((x) => x.id === cursorId); if (a && selectableOf(a)) toggleSelect(a.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cursorId, activeId, selectedIds, articles]);

  return (
    <div className="proto2-root flex flex-col">
      <header style={{ display: "flex", alignItems: "center", gap: 16, height: 48, padding: "0 16px", borderBottom: "0.5px solid var(--p-border)", background: "var(--p-surface)", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>承認コンソール</span>
        <span className="proto2-num" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--p-green)", background: "var(--p-green-weak)", border: "0.5px solid #cdebd6", borderRadius: 999, padding: "3px 10px" }}>
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
        <nav className="proto2-scroll" style={{ width: 172, flexShrink: 0, padding: "8px 8px", borderRight: "0.5px solid var(--p-border)", background: "var(--p-surface)" }} aria-label="パイプライン段階">
          {counts.map((s) => {
            const isActive = s.key === stationKey;
            return (
              <button
                key={s.key}
                onClick={() => { setStationKey(s.key); setActiveId(null); setCursorId(null); clearSelect(); }}
                style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, width: "100%", height: 34, padding: "0 9px", borderRadius: 7, background: isActive ? "var(--p-surface-2)" : "transparent", color: isActive ? "var(--p-text)" : "var(--p-text-2)", fontSize: 12.5, fontWeight: isActive ? 500 : 400, textAlign: "left" }}
              >
                {isActive && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, background: "var(--p-accent)" }} />}
                {s.tone && s.count > 0 && <span className="proto2-dot" style={{ background: s.tone === "accent" ? "var(--p-accent)" : "var(--p-ready)" }} />}
                <span style={{ flex: 1 }}>{s.label}</span>
                {s.count > 0 && (
                  <span className="proto2-num" style={{ fontSize: 11, fontWeight: 500, minWidth: 18, textAlign: "center", padding: "1px 6px", borderRadius: 999, background: s.tone === "accent" ? "var(--p-ink)" : s.tone === "ready" ? "var(--p-fail-weak)" : "transparent", color: s.tone === "accent" ? "#fff" : s.tone === "ready" ? "#a32d2d" : "var(--p-muted)" }}>
                    {s.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <main className="proto2-scroll" style={{ flex: 1, minWidth: 0, padding: "14px 18px", background: "var(--p-bg)" }}>
          <div style={{ maxWidth: 880, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <h1 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{station.label}</h1>
              <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>{station.key === "awaiting" ? `あなた待ち ${awaitingCount}件 ・ 推定18分` : `${rows.length}件`}</span>
            </div>

            {rows.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: "var(--p-muted)", fontSize: 13 }}>このステーションは空です。</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.map((a) => (
                  <ArticleRow
                    key={a.id}
                    article={a}
                    active={a.id === activeId}
                    cursor={a.id === cursorId}
                    selected={selectedIds.has(a.id)}
                    selectable={selectableOf(a)}
                    onSelect={() => setActiveId(a.id)}
                    onToggleSelect={() => toggleSelect(a.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 45, display: "flex", alignItems: "center", gap: 12, padding: "8px 10px 8px 16px", borderRadius: 12, background: "var(--p-surface)", border: "0.5px solid var(--p-border-strong)", boxShadow: "0 8px 28px rgba(20,22,28,0.14)" }}>
          <span className="proto2-num" style={{ fontSize: 12.5 }}>
            <b style={{ fontWeight: 500 }}>{selectedIds.size}</b>件選択中
            {eligibleCount < selectedIds.size && <span style={{ color: "var(--p-muted)" }}>（承認可 {eligibleCount}）</span>}
          </span>
          <span style={{ width: 1, height: 18, background: "var(--p-border)" }} />
          <button onClick={bulkReject} className="proto2-btn" style={{ color: "var(--p-fail)" }}>まとめて却下</button>
          <button onClick={bulkApprove} disabled={eligibleCount === 0} className="proto2-btn-ink" style={{ opacity: eligibleCount === 0 ? 0.4 : 1 }}>
            まとめて承認 {eligibleCount > 0 ? eligibleCount : ""}
          </button>
          <button onClick={clearSelect} aria-label="選択解除" className="proto2-btn" style={{ padding: "5px 9px" }}>×</button>
        </div>
      )}

      <AnimatePresence>
        {activeArticle && (
          <Drawer
            key={activeArticle.id}
            article={activeArticle}
            onClose={() => setActiveId(null)}
            onApprove={() => approve(activeArticle.id)}
            onRevise={() => revise(activeArticle.id)}
            onReject={() => reject(activeArticle.id)}
            onRevert={() => revert(activeArticle.id)}
          />
        )}
      </AnimatePresence>

      {toast && (
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 10, background: "var(--p-ink)", color: "#fff", fontSize: 12.5, boxShadow: "0 8px 28px rgba(20,22,28,0.18)" }}>
          {toast}
          <button onClick={() => setToast(null)} style={{ color: "#cfd2d6", fontSize: 11.5, background: "transparent", border: "none" }}>取り消し</button>
        </div>
      )}
    </div>
  );
}
