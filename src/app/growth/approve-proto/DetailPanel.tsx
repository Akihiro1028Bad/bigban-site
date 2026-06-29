/**
 * 詳細パネル(右カラム・#proto): ヘッダ / タブ / 本文 / 常駐フッター。
 * 1記事を「承認・修正・却下」まで完結させる承認ワークスペース。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";

import {
  AdviceView,
  ImagesView,
  PreviewView,
  PromptView,
} from "./DetailViews";
import { OutlineView } from "./OutlineView";
import { ReviseCompareView } from "./ReviseCompareView";
import {
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
  IconSparkles,
  IconWand,
  IconX,
} from "./icons";
import { InlineEditor } from "./InlineEditor";
import type { Article, DetailTab, ImageStyle, ReviseTarget } from "./types";
import { Kbd, MetaStat, StageChip } from "./ui";

interface TabDef {
  key: DetailTab;
  label: string;
  icon: React.ReactNode;
  dot?: string;
}

// 未達チェック項目から、確認すべきタブへのジャンプ先。
const CHECK_TAB: Record<string, DetailTab> = {
  eyecatch: "images",
  body: "preview",
  words: "preview",
  decoration: "preview",
};

function tabsFor(article: Article): TabDef[] {
  const base: TabDef[] = [
    { key: "outline", label: "構成案", icon: <IconLayout size={14} /> },
    { key: "prompt", label: "プロンプト・参照", icon: <IconFileText size={14} /> },
    { key: "preview", label: "プレビュー", icon: <IconSparkles size={14} /> },
  ];
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
  base.push({ key: "advice", label: "アドバイス", icon: <IconCheckCircle size={14} /> });
  return base;
}

interface DetailPanelProps {
  article: Article | null;
  tab: DetailTab;
  editing: boolean;
  onTabChange: (tab: DetailTab) => void;
  onApprove: () => void;
  onRevise: () => void;
  onReject: () => void;
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
  onSetImageInstruction: (sectionIndex: number, style: ImageStyle, description: string) => void;
  onClearImageInstruction: (sectionIndex: number) => void;
  onRequestOutlineRevise: () => void;
}

export function DetailPanel({
  article,
  tab,
  editing,
  onTabChange,
  onApprove,
  onRevise,
  onReject,
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
  onSetImageInstruction,
  onClearImageInstruction,
  onRequestOutlineRevise,
}: DetailPanelProps) {
  if (!article) return <EmptyDetail />;

  const tabs = tabsFor(article);
  const safeTab = tabs.some((t) => t.key === tab) ? tab : "preview";
  const done = article.checklist.filter((c) => c.done).length;
  const ready = done === article.checklist.length;
  const decided = article.stage === "scheduled" || article.stage === "published";
  const isReviewable = article.stage === "draft_review" || article.stage === "outline_review";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="shrink-0 px-6 pt-5 pb-3"
        style={{ borderBottom: "1px solid var(--p-border)" }}
      >
        <div className="flex items-center gap-2">
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
      >
        {tabs.map((t) => {
          const active = t.key === safeTab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.key)}
              className="relative flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium transition-colors"
              style={{ color: active ? "var(--p-text)" : "var(--p-text-3)" }}
            >
              {t.icon}
              {t.label}
              {t.dot && (
                <span
                  className={t.dot.includes("purple") ? "proto-pulse" : undefined}
                  style={{ width: 7, height: 7, borderRadius: "50%", background: t.dot }}
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

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {editing ? (
          <InlineEditor
            key={article.id}
            html={article.bodyHtml}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
          />
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
                  onSetImageInstruction={onSetImageInstruction}
                  onClearImageInstruction={onClearImageInstruction}
                  onRequestOutlineRevise={onRequestOutlineRevise}
                />
              )}
              {safeTab === "prompt" && <PromptView article={article} />}
              {safeTab === "preview" && <PreviewView article={article} />}
              {safeTab === "revise" && (
                <ReviseCompareView
                  article={article}
                  onApply={onApplyRevise}
                  onDismiss={onDismissRevise}
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
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>
            公開準備
          </span>
          <div className="flex items-center gap-1.5">
            {article.checklist.map((c) => (
              <button
                key={c.key}
                onClick={() => onTabChange(CHECK_TAB[c.key] ?? "preview")}
                className="flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-medium transition-all hover:brightness-125"
                style={{
                  background: c.done ? "var(--p-green-weak)" : "var(--p-bg-active)",
                  color: c.done ? "var(--p-green)" : "var(--p-text-3)",
                }}
                title={c.done ? `${c.label}: 完了` : `${c.label}が未達 — 該当タブへ移動`}
              >
                {c.done ? <IconCheck size={11} /> : <IconX size={11} />}
                {c.label}
                {!c.done && <IconArrowRight size={11} />}
              </button>
            ))}
          </div>
          <span
            className="ml-auto text-[11.5px] tabular-nums"
            style={{ color: ready ? "var(--p-green)" : "var(--p-text-3)" }}
          >
            {done}/{article.checklist.length} 完了
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
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
              <button
                onClick={onReject}
                className="proto-btn-ghost"
                style={{ color: "var(--p-red)" }}
              >
                <IconX size={14} /> 却下
              </button>
              <button onClick={onRevise} className="proto-btn-ghost">
                <IconWand size={14} /> 修正を依頼 <Kbd>R</Kbd>
              </button>
              <button
                onClick={onApprove}
                disabled={!isReviewable}
                className="ml-auto flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "var(--p-accent)", color: "#0a0c10" }}
              >
                <IconCheck size={15} />
                {article.stage === "outline_review" ? "構成案を承認" : "承認して公開予約"}
                <Kbd>A</Kbd>
                <IconArrowRight size={14} />
              </button>
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
