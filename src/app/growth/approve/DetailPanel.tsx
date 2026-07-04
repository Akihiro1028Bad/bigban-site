/**
 * 詳細パネル(右カラム・#proto P3b 本番移植): ヘッダ / 2段タブ / 本文 / 常駐フッター。
 * 1記事を「承認・修正・却下」まで完結させる承認ワークスペース。
 *
 * proto DetailPanel を本番データ(PendingItem / DraftState / BoardStage)へ束ね直したもの。
 * 差分(設計判断):
 * - 記事未選択(EmptyDetail)は親(ApproveClient)が「記事を選択」プレースホルダで担うため移植しない。
 * - 本文行コメント(proto CommentableBody)はドロワー(ConsultComposer sentence → CommentableBody)に
 *   一本化した。詳細パネルは「この文を直す」相談中も常に通常タブ(プレビュー/構成案/素材)を表示する
 *   (左プレビューは維持・コメントはドロワーだけ / F7)。
 * - 手動リッチ編集(TipTap)は親の全画面 overlay(renderEditWorkspace)が担うため、DetailPanel の
 *   `editing` はヘッダの「編集中」バッジ表示のみに縮約する(body の tabpanel は通常表示のまま)。
 * - フッターの公開前チェックは本番 draftQuality(...) のみ(styleLint/StyleHints の合流は将来拡張)。
 */
"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { AnimatePresence, motion } from "framer-motion";

import type { ArticleHypothesis } from "@/lib/growth/approve";

import { bodyImageUrlsOf } from "./detailBodyImages";
import { ImagesView, PreviewView, PromptView } from "./DetailViews";
import { countByLevel, draftQuality } from "./draftQuality";
import type { DraftState } from "./draftTypes";
import type { ImageInstruction } from "./imageIntentTypes";
import { OutlineView } from "./OutlineView";
import type { OutlineViewSection } from "./OutlineView";
import { QualityChecklist } from "./QualityChecklist";
import type { PendingItem } from "./types";
import type { BoardStage } from "./ui/boardStage";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconEdit,
  IconFileText,
  IconImage,
  IconLayout,
  IconSparkles,
  IconWand,
  IconX,
} from "./ui/icons";
import { Kbd, MetaStat, StageChip } from "./ui/primitives";

/** 詳細パネルのタブ(リーフ)。ApproveClient 側は常にリーフ状態を保持する。 */
export type DetailTab = "outline" | "prompt" | "preview" | "images";

interface TabDef {
  key: DetailTab;
  label: string;
  icon: ReactNode;
  dot?: string;
}

function tabsFor(): TabDef[] {
  return [
    { key: "outline", label: "構成案", icon: <IconLayout size={14} /> },
    { key: "prompt", label: "プロンプト・参照", icon: <IconFileText size={14} /> },
    { key: "preview", label: "プレビュー", icon: <IconSparkles size={14} /> },
    { key: "images", label: "画像", icon: <IconImage size={14} /> },
  ];
}

// フラットなタブを「構成案 / プレビュー / 素材」のクラスタに束ねる(#proto・タブ整理)。
// 親の状態はリーフ(DetailTab)のまま据え置き、二段ナビは本コンポーネント内で完結させる。
type ClusterKey = "outline" | "preview" | "material";

interface ClusterDef {
  key: ClusterKey;
  label: string;
  icon: ReactNode;
  leaves: TabDef[];
  dot?: string;
}

// 子タブのドットを1色に集約。最も「見るべき」順=届いた(緑)>処理中(紫)>失敗(赤)>情報(琥珀)。
const DOT_PRIORITY = ["var(--p-green)", "var(--p-purple)", "var(--p-red)", "var(--p-amber)"];

function aggregateDot(leaves: TabDef[]): string | undefined {
  const dots = leaves.map((l) => l.dot).filter((d): d is string => Boolean(d));
  return DOT_PRIORITY.find((c) => dots.includes(c));
}

function clustersFromLeaves(leaves: TabDef[]): ClusterDef[] {
  const find = (k: DetailTab) => leaves.find((l) => l.key === k);
  const pick = (...keys: DetailTab[]) => keys.map(find).filter((t): t is TabDef => Boolean(t));

  const defs: Array<Omit<ClusterDef, "dot">> = [
    { key: "outline", label: "構成案", icon: <IconLayout size={14} />, leaves: pick("outline") },
    { key: "preview", label: "プレビュー", icon: <IconSparkles size={14} />, leaves: pick("preview") },
    { key: "material", label: "素材", icon: <IconImage size={14} />, leaves: pick("images", "prompt") },
  ];
  return defs.filter((d) => d.leaves.length > 0).map((d) => ({ ...d, dot: aggregateDot(d.leaves) }));
}

// クラスタを開いたときに最初に見せる子タブ=ドットが付いた(動きのある)子を優先、なければ先頭。
function clusterTargetLeaf(c: ClusterDef): DetailTab {
  return (c.leaves.find((l) => l.dot) ?? c.leaves[0]).key;
}

/** HTML からプレーンテキストを取り出す(本 file ローカルの小ユーティリティ)。 */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** 本文長(字)。body 優先、無ければ bodyHtml からタグ除去して数える。 */
function bodyCharCount(bodyHtml: string, body: string): number {
  const plain = body.trim().length > 0 ? body.trim() : stripTags(bodyHtml);
  return plain.length;
}

/** 読了目安(分)。日本語 400 字/分の簡易換算。 */
function readMinutesOf(chars: number): number {
  return chars > 0 ? Math.ceil(chars / 400) : 0;
}

/** 本番に更新ラベルは無いため、予約時刻があれば簡易ラベルにする(欠落耐性)。 */
function scheduledLabelOf(item: PendingItem): string | null {
  return item.scheduledAtMs != null ? "予約済み" : null;
}

export interface DetailPanelProps {
  item: PendingItem;
  stage: BoardStage;
  /** ヘッダー段階バッジのラベル(#124・detailBadge の純ロジック結果)。 */
  badgeLabel: string;
  /** 種別バッジ(📝 記事 / 📋 施策)。 */
  kindLabel: string;
  /** 判断根拠のメトリクスチップ(#226/#227・ラベル＋値)。 */
  details?: { label: string; value: string }[];
  tab: DetailTab;
  editing: boolean;
  /** preview/quality の入力源。 */
  draftState: DraftState;
  /** 狭幅(1ペイン)時に一覧へ戻る。lg以上では非表示。 */
  onBack?: () => void;
  onTabChange: (tab: DetailTab) => void;
  // 主操作(現行ロジック維持)。
  onApprove: () => void;
  onRevise: () => void;
  onReject: () => void;
  onRevert: () => void;
  /** 修正ループ処理中は「構成からやり直す」を無効化する(#43)。 */
  revertDisabled?: boolean;
  /** 修正ループ処理中は承認/却下を無効化する(#43)。 */
  decisionsDisabled?: boolean;
  /** この記事の決定(承認/却下)。決定済みなら「承認待ちに戻す」を出す(#130)。 */
  decision?: "承認" | "却下";
  /** 決定を取り消して承認待ちへ戻す(#130)。 */
  onUndo: () => void;
  onEdit: () => void;
  // プロンプト・参照タブ。
  prompt: string;
  refs?: { title: string; source: string }[];
  // 画像/構成案タブの house style 色相・スラッグ。
  hue: number;
  slug: string;
  // 画像タブ。
  regenKeys: Set<string>;
  onPickEyecatch: () => void;
  onRegenEyecatch: () => void;
  onAddBodyImage: () => void;
  // 本文画像の差し替え/再生成(#59・P1 で実データ配線)。draft 本文 HTML の抽出順 index を受け取る。
  onPickBodyImage?: (index: number) => void;
  onRegenBodyImage?: (index: number) => void;
  // 構成案タブ(OutlineView)。
  sections: OutlineViewSection[];
  hypothesis?: ArticleHypothesis;
  imageInstructions: Record<number, ImageInstruction>;
  revising: boolean;
  onAddComment: (sectionIndex: number, text: string) => void;
  onRemoveComment: (sectionIndex: number, commentIndex: number) => void;
  onUpdateImage: (sectionIndex: number, patch: Partial<ImageInstruction>) => void;
  onRequestOutlineRevise: () => void;
  // プレビュータブのメタ保存。
  onSaveMeta: (text: string) => void;
  /** 下書き取得失敗からの再読み込み(#75)。 */
  onReloadDraft: () => void;
}

export function DetailPanel({
  item,
  stage,
  badgeLabel,
  kindLabel,
  details,
  tab,
  editing,
  draftState,
  onBack,
  onTabChange,
  onApprove,
  onRevise,
  onReject,
  onRevert,
  revertDisabled,
  decisionsDisabled,
  decision,
  onUndo,
  onEdit,
  prompt,
  refs,
  hue,
  slug,
  regenKeys,
  onPickEyecatch,
  onRegenEyecatch,
  onAddBodyImage,
  onPickBodyImage,
  onRegenBodyImage,
  sections,
  hypothesis,
  imageInstructions,
  revising,
  onAddComment,
  onRemoveComment,
  onUpdateImage,
  onRequestOutlineRevise,
  onSaveMeta,
  onReloadDraft,
}: DetailPanelProps) {
  const [qOpen, setQOpen] = useState(false);

  const draft = draftState.status === "ready" ? draftState.draft : null;
  const bodyHtml = draft?.bodyHtml ?? "";
  const body = draft?.body ?? "";
  // #59/P1: 画像タブ(ImagesView)の本文画像は draft 本文 HTML から実データで供給する(枚数=length)。
  const bodyImageUrls = bodyImageUrlsOf(bodyHtml);

  const tabs = tabsFor();
  const safeTab: DetailTab = tabs.some((t) => t.key === tab) ? tab : "preview";
  const clusters = clustersFromLeaves(tabs);
  const activeCluster = clusters.find((c) => c.leaves.some((l) => l.key === safeTab)) ?? clusters[0];
  const subTabs = activeCluster.leaves;
  // tabpanel と現在のタブを aria で結ぶ。内訳がある時は子タブ、無い時はクラスタを参照元にする。
  const panelLabelledBy =
    subTabs.length > 1 ? `approve-sub-${safeTab}` : `approve-cluster-${activeCluster.key}`;

  const decided = stage === "scheduled" || stage === "published";
  // 本番差分: proto に無い `idea`(施策=kind:proposal)も承認/却下できる「最初のトリアージ」ゲート。
  // proto の記事段階(outline_review/draft_review)に加えて idea をレビュー可能にする。
  const isReviewable = stage === "draft_review" || stage === "outline_review" || stage === "idea";

  // フッターの公開前チェックは本番 draftQuality のみ(ready 時)。styleLint 合流は将来拡張。
  const checks =
    draft !== null
      ? draftQuality({
          bodyHtml,
          body,
          title: item.title,
          knownNewsPaths: draft.knownNewsPaths ? new Set(draft.knownNewsPaths) : undefined,
        })
      : [];
  const hasBlock = countByLevel(checks).block > 0;

  // ヘッダのメタ。本番に更新ラベルは無いため、出せるものだけ表示(欠落耐性)。
  const chars = draft !== null ? bodyCharCount(bodyHtml, body) : 0;
  const readMinutes = readMinutesOf(chars);
  const scheduledLabel = scheduledLabelOf(item);

  return (
    <div className="flex h-full min-h-0 flex-col" role="region" aria-label={`詳細: ${item.title}`}>
      <div className="shrink-0 px-6 pt-5 pb-3" style={{ borderBottom: "1px solid var(--p-border)" }}>
        {onBack && (
          // approve-btn-ghost の display 指定が Tailwind の hidden を上書きするため、ラッパ div 側で lg 以上は非表示にする。
          <div className="mb-2.5 lg:hidden">
            <button onClick={onBack} className="approve-btn-ghost" aria-label="記事一覧へ戻る">
              <IconArrowLeft size={14} /> 一覧
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <StageChip stage={stage} />
          {/* #124: 実効段階(楽観反映)ラベル。BoardStage チップと別に detailBadge の段階名を出す。 */}
          <span className="text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>
            {badgeLabel}
          </span>
          {/* #226/#227: 種別バッジ(記事/施策)。 */}
          <span className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>{kindLabel}</span>
          {scheduledLabel && (
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-teal)" }}>
              <IconCalendar size={13} /> {scheduledLabel}
            </span>
          )}
          {!editing && bodyHtml && (
            <button onClick={onEdit} className="approve-btn-ghost ml-auto" title="リッチエディタで本文を編集">
              <IconEdit size={13} /> 下書きを編集
            </button>
          )}
          {editing && (
            <span
              className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium"
              style={{ background: "var(--p-accent-weak)", color: "var(--p-accent)" }}
            >
              <IconEdit size={12} /> 編集中
            </span>
          )}
        </div>

        <h1 className="mt-3 text-[19px] font-semibold leading-snug tracking-tight">{item.title}</h1>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <MetaStat icon={<IconFileText size={13} />} title="文字数">
            {chars > 0 ? `${chars.toLocaleString()}字` : "—"}
          </MetaStat>
          <MetaStat icon={<IconClock size={13} />} title="読了目安">
            {readMinutes > 0 ? `約${readMinutes}分` : "—"}
          </MetaStat>
        </div>

        {/* #226/#227: 判断根拠(details)はメトリクスチップ(ラベル＋値)で出す。 */}
        {details && details.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {details.map((d) => (
              <span
                key={d.label}
                className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-[3px] text-[11.5px]"
                style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
              >
                <span style={{ color: "var(--p-text-3)" }}>{d.label}</span>
                <span className="font-medium tabular-nums" style={{ color: "var(--p-text)" }}>
                  {d.value}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <nav
        className="flex shrink-0 items-center gap-1 px-4"
        style={{ borderBottom: "1px solid var(--p-border)" }}
        role="tablist"
        aria-label="セクション"
      >
        {clusters.map((c) => {
          const active = c.key === activeCluster.key;
          return (
            <button
              key={c.key}
              id={`approve-cluster-${c.key}`}
              role="tab"
              aria-selected={active}
              aria-controls="approve-detail-panel"
              onClick={() => {
                if (!active) onTabChange(clusterTargetLeaf(c));
              }}
              className="relative flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium transition-colors"
              style={{ color: active ? "var(--p-text)" : "var(--p-text-3)" }}
            >
              {c.icon}
              {c.label}
              {c.dot && (
                <span
                  className={c.dot.includes("purple") ? "approve-pulse" : undefined}
                  style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot }}
                />
              )}
              {active && (
                <motion.span
                  layoutId="approve-tab-underline"
                  className="absolute inset-x-2 bottom-0 h-[2px] rounded-full"
                  style={{ background: "var(--p-accent)" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {subTabs.length > 1 && (
        <div
          className="flex shrink-0 items-center gap-1 px-5 py-2"
          style={{ borderBottom: "1px solid var(--p-border)", background: "var(--p-bg-elevated)" }}
          role="tablist"
          aria-label={`${activeCluster.label}の内訳`}
        >
          {subTabs.map((s) => {
            const active = s.key === safeTab;
            return (
              <button
                key={s.key}
                id={`approve-sub-${s.key}`}
                role="tab"
                aria-selected={active}
                aria-controls="approve-detail-panel"
                onClick={() => onTabChange(s.key)}
                className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  color: active ? "var(--p-text)" : "var(--p-text-3)",
                  background: active ? "var(--p-bg-active)" : "transparent",
                }}
              >
                {s.icon}
                {s.label}
                {s.dot && (
                  <span
                    className={s.dot.includes("purple") ? "approve-pulse" : undefined}
                    style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div
        id="approve-detail-panel"
        role="tabpanel"
        aria-labelledby={panelLabelledBy}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
      >
        {/* F7: 「この文を直す」相談中も詳細パネルは常に通常タブ(プレビュー/構成案/素材)を表示する。
            本文行コメント UI はドロワー(ConsultComposer sentence → CommentableBody)に一本化した。 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id + safeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {safeTab === "outline" && (
              <OutlineView
                sections={sections}
                hypothesis={hypothesis}
                hue={hue}
                imageInstructions={imageInstructions}
                revising={revising}
                onAddComment={onAddComment}
                onRemoveComment={onRemoveComment}
                onUpdateImage={onUpdateImage}
                onRequestOutlineRevise={onRequestOutlineRevise}
              />
            )}
            {safeTab === "prompt" && <PromptView prompt={prompt} refs={refs} />}
            {safeTab === "preview" && (
              // 縮約: 既存 excerpt(メタディスクリプション)は /api/growth/draft が返さないため
              // MetaEditor へ metaDescription をプリフィルできない(常に空から編集開始)。
              // DraftPreview 型・route.ts に excerpt 相当のフィールドが無く、BE 変更はしない方針のため
              // ここでは metaDescription を渡さない(F1 事実確認済み・2026-07-02)。
              <PreviewView
                stage={stage}
                draftState={draftState}
                slug={slug}
                onSaveMeta={onSaveMeta}
                onReloadDraft={onReloadDraft}
              />
            )}
            {safeTab === "images" && (
              <ImagesView
                hue={hue}
                hasEyecatch={Boolean(item.eyecatchUrl) || Boolean(draft?.eyecatch)}
                eyecatchUrl={item.eyecatchUrl ?? draft?.eyecatch}
                bodyImages={bodyImageUrls.length}
                bodyImageUrls={bodyImageUrls}
                regenKeys={regenKeys}
                itemId={item.id}
                onPickEyecatch={onPickEyecatch}
                onRegenEyecatch={onRegenEyecatch}
                onAddBodyImage={onAddBodyImage}
                onPickBodyImage={onPickBodyImage}
                onRegenBodyImage={onRegenBodyImage}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer
        className="shrink-0 px-6 py-3.5"
        style={{ borderTop: "1px solid var(--p-border)", background: "var(--p-bg-elevated)" }}
      >
        {checks.length > 0 ? (
          <QualityChecklist checks={checks} open={qOpen} onToggle={() => setQOpen((v) => !v)} />
        ) : (
          <div className="text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>
            構成案を承認すると本文が生成されます
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {decision ? (
            // #130: パネルから決定した直後は、その場で「承認待ちに戻す」で取り消せる。
            <div className="flex w-full items-center gap-2">
              <span
                className="flex items-center gap-1.5 text-[13px] font-medium"
                style={{ color: decision === "承認" ? "var(--p-green)" : "var(--p-red)" }}
              >
                <IconCheckCircle size={15} />
                {decision === "承認" ? "承認しました" : "却下しました"}
              </span>
              <button onClick={onUndo} className="approve-btn-ghost ml-auto">
                承認待ちに戻す
              </button>
            </div>
          ) : decided ? (
            <div
              className="flex w-full items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-medium"
              style={{ background: "var(--p-green-weak)", color: "var(--p-green)" }}
            >
              <IconCheckCircle size={15} />
              {stage === "published" ? "公開済み" : "公開予約済み"}
            </div>
          ) : (
            <>
              {stage === "draft_review" && (
                <button
                  onClick={onRevert}
                  disabled={revertDisabled}
                  className="approve-btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "var(--p-amber)" }}
                  title="下書きを破棄して構成案レビューに戻す"
                >
                  <IconWand size={14} /> 構成からやり直す
                </button>
              )}
              <button
                onClick={onReject}
                disabled={decisionsDisabled}
                className="approve-btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: "var(--p-red)" }}
              >
                <IconX size={14} /> 却下
              </button>
              <button onClick={onRevise} className="approve-btn-ghost">
                <IconWand size={14} /> AIに相談 <span className="hidden sm:inline-flex"><Kbd>R</Kbd></span>
              </button>
              <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
                {hasBlock && (
                  <button
                    onClick={() => setQOpen(true)}
                    className="flex items-center gap-1.5 text-[11.5px] font-medium"
                    style={{ color: "var(--p-red)" }}
                  >
                    <IconX size={13} /> 公開不可の項目があります
                  </button>
                )}
                <button
                  onClick={onApprove}
                  disabled={!isReviewable || hasBlock || decisionsDisabled}
                  className="approve-btn-primary flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:justify-start"
                  style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                  title={hasBlock ? "公開不可の項目を直すと承認できます" : undefined}
                >
                  <IconCheck size={15} />
                  {stage === "idea"
                    ? "承認"
                    : stage === "outline_review"
                      ? "構成案を承認"
                      : "承認して公開予約"}
                  <span className="hidden sm:inline-flex"><Kbd>A</Kbd></span>
                  <IconArrowRight size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
