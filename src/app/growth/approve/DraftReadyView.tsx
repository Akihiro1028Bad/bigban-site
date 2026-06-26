/**
 * 下書きプレビュー(ready 時)の中身(#H7 分解)。アイキャッチ＋各アシスタント＋本番プレビュー＋
 * 公開/クローズ＋編集/コピー。状態は親が持ち、ここは draft と操作を受け取って組み立てる。
 */

"use client";

import Image from "next/image";
import type { PreviewDevice } from "./previewDevice";

import { AdviceCard } from "./AdviceCard";
import { BodyImagePicker } from "./BodyImagePicker";
import { choiceButtonClass } from "./approveStyles";
import { DecorationAssistant } from "./DecorationAssistant";
import { DraftPreviewPane } from "./DraftPreviewPane";
import type { DraftPreview } from "./draftTypes";
import { EyecatchPicker } from "./EyecatchPicker";
import { InlineCommentReview } from "./InlineCommentReview";
import { PublishCloseActions } from "./PublishCloseActions";

interface DraftReadyViewProps {
  draft: DraftPreview;
  pageId: string;
  itemTitle: string;
  itemStage: string;
  token: string;
  previewDevice: PreviewDevice;
  onPreviewDeviceChange: (device: PreviewDevice) => void;
  actionBusy: boolean;
  actionError: string;
  onReloadDraft: () => void;
  onPublish: () => void;
  onClose: () => void;
  onStartEdit: () => void;
  onCopy: () => void;
}

export function DraftReadyView({
  draft,
  pageId,
  itemTitle,
  itemStage,
  token,
  previewDevice,
  onPreviewDeviceChange,
  actionBusy,
  actionError,
  onReloadDraft,
  onPublish,
  onClose,
  onStartEdit,
  onCopy,
}: DraftReadyViewProps) {
  return (
    <div className="mt-2">
      {draft.eyecatch ? (
        <Image
          src={draft.eyecatch}
          alt={`アイキャッチ: ${draft.title}`}
          width={800}
          height={420}
          className="mb-1 h-auto w-full rounded-md border border-gray-200"
        />
      ) : null}
      <EyecatchPicker
        pageId={pageId}
        token={token}
        onReplaced={onReloadDraft}
        regenStatus={draft.eyecatchRegen?.status}
        regenRequestedAtMs={draft.eyecatchRegen?.requestedAtMs ?? null}
      />
      <BodyImagePicker
        pageId={pageId}
        token={token}
        bodyHtml={draft.bodyHtml}
        onSaved={onReloadDraft}
        regenStatus={draft.bodyRegen?.status}
        regenTargetSrc={draft.bodyRegen?.targetSrc}
        regenRequestedAtMs={draft.bodyRegen?.requestedAtMs ?? null}
      />
      <AdviceCard
        pageId={pageId}
        token={token}
        advice={draft.advice}
        adviceApply={draft.adviceApply}
        bodyHtml={draft.bodyHtml}
        onChanged={onReloadDraft}
      />
      <DecorationAssistant
        pageId={pageId}
        token={token}
        bodyHtml={draft.bodyHtml}
        decorate={draft.decorate}
        onChanged={onReloadDraft}
      />
      <InlineCommentReview
        pageId={pageId}
        token={token}
        bodyHtml={draft.bodyHtml}
        bodyComment={draft.bodyComment}
        onChanged={onReloadDraft}
      />
      <DraftPreviewPane
        device={previewDevice}
        onDeviceChange={onPreviewDeviceChange}
        html={draft.bodyHtml || draft.body}
      />
      <PublishCloseActions
        stage={itemStage}
        title={itemTitle}
        bodyHtml={draft.bodyHtml}
        body={draft.body}
        knownNewsPaths={draft.knownNewsPaths}
        busy={actionBusy}
        error={actionError}
        onPublish={onPublish}
        onClose={onClose}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          aria-label="下書きを編集"
          onClick={onStartEdit}
          className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
        >
          編集
        </button>
        <button
          type="button"
          aria-label="本文をコピー"
          onClick={onCopy}
          className={choiceButtonClass("border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
        >
          コピー
        </button>
      </div>
    </div>
  );
}
