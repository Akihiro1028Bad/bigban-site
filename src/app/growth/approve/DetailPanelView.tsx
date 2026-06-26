/**
 * 詳細パネルの組み立て(#H7 分解 / #127)。記事=全画面中央モーダル / 施策=右ドロワー。
 * 主操作(承認/却下/戻す/次へ)・インサイト・チェックリスト・下書きプレビュー・構成案修正を
 * 計算して DetailPanel(外枠)へ流し込む。挙動は ApproveClient 直書き時と同一(純リファクタ)。
 */

"use client";

import { choiceButtonClass, SECTION_CARD, SECTION_HEAD } from "./approveStyles";
import { isReviseBusy, KIND_BADGE } from "./boardItemHelpers";
import { detailBadge } from "./detailBadge";
import { DetailHeader } from "./DetailHeader";
import { DetailPanel } from "./DetailPanel";
import { DraftChecklist } from "./DraftChecklist";
import { draftPlainText, draftQuality } from "./draftQuality";
import { DraftReadyView } from "./DraftReadyView";
import type { DraftState } from "./draftTypes";
import { ExcerptEditor } from "./ExcerptEditor";
import { HypothesisCard } from "./HypothesisCard";
import { MetricChips } from "./MetricChips";
import type { PreviewDevice } from "./previewDevice";
import { nextReviewId } from "./reviewNav";
import { ReviseSectionView } from "./ReviseSectionView";
import { StyleHints } from "./StyleHints";
import type { useReviseEditing } from "./hooks/useReviseEditing";
import type { Choice, PendingItem } from "./types";

interface DetailPanelViewProps {
  item: PendingItem;
  choice: Choice | undefined;
  isBusy: boolean;
  draftState: DraftState;
  token: string;
  previewDevice: PreviewDevice;
  actionBusy: boolean;
  actionError: string;
  reviewOrder: { id: string; actionable: boolean }[];
  revise: ReturnType<typeof useReviseEditing>;
  onDecide: (item: PendingItem, choice: Choice) => void;
  onUndo: (item: PendingItem) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  onPreviewDeviceChange: (device: PreviewDevice) => void;
  onStartEdit: (html: string) => void;
  onReloadDraft: (pageId: string) => void;
  onConfirm: (item: PendingItem, kind: "publish" | "close") => void;
  onToast: (message: string, tone?: "success" | "error") => void;
}

export function DetailPanelView({
  item,
  choice,
  isBusy,
  draftState,
  token,
  previewDevice,
  actionBusy,
  actionError,
  reviewOrder,
  revise,
  onDecide,
  onUndo,
  onOpen,
  onClose,
  onPreviewDeviceChange,
  onStartEdit,
  onReloadDraft,
  onConfirm,
  onToast,
}: DetailPanelViewProps) {
  // #43: 修正中(依頼中/処理中/提示中)は承認/却下を無効化(古い構成案での承認を防ぐ)。
  const lockedForRevise = isReviseBusy(item.reviseStatus);
  const isIdea = item.kind === "idea";

  // #127/M8: クリップボードへコピー(本文など)。成否をトーストで明示する(沈黙させない)。
  function copyText(text: string): void {
    if (!navigator.clipboard) {
      onToast("このブラウザではコピーできません。", "error");
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => onToast("本文をコピーしました。"))
      .catch(() => onToast("コピーに失敗しました。", "error"));
  }

  // #75: 生成済み下書きを実プレビュー(NewsBodyRenderer)で表示する。記事のみ。
  const draftPreview = (
    <section aria-label="下書きプレビュー" className={`mt-4 ${SECTION_CARD}`}>
      <h3 className={SECTION_HEAD}>下書きプレビュー</h3>
      {draftState.status === "loading" ? (
        <p className="mt-2 text-sm text-gray-500" aria-busy="true">
          読み込み中…
        </p>
      ) : draftState.status === "error" ? (
        <div role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{draftState.error}</span>
          <button
            type="button"
            onClick={() => onReloadDraft(item.id)}
            className={choiceButtonClass(
              "ml-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            再読み込み
          </button>
        </div>
      ) : draftState.status === "empty" ? (
        <p className="mt-2 rounded-md bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
          下書きが見つかりませんでした。
        </p>
      ) : draftState.status === "ready" ? (
        <DraftReadyView
          draft={draftState.draft}
          pageId={item.id}
          itemTitle={item.title}
          itemStage={item.stage}
          token={token}
          previewDevice={previewDevice}
          onPreviewDeviceChange={onPreviewDeviceChange}
          actionBusy={actionBusy}
          actionError={actionError}
          onReloadDraft={() => onReloadDraft(item.id)}
          onPublish={() => onConfirm(item, "publish")}
          onClose={() => onConfirm(item, "close")}
          onStartEdit={() => onStartEdit(draftState.draft.bodyHtml)}
          onCopy={() => copyText(draftState.draft.body)}
        />
      ) : (
        <p className="mt-2 text-sm text-gray-500">まだ下書きは生成されていません。</p>
      )}
    </section>
  );

  // 主操作(承認/却下/承認待ちに戻す)。下書き作成済みは出さない。コマンドバー/ドロワー共用。
  const decisionActions = item.isDraftReady ? null : choice ? (
    <button
      type="button"
      onClick={() => onUndo(item)}
      disabled={isBusy}
      className={choiceButtonClass(
        "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      )}
    >
      承認待ちに戻す
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={() => onDecide(item, "承認")}
        disabled={isBusy || lockedForRevise}
        className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
      >
        承認
      </button>
      <button
        type="button"
        onClick={() => onDecide(item, "却下")}
        disabled={isBusy || lockedForRevise}
        className={choiceButtonClass(
          "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        )}
      >
        却下
      </button>
    </>
  );

  // インサイト: 「なぜこの記事か」(SEO機会=subtitle を整形 callout)＋根拠メトリクス。
  const insight = (
    <>
      {item.subtitle ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <p className="mb-1 text-xs font-bold text-blue-800">なぜこの記事か</p>
          <p className="text-sm leading-relaxed text-gray-700">{item.subtitle}</p>
        </div>
      ) : null}
      <div className="mt-3">
        <MetricChips details={item.details} />
      </div>
      {/* #計測強化 S4: 記事の仮説(狙い)。未記入は出さない。 */}
      {item.hypothesis ? <HypothesisCard hypothesis={item.hypothesis} /> : null}
    </>
  );

  // #130: 「次の記事へ」= 並び順上の次の未処理記事へ(閉じずに連続レビュー)。末尾は無効。
  const nextReviewableId = isIdea ? nextReviewId(reviewOrder, item.id, 1) : null;
  const nextButton = isIdea ? (
    <button
      type="button"
      disabled={!nextReviewableId}
      onClick={() => {
        /* istanbul ignore else -- @preserve disabled 時は押せないため null は到達不可 */
        if (nextReviewableId) onOpen(nextReviewableId);
      }}
      className={choiceButtonClass(
        "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      )}
    >
      次へ →
    </button>
  ) : null;

  // ヘッダー(記事はコマンドバーとして主操作スロット＋「次へ」を持つ)。
  const header = (
    <DetailHeader
      title={item.title}
      kindLabel={KIND_BADGE[item.kind]}
      badge={detailBadge(item, choice)}
      onClose={onClose}
      actions={
        isIdea ? (
          <>
            {decisionActions}
            {nextButton}
          </>
        ) : undefined
      }
    />
  );

  const checklist =
    draftState.status === "ready" ? (
      <div className="mt-4">
        <DraftChecklist
          checks={draftQuality({
            bodyHtml: draftState.draft.bodyHtml,
            body: draftState.draft.body,
            title: item.title,
            knownNewsPaths: draftState.draft.knownNewsPaths
              ? new Set(draftState.draft.knownNewsPaths)
              : undefined,
          })}
        />
        <StyleHints plain={draftPlainText(draftState.draft.bodyHtml, draftState.draft.body)} />
        <ExcerptEditor
          pageId={item.id}
          token={token}
          plain={draftPlainText(draftState.draft.bodyHtml, draftState.draft.body)}
        />
      </div>
    ) : null;

  return (
    <DetailPanel
      isIdea={isIdea}
      title={item.title}
      header={header}
      insight={insight}
      checklist={checklist}
      draftPreview={draftPreview}
      reviseSection={<ReviseSectionView item={item} revise={revise} />}
      decisionActions={decisionActions}
      onClose={onClose}
    />
  );
}
