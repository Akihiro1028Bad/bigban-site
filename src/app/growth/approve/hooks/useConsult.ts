/**
 * 相談ドロワー（差分B）のオーケストレータフック。
 * Task 1-10 で実装した純ロジック（consult.ts）・抽出フック（useAdviceConsult/useBodyCommentConsult）・
 * UIコンポーネント（consult/ 配下）を束ね、ApproveClient（Task 12）へ渡す統合インターフェースを提供する。
 *
 * 責務: 状態の組み立てと透過のみ。Notion 依頼書き込み・ポーリングは各抽出フックが担当する。
 */

import { useState } from "react";

import {
  overallViewFrom,
  reviseViewFrom,
  sentenceViewFrom,
  STAGE_KINDS,
  type ConsultKind,
  type ConsultStage,
  type OverallConsultView,
  type ReviseConsultView,
  type SentenceConsultView,
} from "@/lib/growth/consult";

import type { DraftPreview } from "../draftTypes";
import type { PendingItem } from "../types";
import { useAdviceConsult } from "./useAdviceConsult";
import { useBodyCommentConsult } from "./useBodyCommentConsult";
import type { useReviseEditing } from "./useReviseEditing";

interface UseConsultParams {
  item: PendingItem;
  token: string;
  draft: DraftPreview | null;
  onReloadDraft: () => void;
  revise: ReturnType<typeof useReviseEditing>;
}

interface UseConsultReturn {
  open: boolean;
  stage: ConsultStage;
  mode: ConsultKind;
  setMode: (mode: ConsultKind) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  views: (OverallConsultView | ReviseConsultView | SentenceConsultView)[];
  advice: ReturnType<typeof useAdviceConsult>;
  bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>;
  revise: ReturnType<typeof useReviseEditing>;
}

export function useConsult({
  item,
  token,
  draft,
  onReloadDraft,
  revise,
}: UseConsultParams): UseConsultReturn {
  const stage: ConsultStage = draft !== null ? "draft" : "outline";

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ConsultKind>(() => STAGE_KINDS[stage][0]);

  function openDrawer(): void {
    setOpen(true);
  }

  function closeDrawer(): void {
    setOpen(false);
  }

  const advice = useAdviceConsult({
    pageId: item.id,
    token,
    advice: draft?.advice,
    adviceApply: draft?.adviceApply,
    bodyHtml: draft?.bodyHtml ?? "",
    onChanged: onReloadDraft,
  });

  const bodyCommentConsult = useBodyCommentConsult({
    pageId: item.id,
    token,
    bodyHtml: draft?.bodyHtml ?? "",
    bodyComment: draft?.bodyComment,
    onChanged: onReloadDraft,
  });

  const rawViews = [
    overallViewFrom(draft?.advice, draft?.adviceApply),
    reviseViewFrom(item),
    sentenceViewFrom(draft?.bodyComment),
  ];
  const views = rawViews.filter(
    (v): v is OverallConsultView | ReviseConsultView | SentenceConsultView => v !== null,
  );

  return {
    open,
    stage,
    mode,
    setMode,
    openDrawer,
    closeDrawer,
    views,
    advice,
    bodyCommentConsult,
    revise,
  };
}
