/**
 * 構成案の修正セクション(記事のみ)の描画(#H7 分解)。提示待ち/提示中/失敗/コメント入力＋
 * タイトル編集を revisePhase で振り分ける。状態・操作は useReviseEditing の戻り値を丸ごと受け取る。
 */

"use client";

import { ReviseCommentForm } from "./ReviseCommentForm";
import { ReviseFailed } from "./ReviseFailed";
import { RevisePending } from "./RevisePending";
import { ReviseReady } from "./ReviseReady";
import { ReviseSection } from "./ReviseSection";
import { Section } from "./Section";
import { SectionEditor } from "./SectionEditor";
import { SectionImages } from "./SectionImages";
import { outlineSections, type OutlineSection } from "./outline";
import { revisePhase } from "./revisePhase";
import type { useReviseEditing } from "./hooks/useReviseEditing";
import type { PendingItem } from "./types";

interface ReviseSectionViewProps {
  item: PendingItem;
  revise: ReturnType<typeof useReviseEditing>;
}

export function ReviseSectionView({ item, revise }: ReviseSectionViewProps) {
  const {
    refreshItems,
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
    editingTitle,
    titleInput,
    titleRevisePrompt,
    setCommentText,
    setEditHeading,
    setEditDescription,
    setImageStyle,
    setImageDesc,
    setTitleInput,
    setTitleRevisePrompt,
    requestRevise,
    startAddComment,
    startEditComment,
    cancelComment,
    saveComment,
    deleteComment,
    startEditSection,
    cancelEditSection,
    startEditTitle,
    cancelEditTitle,
    saveTitle,
    saveSection,
    startAddImage,
    startEditImage,
    cancelImage,
    saveImage,
    deleteImage,
    applyRevise,
  } = revise;

  // #54: セクションの手動編集(見出し＋説明)→ 構成案を直接保存(AI不要)。
  function renderSectionEditor(sections: OutlineSection[], i: number) {
    return (
      <SectionEditor
        heading={sections[i].heading}
        editHeading={editHeading}
        onHeadingChange={setEditHeading}
        editDescription={editDescription}
        onDescriptionChange={setEditDescription}
        busy={reviseBusy}
        onCancel={cancelEditSection}
        onSave={() => saveSection(item, sections, i)}
      />
    );
  }

  // #61: 1セクション分の画像指示(チップ＋スタイル選択フォーム)を描画。
  function renderSectionImages(sections: OutlineSection[], i: number) {
    return (
      <SectionImages
        heading={sections[i].heading}
        images={sections[i].images}
        open={imageFormFor === i}
        busy={reviseBusy}
        sectionIndex={i}
        imageStyle={imageStyle}
        onImageStyleChange={setImageStyle}
        imageDesc={imageDesc}
        onImageDescChange={setImageDesc}
        editing={editingImageIdx !== null}
        onStartEdit={(idx, image) => startEditImage(i, idx, image)}
        onDelete={(idx) => deleteImage(item, sections, i, idx)}
        onStartAdd={() => startAddImage(i)}
        onCancel={cancelImage}
        onSave={() => saveImage(item, sections, i)}
      />
    );
  }

  // #53: 1セクション分の本文・件数・既存コメント(スレッド)・入力欄/＋コメント/編集を描画。
  function renderSection(sections: OutlineSection[], i: number) {
    const section = sections[i];
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
        editor={renderSectionEditor(sections, i)}
        images={renderSectionImages(sections, i)}
      />
    );
  }

  // #42/#43/#52/#53/#54/#139 B: 構成案の修正セクション(記事のみ)。コメント＋タイトル指示＋手動編集。
  function renderReviseCommentForm(sections: OutlineSection[]) {
    const total = Object.values(draftComments).reduce((n, list) => n + list.length, 0);
    return (
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
    );
  }

  function renderRevisePending() {
    return (
      <RevisePending
        requestedAtMs={item.reviseRequestedAtMs ?? null}
        busy={reviseBusy}
        onRefresh={() => void refreshItems()}
      />
    );
  }

  function renderReviseReady() {
    return (
      <ReviseReady
        title={item.title}
        currentOutline={item.outline ?? ""}
        outlineProposal={item.reviseProposal ?? ""}
        titleProposal={item.reviseTitleProposal ?? ""}
        busy={reviseBusy}
        onApply={() => applyRevise(item, "apply")}
        onDiscard={() => applyRevise(item, "discard")}
      />
    );
  }

  function renderReviseFailed() {
    return (
      <ReviseFailed
        reason={item.reviseProposal || "理由不明"}
        busy={reviseBusy}
        onDiscard={() => applyRevise(item, "discard")}
      />
    );
  }

  const sections = outlineSections(item.outline);
  const phase = revisePhase(item.reviseStatus);
  if (phase === "idle" && sections.length === 0) return null;
  const phaseContent =
    phase === "pending"
      ? renderRevisePending()
      : phase === "ready"
        ? renderReviseReady()
        : phase === "failed"
          ? renderReviseFailed()
          : renderReviseCommentForm(sections);
  return (
    <ReviseSection
      itemId={item.id}
      title={item.title}
      editingTitle={editingTitle}
      titleValue={titleInput}
      busy={reviseBusy}
      onTitleChange={setTitleInput}
      onStartEditTitle={() => startEditTitle(item.title)}
      onCancelTitle={cancelEditTitle}
      onSaveTitle={() => saveTitle(item)}
      phaseContent={phaseContent}
      error={reviseError}
    />
  );
}
