/**
 * 承認ドロワー(#proto2・承認の核): 右からスライドする1記事の判断面。
 * 最上部に確信メーター＋(下書き時)公開前ゲート＋承認CTA(ロック→解錠)、下に本文プレビュー。
 * 校正/素材/根拠は後続の増分で肉付けする。
 */
"use client";

import { motion } from "framer-motion";

import { countByLevel, qualityChecks } from "../approve-proto/draftQuality";
import type { Article } from "../approve-proto/types";
import { StageChip, StageStepper, STAGE_STEP } from "./parts";

interface DrawerProps {
  article: Article;
  onClose: () => void;
  onApprove: () => void;
  onRevise: () => void;
  onReject: () => void;
  onRevert: () => void;
}

function ConfidenceMeter({ article, gateClear }: { article: Article; gateClear: boolean }) {
  const filled = STAGE_STEP[article.stage];
  const c1 = filled >= 2; // 狙い(構成確定)
  const c2 = !!article.bodyHtml; // 中身(本文あり)
  const c3 = c2 && gateClear; // 公開可
  const checks = [
    { label: "狙い", done: c1 },
    { label: "中身", done: c2 },
    { label: "公開", done: c3 },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
      <span style={{ display: "inline-flex", gap: 4 }} aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} style={{ width: 16, height: 6, borderRadius: 2, background: i < filled ? "var(--p-accent)" : "var(--p-border-strong)" }} />
        ))}
      </span>
      <span style={{ display: "inline-flex", gap: 10, fontSize: 11.5, color: "var(--p-muted)" }}>
        {checks.map((c, i) => (
          <span key={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: c.done ? "var(--p-ready)" : "var(--p-muted)" }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            {c.label}
            {c.done ? " ✓" : " —"}
          </span>
        ))}
      </span>
    </div>
  );
}

function GateDot({ color, n }: { color: string; n: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--p-text-2)" }}>
      <span className="proto2-dot" style={{ background: color }} /> <span className="proto2-num">{n}</span>
    </span>
  );
}

export function Drawer({ article, onClose, onApprove, onRevise, onReject, onRevert }: DrawerProps) {
  const checks = article.bodyHtml ? qualityChecks(article) : [];
  const lv = countByLevel(checks);
  const gateClear = lv.block === 0;
  const firstBlock = checks.find((c) => c.level === "block");

  const isOutline = article.stage === "outline_review";
  const isDraft = article.stage === "draft_review";
  const isGenerating = article.stage === "generating";
  const decided = article.stage === "scheduled" || article.stage === "published";

  const primaryLabel = isOutline ? "構成を承認 → 生成を依頼" : "下書きを承認 → 公開予約";
  const locked = isDraft && !gateClear;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", justifyContent: "flex-end" }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(20,22,28,0.28)" }}
      />
      <motion.aside
        initial={{ x: 18, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 18, opacity: 0 }}
        transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        className="proto2-scroll"
        role="dialog"
        aria-modal="true"
        aria-label={article.title}
        style={{
          position: "relative",
          width: "min(520px, 92vw)",
          background: "var(--p-surface)",
          borderLeft: "0.5px solid var(--p-border)",
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          boxShadow: "0 8px 28px rgba(20,22,28,0.10)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ヘッダ(sticky): 段階チップ＋タイトル＋確信メーター */}
        <div style={{ position: "sticky", top: 0, zIndex: 1, padding: "14px 18px 12px", background: "var(--p-surface)", borderBottom: "0.5px solid var(--p-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StageChip stage={article.stage} />
            <StageStepper stage={article.stage} />
            <button onClick={onClose} className="proto2-btn" style={{ marginLeft: "auto", padding: "5px 9px" }} aria-label="閉じる">
              閉じる
            </button>
          </div>
          <h1 style={{ margin: "10px 0 0", fontSize: 16.5, fontWeight: 500, lineHeight: 1.4 }}>{article.title}</h1>
          <ConfidenceMeter article={article} gateClear={gateClear} />
        </div>

        {/* アクションゾーン */}
        <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--p-border)" }}>
          {decided ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: "var(--p-ready-weak)", color: "var(--p-ready)", fontSize: 13, fontWeight: 500 }}>
              ✓ {article.stage === "published" ? "公開済み" : "公開予約済み"}
            </div>
          ) : isGenerating ? (
            <div>
              <div style={{ fontSize: 13, color: "var(--p-text-2)", marginBottom: 8 }}>
                AIが執筆中（セクション {article.genProgress ? Math.round((article.genProgress / 100) * 4) : 2} / 4）
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--p-surface-active)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${article.genProgress ?? 52}%`, background: "var(--p-accent)", borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 8 }}>できた所から、また要対応に戻します。手は一旦離れます。</div>
            </div>
          ) : (
            <>
              {isDraft && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 11.5, color: "var(--p-muted)" }}>公開前ゲート</span>
                  <GateDot color="var(--p-fail)" n={lv.block} />
                  <GateDot color="var(--p-progress)" n={lv.warn} />
                  <GateDot color="var(--p-ready)" n={lv.ok} />
                </div>
              )}

              <button
                onClick={onApprove}
                disabled={locked}
                className={locked ? "" : "proto2-btn-ink"}
                style={
                  locked
                    ? { display: "inline-flex", alignItems: "center", gap: 7, width: "100%", justifyContent: "center", padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--p-surface-active)", border: "0.5px solid var(--p-border)", color: "var(--p-muted)", cursor: "not-allowed" }
                    : { width: "100%", justifyContent: "center", padding: "10px 14px", borderRadius: 8, fontSize: 13 }
                }
              >
                {locked ? "🔒 " : "✓ "}
                {primaryLabel}
              </button>

              {locked && firstBlock && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--p-fail)" }}>
                  <span>⚠ あと{lv.block}項目：{firstBlock.label}</span>
                  <button onClick={onRevise} className="proto2-btn" style={{ marginLeft: "auto", padding: "4px 9px", color: "var(--p-fail)", borderColor: "#e9b8b8" }}>
                    不足を直すよう依頼
                  </button>
                </div>
              )}

              {isOutline && (
                <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 8 }}>承認すると本文生成が始まります（手は一旦離れます）。</div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button onClick={onRevise} className="proto2-btn">{isOutline ? "構成を修正依頼" : "本文を修正依頼"}</button>
                {isDraft && <button onClick={onRevert} className="proto2-btn" style={{ color: "var(--p-amber)" }}>構成からやり直す</button>}
                <button onClick={onReject} className="proto2-btn" style={{ color: "var(--p-fail)" }}>却下</button>
              </div>
            </>
          )}
        </div>

        {/* 本文/構成プレビュー */}
        <div style={{ flex: 1, padding: "16px 18px" }}>
          {article.bodyHtml ? (
            // mockData.ts 由来の静的HTMLのみ。本番は microCMS 由来を許可リストでサニタイズしてから渡す。
            <div className="proto2-article" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
          ) : article.outline.length > 0 ? (
            <ol style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
              {article.outline.map((s, i) => (
                <li key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--p-surface-2)", border: "0.5px solid var(--p-border)" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{i + 1}. {s.heading}</div>
                  {s.summary && <div style={{ fontSize: 12.5, color: "var(--p-text-3)", marginTop: 2 }}>{s.summary}</div>}
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ color: "var(--p-muted)", fontSize: 13 }}>まだプレビューはありません。</div>
          )}

          {article.hypothesis && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontSize: 12, color: "var(--p-muted)", cursor: "pointer" }}>▸ なぜこの記事か（根拠）</summary>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                {[
                  ["狙う読者", article.hypothesis.targetReader],
                  ["検索意図", article.hypothesis.searchIntent],
                  ["勝ち筋", article.hypothesis.winningAngle],
                  ["成功指標", article.hypothesis.successMetric],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10.5, color: "var(--p-text-3)" }}>{k}</div>
                    <div style={{ fontSize: 12.5, color: "var(--p-text-2)" }}>{v}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </motion.aside>
    </div>
  );
}
