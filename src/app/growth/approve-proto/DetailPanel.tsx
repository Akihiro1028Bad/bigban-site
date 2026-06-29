/**
 * 詳細パネル(右カラム・#proto): ヘッダ / タブ / 本文 / 常駐フッター。
 * 1記事を「承認・修正・却下」まで完結させる承認ワークスペース。
 */
"use client";

import { useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import {
  AdviceView,
  ImagesView,
  PreviewView,
  PromptView,
} from "./DetailViews";
import { BodyCommentView } from "./BodyCommentView";
import { CommentableBody } from "./CommentableBody";
import { countByLevel, qualityChecks } from "./draftQuality";
import { styleChecks } from "./styleHints";
import { OutlineView } from "./OutlineView";
import { QualityChecklist } from "./QualityChecklist";
import { ReviseCompareView } from "./ReviseCompareView";
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
  IconKeyboard,
  IconLayout,
  IconMessage,
  IconSparkles,
  IconWand,
  IconX,
} from "./icons";
import { DraftEditWorkspace } from "./DraftEditWorkspace";
import type { Article, DetailTab, ImageInstruction, ReviseTarget } from "./types";
import { Kbd, MetaStat, StageChip } from "./ui";

interface TabDef {
  key: DetailTab;
  label: string;
  icon: React.ReactNode;
  dot?: string;
}

function tabsFor(article: Article): TabDef[] {
  const base: TabDef[] = [
    { key: "outline", label: "構成案", icon: <IconLayout size={14} /> },
    { key: "prompt", label: "プロンプト・参照", icon: <IconFileText size={14} /> },
    { key: "preview", label: "プレビュー", icon: <IconSparkles size={14} /> },
  ];
  if (article.bodyHtml) {
    const bc = article.bodyCommentStatus;
    base.push({
      key: "bodyComment",
      label: "本文コメント",
      icon: <IconMessage size={14} />,
      dot:
        bc === "presenting"
          ? "var(--p-green)"
          : bc === "requested"
            ? "var(--p-purple)"
            : (article.bodyComments?.length ?? 0) > 0
              ? "var(--p-amber)"
              : undefined,
    });
  }
  const revising = article.reviseStatus === "requested" || article.reviseStatus === "presenting";
  if (revising) {
    base.push({
      key: "revise",
      label: "修正案",
      icon: <IconWand size={14} />,
      dot: article.reviseStatus === "presenting" ? "var(--p-green)" : "var(--p-purple)",
    });
  }
  base.push({ key: "images", label: "画像", icon: <IconImage size={14} /> });
  const ad = article.adviceStatus;
  base.push({
    key: "advice",
    label: "アドバイス",
    icon: <IconCheckCircle size={14} />,
    dot:
      ad === "presenting"
        ? "var(--p-green)"
        : ad === "requested"
          ? "var(--p-purple)"
          : ad === "failed"
            ? "var(--p-red)"
            : undefined,
  });
  return base;
}

// 7枚フラットなタブを「構成案 / プレビュー / 校正 / 素材」の4クラスタに束ねる(#proto・タブ整理)。
// page.tsx 側の状態はリーフ(DetailTab)のまま据え置き、二段ナビは本コンポーネント内で完結させる。
type ClusterKey = "outline" | "preview" | "proof" | "material";

interface ClusterDef {
  key: ClusterKey;
  label: string;
  icon: React.ReactNode;
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
    { key: "proof", label: "校正", icon: <IconMessage size={14} />, leaves: pick("bodyComment", "revise", "advice") },
    { key: "material", label: "素材", icon: <IconImage size={14} />, leaves: pick("images", "prompt") },
  ];
  return defs.filter((d) => d.leaves.length > 0).map((d) => ({ ...d, dot: aggregateDot(d.leaves) }));
}

// クラスタを開いたときに最初に見せる子タブ=ドットが付いた(動きのある)子を優先、なければ先頭。
function clusterTargetLeaf(c: ClusterDef): DetailTab {
  return (c.leaves.find((l) => l.dot) ?? c.leaves[0]).key;
}

interface DetailPanelProps {
  article: Article | null;
  tab: DetailTab;
  editing: boolean;
  /** 狭幅(1ペイン)時に一覧へ戻る。lg以上では非表示。 */
  onBack?: () => void;
  onTabChange: (tab: DetailTab) => void;
  onApprove: () => void;
  onRevise: () => void;
  onReject: () => void;
  onRevert: () => void;
  onEdit: () => void;
  onSaveEdit: (html: string) => void;
  onCancelEdit: () => void;
  onApplyRevise: (target: ReviseTarget) => void;
  onDismissRevise: (target: ReviseTarget) => void;
  regenKeys: Set<string>;
  adoptedFixes: Set<string>;
  onPickEyecatch: () => void;
  onRegenEyecatch: () => void;
  onPickBodyImage: (index: number) => void;
  onRegenBodyImage: (index: number) => void;
  onAdoptAdvice: (index: number) => void;
  onAddComment: (sectionIndex: number, text: string) => void;
  onRemoveComment: (sectionIndex: number, commentIndex: number) => void;
  onUpdateImage: (sectionIndex: number, patch: Partial<ImageInstruction>) => void;
  onRequestOutlineRevise: () => void;
  onAddBodyComment: (block: number, unit: string, text: string) => void;
  onRemoveBodyComment: (index: number) => void;
  onRequestBodyComment: () => void;
  onApplyBodyFix: (block: number) => void;
  onDismissBodyFix: (block: number) => void;
  onApplyAllBodyFixes: () => void;
  onRequestAdvice: (instruction: string) => void;
  onRetryAdvice: () => void;
  onDismissAdvice: () => void;
  onSaveMeta: (text: string) => void;
  onRetryRevise: () => void;
  onRetryBodyComment: () => void;
  /** 「この文」相談モード中=true のとき本文注釈UI(CommentableBody)を前面に出す */
  consultSentenceMode?: boolean;
}

export function DetailPanel({
  article,
  tab,
  editing,
  onBack,
  onTabChange,
  onApprove,
  onRevise,
  onReject,
  onRevert,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onApplyRevise,
  onDismissRevise,
  regenKeys,
  adoptedFixes,
  onPickEyecatch,
  onRegenEyecatch,
  onPickBodyImage,
  onRegenBodyImage,
  onAdoptAdvice,
  onAddComment,
  onRemoveComment,
  onUpdateImage,
  onRequestOutlineRevise,
  onAddBodyComment,
  onRemoveBodyComment,
  onRequestBodyComment,
  onApplyBodyFix,
  onDismissBodyFix,
  onApplyAllBodyFixes,
  onRequestAdvice,
  onRetryAdvice,
  onDismissAdvice,
  onSaveMeta,
  onRetryRevise,
  onRetryBodyComment,
  consultSentenceMode,
}: DetailPanelProps) {
  const [qOpen, setQOpen] = useState(false);
  if (!article) return <EmptyDetail />;

  const tabs = tabsFor(article);
  const safeTab = tabs.some((t) => t.key === tab) ? tab : "preview";
  const clusters = clustersFromLeaves(tabs);
  const activeCluster = clusters.find((c) => c.leaves.some((l) => l.key === safeTab)) ?? clusters[0];
  const subTabs = activeCluster.leaves;
  // tabpanel と現在のタブを aria で結ぶ。内訳がある時は子タブ、無い時はクラスタを参照元にする。
  const panelLabelledBy = subTabs.length > 1 ? `proto-sub-${safeTab}` : `proto-cluster-${activeCluster.key}`;
  const decided = article.stage === "scheduled" || article.stage === "published";
  const isReviewable = article.stage === "draft_review" || article.stage === "outline_review";
  const checks = article.bodyHtml ? [...qualityChecks(article), ...styleChecks(article)] : [];
  const hasBlock = countByLevel(checks).block > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="shrink-0 px-6 pt-5 pb-3"
        style={{ borderBottom: "1px solid var(--p-border)" }}
      >
        {onBack && (
          // proto-btn-ghost の display 指定が Tailwind の hidden を上書きするため、ラッパ div 側で lg 以上は非表示にする。
          <div className="mb-2.5 lg:hidden">
            <button onClick={onBack} className="proto-btn-ghost" aria-label="記事一覧へ戻る">
              <IconArrowLeft size={14} /> 一覧
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <StageChip stage={article.stage} />
          {article.scheduledLabel && (
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-teal)" }}>
              <IconCalendar size={13} /> {article.scheduledLabel}
            </span>
          )}
          {article.reviseStatus === "presenting" && (
            <button
              onClick={() => onTabChange("revise")}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium"
              style={{ background: "var(--p-green-weak)", color: "var(--p-green)" }}
            >
              <IconWand size={12} /> 修正案が届いています
            </button>
          )}
          {article.reviseStatus === "requested" && (
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium proto-pulse"
              style={{ background: "var(--p-purple-weak)", color: "var(--p-purple)" }}
            >
              <IconWand size={12} /> 修正中…
            </span>
          )}
          {!editing && article.bodyHtml && (
            <button
              onClick={onEdit}
              className="proto-btn-ghost ml-auto"
              title="リッチエディタで本文を編集"
            >
              <IconEdit size={13} /> 本文を編集
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

        <h1 className="mt-3 text-[19px] font-semibold leading-snug tracking-tight">
          {article.title}
        </h1>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <MetaStat icon={<IconClock size={13} />} title="更新">
            {article.updatedLabel}
          </MetaStat>
          <MetaStat icon={<IconFileText size={13} />} title="文字数">
            {article.wordCount > 0 ? `${article.wordCount.toLocaleString()}字` : "—"}
          </MetaStat>
          <MetaStat icon={<IconClock size={13} />} title="読了目安">
            {article.readMinutes > 0 ? `約${article.readMinutes}分` : "—"}
          </MetaStat>
          <span
            className="rounded-full px-2 py-[2px] text-[11px]"
            style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)", fontFamily: "var(--p-mono)" }}
            title="ターゲットキーワード"
          >
            {article.keyword}
          </span>
        </div>
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
              id={`proto-cluster-${c.key}`}
              role="tab"
              aria-selected={active}
              aria-controls="proto-detail-panel"
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
                  className={c.dot.includes("purple") ? "proto-pulse" : undefined}
                  style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot }}
                />
              )}
              {active && (
                <motion.span
                  layoutId="proto-tab-underline"
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
                id={`proto-sub-${s.key}`}
                role="tab"
                aria-selected={active}
                aria-controls="proto-detail-panel"
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
                    className={s.dot.includes("purple") ? "proto-pulse" : undefined}
                    style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div
        id="proto-detail-panel"
        role="tabpanel"
        aria-labelledby={panelLabelledBy}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
      >
        {editing ? (
          <DraftEditWorkspace
            key={article.id}
            article={article}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
          />
        ) : consultSentenceMode && article.bodyHtml ? (
          <div className="overflow-y-auto px-6 py-4">
            <CommentableBody
              bodyHtml={article.bodyHtml}
              comments={article.bodyComments ?? []}
              onAddComment={onAddBodyComment}
              onRemoveComment={onRemoveBodyComment}
            />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={article.id + safeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              {safeTab === "outline" && (
                <OutlineView
                  article={article}
                  onAddComment={onAddComment}
                  onRemoveComment={onRemoveComment}
                  onUpdateImage={onUpdateImage}
                  onRequestOutlineRevise={onRequestOutlineRevise}
                />
              )}
              {safeTab === "prompt" && <PromptView article={article} />}
              {safeTab === "preview" && <PreviewView article={article} onSaveMeta={onSaveMeta} />}
              {safeTab === "bodyComment" && (
                <BodyCommentView
                  article={article}
                  onAddComment={onAddBodyComment}
                  onRemoveComment={onRemoveBodyComment}
                  onRequest={onRequestBodyComment}
                  onApplyFix={onApplyBodyFix}
                  onDismissFix={onDismissBodyFix}
                  onApplyAll={onApplyAllBodyFixes}
                  onRetry={onRetryBodyComment}
                />
              )}
              {safeTab === "revise" && (
                <ReviseCompareView
                  article={article}
                  onApply={onApplyRevise}
                  onDismiss={onDismissRevise}
                  onRetry={onRetryRevise}
                />
              )}
              {safeTab === "images" && (
                <ImagesView
                  article={article}
                  regenKeys={regenKeys}
                  onPickEyecatch={onPickEyecatch}
                  onRegenEyecatch={onRegenEyecatch}
                  onPickBodyImage={onPickBodyImage}
                  onRegenBodyImage={onRegenBodyImage}
                />
              )}
              {safeTab === "advice" && (
                <AdviceView
                  article={article}
                  adoptedFixes={adoptedFixes}
                  onAdopt={onAdoptAdvice}
                  onRequest={onRequestAdvice}
                  onRetry={onRetryAdvice}
                  onDismiss={onDismissAdvice}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
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
          {decided ? (
            <div
              className="flex w-full items-center justify-center gap-2 rounded-[10px] py-2.5 text-[13px] font-medium"
              style={{ background: "var(--p-green-weak)", color: "var(--p-green)" }}
            >
              <IconCheckCircle size={15} />
              {article.stage === "published" ? "公開済み" : "公開予約済み"}
            </div>
          ) : (
            <>
              {article.stage === "draft_review" && (
                <button
                  onClick={onRevert}
                  className="proto-btn-ghost"
                  style={{ color: "var(--p-amber)" }}
                  title="下書きを破棄して構成案レビューに戻す"
                >
                  <IconWand size={14} /> 構成からやり直す
                </button>
              )}
              <button
                onClick={onReject}
                className="proto-btn-ghost"
                style={{ color: "var(--p-red)" }}
              >
                <IconX size={14} /> 却下
              </button>
              <button onClick={onRevise} className="proto-btn-ghost">
                <IconWand size={14} /> 修正を依頼 <span className="hidden sm:inline-flex"><Kbd>R</Kbd></span>
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
                  disabled={!isReviewable || hasBlock}
                  className="proto-btn-primary flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:justify-start"
                  style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                  title={hasBlock ? "公開不可の項目を直すと承認できます" : undefined}
                >
                  <IconCheck size={15} />
                  {article.stage === "outline_review" ? "構成案を承認" : "承認して公開予約"}
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

function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-[14px]"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)", color: "var(--p-text-3)" }}
      >
        <IconKeyboard size={26} />
      </div>
      <div>
        <div className="text-[15px] font-medium">記事を選んでください</div>
        <div className="mt-1.5 text-[13px]" style={{ color: "var(--p-text-3)" }}>
          左のリストから選ぶか、キーボードで操作できます
        </div>
      </div>
      <div className="flex flex-col gap-2 text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
        <div className="flex items-center gap-2">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <span>で記事を移動</span>
        </div>
        <div className="flex items-center gap-2">
          <Kbd>A</Kbd>
          <span>承認</span>
          <span style={{ color: "var(--p-text-3)" }}>/</span>
          <Kbd>R</Kbd>
          <span>修正を依頼</span>
        </div>
        <div className="flex items-center gap-2">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <span>でコマンドパレット</span>
        </div>
      </div>
    </div>
  );
}
