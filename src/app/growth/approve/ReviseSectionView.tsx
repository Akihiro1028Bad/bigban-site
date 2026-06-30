/**
 * 構成案の手動編集セクション(記事のみ)の描画(#H7 分解 / 差分B Task 12)。
 * タイトル直接編集＋構成案セクションの手動編集(見出し/説明)＋画像指示のみを担う。
 *
 * AI修正系(コメント依頼フォーム・提示/失敗/処理中の提示)は相談ドロワー
 * (ConsultDrawer / ConsultComposer / ConsultCard)へ移管済み。ここからは撤去している。
 * 状態・操作は useReviseEditing の戻り値を丸ごと受け取る(AI修正系メソッドはドロワー側が呼ぶ)。
 */

"use client";

import { Section } from "./Section";
import { SectionEditor } from "./SectionEditor";
import { SectionImages } from "./SectionImages";
import { outlineSections, type OutlineSection } from "./outline";
import { ReviseSection } from "./ReviseSection";
import type { useReviseEditing } from "./hooks/useReviseEditing";
import type { PendingItem } from "./types";

interface ReviseSectionViewProps {
  item: PendingItem;
  revise: ReturnType<typeof useReviseEditing>;
}

export function ReviseSectionView({ item, revise }: ReviseSectionViewProps) {
  const {
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
    setEditHeading,
    setEditDescription,
    setImageStyle,
    setImageDesc,
    setTitleInput,
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

  // #53: 1セクション分の本文・見出し・手動編集/画像のみを描画(コメント収集はドロワー専用)。
  function renderSection(sections: OutlineSection[], i: number) {
    const section = sections[i];
    return (
      <Section
        key={i}
        heading={section.heading}
        description={section.description}
        editing={editingSection === i}
        busy={reviseBusy}
        onStartEditSection={() => startEditSection(i, section)}
        editor={renderSectionEditor(sections, i)}
        images={renderSectionImages(sections, i)}
      />
    );
  }

  const sections = outlineSections(item.outline);
  // 構成案(セクション)が無い記事では手動編集セクションを出さない(タイトル編集も含む)。
  if (sections.length === 0) return null;
  const manualSections = (
    <ul className="mt-2 space-y-2">
      {Array.from({ length: sections.length }, (_, i) => renderSection(sections, i))}
    </ul>
  );
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
      phaseContent={manualSections}
      error={reviseError}
    />
  );
}
