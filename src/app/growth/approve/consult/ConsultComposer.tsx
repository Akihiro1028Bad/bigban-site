"use client";

/**
 * 相談ドロワーの入力フォーム部（差分B Task 9）。
 * mode（ConsultKind）で 3 モードを出し分ける。結果表示は含まない（後続タスク担当）。
 *
 * - overall: instruction テキストエリア（任意・MAX 500）→ useAdviceConsult.requestAdvice
 * - revise  : 行コメントフォーム（ReviseCommentForm + Section を流用）
 *             → useReviseEditing.requestRevise
 * - sentence: CommentableBody（行コメント＋AIに指摘を依頼）
 *             → useBodyCommentConsult.requestAi（CommentableBody 内で呼ぶ）
 */

import type { ReactNode } from "react";

import type { ConsultKind } from "@/lib/growth/consult";

import { ReviseCommentForm } from "../ReviseCommentForm";
import { Section } from "../Section";
import { SectionEditor } from "../SectionEditor";
import { SectionImages } from "../SectionImages";
import type { useAdviceConsult } from "../hooks/useAdviceConsult";
import type { useBodyCommentConsult } from "../hooks/useBodyCommentConsult";
import type { useReviseEditing } from "../hooks/useReviseEditing";
import { outlineSections, type OutlineSection } from "../outline";
import type { PendingItem } from "../types";
import { CommentableBody } from "./CommentableBody";

interface ConsultComposerProps {
  mode: ConsultKind;
  item: PendingItem;
  bodyHtml: string;
  advice: ReturnType<typeof useAdviceConsult>;
  bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>;
  revise: ReturnType<typeof useReviseEditing>;
}

// ─── overall モード ────────────────────────────────────────────────────────────

interface OverallComposerProps {
  advice: ReturnType<typeof useAdviceConsult>;
}

function OverallComposer({ advice }: OverallComposerProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        文体・構成・具体性・内部リンク導線の観点で、下書き全体をAIに見てもらえます。
      </p>
      <div>
        <label htmlFor="overall-instruction" className="block text-xs font-medium text-gray-600">
          特に見てほしい点（任意）
        </label>
        <textarea
          id="overall-instruction"
          value={advice.instruction}
          onChange={(e) => advice.setInstruction(e.target.value)}
          placeholder="例：導入の説得力"
          rows={2}
          maxLength={500}
          disabled={advice.busy}
          className="mt-1 w-full resize-none rounded-md border border-gray-300 p-2 text-sm text-gray-900 disabled:opacity-60"
        />
        <p className="mt-0.5 text-right text-[10px] text-gray-400">
          {advice.instruction.length} / 500
        </p>
      </div>
      {advice.error ? (
        <p role="alert" className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {advice.error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={advice.requestAdvice}
        disabled={advice.busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
      >
        相談する
      </button>
    </div>
  );
}

// ─── revise モード ─────────────────────────────────────────────────────────────

interface ReviseComposerProps {
  item: PendingItem;
  revise: ReturnType<typeof useReviseEditing>;
}

function ReviseComposer({ item, revise }: ReviseComposerProps) {
  const {
    draftComments,
    openCommentFor,
    commentText,
    editingIdx,
    editingSection,
    editHeading,
    editDescription,
    imageFormFor,
    editingImageIdx,
    imageStyle,
    imageDesc,
    reviseBusy,
    reviseError,
    titleRevisePrompt,
    setCommentText,
    setEditHeading,
    setEditDescription,
    setImageStyle,
    setImageDesc,
    setTitleRevisePrompt,
    requestRevise,
    startAddComment,
    startEditComment,
    cancelComment,
    saveComment,
    deleteComment,
    startEditSection,
    cancelEditSection,
    startAddImage,
    startEditImage,
    cancelImage,
    saveImage,
    deleteImage,
  } = revise;

  const sections = outlineSections(item.outline);

  function renderSectionEditor(sectionList: OutlineSection[], i: number): ReactNode {
    return (
      <SectionEditor
        heading={sectionList[i].heading}
        editHeading={editHeading}
        onHeadingChange={setEditHeading}
        editDescription={editDescription}
        onDescriptionChange={setEditDescription}
        busy={reviseBusy}
        onCancel={cancelEditSection}
        onSave={() => revise.saveSection(item, sectionList, i)}
      />
    );
  }

  function renderSectionImages(sectionList: OutlineSection[], i: number): ReactNode {
    return (
      <SectionImages
        heading={sectionList[i].heading}
        images={sectionList[i].images}
        open={imageFormFor === i}
        busy={reviseBusy}
        sectionIndex={i}
        imageStyle={imageStyle}
        onImageStyleChange={setImageStyle}
        imageDesc={imageDesc}
        onImageDescChange={setImageDesc}
        editing={editingImageIdx !== null}
        onStartEdit={(idx, image) => startEditImage(i, idx, image)}
        onDelete={(idx) => deleteImage(item, sectionList, i, idx)}
        onStartAdd={() => startAddImage(i)}
        onCancel={cancelImage}
        onSave={() => saveImage(item, sectionList, i)}
      />
    );
  }

  function renderSection(sectionList: OutlineSection[], i: number): ReactNode {
    const section = sectionList[i];
    return (
      <Section
        key={i}
        heading={section.heading}
        description={section.description}
        comments={draftComments[i] ?? []}
        editing={editingSection === i}
        commentOpen={openCommentFor === i}
        commentText={commentText}
        onCommentTextChange={setCommentText}
        editingComment={editingIdx !== null}
        busy={reviseBusy}
        onStartEditComment={(idx, comment) => startEditComment(i, idx, comment)}
        onDeleteComment={(idx) => deleteComment(i, idx)}
        onCancelComment={cancelComment}
        onSaveComment={() => saveComment(i)}
        onStartAddComment={() => startAddComment(i)}
        onStartEditSection={() => startEditSection(i, section)}
        editor={renderSectionEditor(sectionList, i)}
        images={renderSectionImages(sectionList, i)}
      />
    );
  }

  const total = Object.values(draftComments).reduce((n, list) => n + list.length, 0);

  if (sections.length === 0) {
    return (
      <p className="text-xs text-gray-400">構成案がありません。まず構成案を作成してください。</p>
    );
  }

  return (
    <div>
      {reviseError ? (
        <p role="alert" className="mb-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {reviseError}
        </p>
      ) : null}
      <ReviseCommentForm
        itemId={item.id}
        titlePrompt={titleRevisePrompt}
        onTitlePromptChange={setTitleRevisePrompt}
        busy={reviseBusy}
        sectionCount={sections.length}
        commentTotal={total}
        renderSection={(i) => renderSection(sections, i)}
        onRequestRevise={() => requestRevise(item)}
      />
    </div>
  );
}

// ─── sentence モード ───────────────────────────────────────────────────────────

interface SentenceComposerProps {
  bodyHtml: string;
  bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>;
}

function SentenceComposer({ bodyHtml, bodyCommentConsult }: SentenceComposerProps) {
  return <CommentableBody bodyHtml={bodyHtml} bodyCommentConsult={bodyCommentConsult} />;
}

// ─── ConsultComposer (出し分けルート) ──────────────────────────────────────────

export function ConsultComposer({
  mode,
  item,
  bodyHtml,
  advice,
  bodyCommentConsult,
  revise,
}: ConsultComposerProps) {
  if (mode === "overall") {
    return <OverallComposer advice={advice} />;
  }
  if (mode === "revise") {
    return <ReviseComposer item={item} revise={revise} />;
  }
  // sentence
  return <SentenceComposer bodyHtml={bodyHtml} bodyCommentConsult={bodyCommentConsult} />;
}
