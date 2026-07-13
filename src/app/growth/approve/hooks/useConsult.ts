/**
 * 相談ドロワー（差分B）のオーケストレータフック。
 * Task 1-10 で実装した純ロジック（consult.ts）・抽出フック（useAdviceConsult/useBodyCommentConsult）・
 * UIコンポーネント（consult/ 配下）を束ね、ApproveClient（Task 12）へ渡す統合インターフェースを提供する。
 *
 * 責務: 状態の組み立てと透過のみ。Notion 依頼書き込み・ポーリングは各抽出フックが担当する。
 */

import { useState } from "react";

import { classifyFix, FIX_REASON_NO_QUOTE, type FixClassification } from "@/lib/growth/adviseApply";
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
import type { RejectedFixPayload, ReviseApplyPayload } from "../consult/ReviseProposalBody";

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
  /** 現在の段階で有効なモード(段階に無い mode は先頭タブへフォールバック済み)。 */
  mode: ConsultKind;
  setMode: (mode: ConsultKind) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** 表示中モード(mode)に対応する相談結果カードのみ。 */
  views: (OverallConsultView | ReviseConsultView | SentenceConsultView)[];
  /** 表示中モードの操作(依頼/反映/再読込)が進行中か。 */
  busy: boolean;
  /** overall カードの各 fix の反映可否(AdviceResultBody が利用)。 */
  classifications: FixClassification[];
  /** overall カードの採用チェック表示可否。 */
  selectable: boolean;
  /** ConsultComposer が参照する下書き本文 HTML。 */
  bodyHtml: string;
  advice: ReturnType<typeof useAdviceConsult>;
  bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>;
  revise: ReturnType<typeof useReviseEditing>;
  // ── ドロワーのコールバック(オーケストレータが束ねて返す) ──────────────────────
  onReload: () => void;
  onRetry: () => void;
  onAdviceDismiss: () => void;
  onAdviceSubmitApply: () => void;
  onAdviceDismissApply: () => void;
  onAdviceApplyNow: () => void;
  onAdviceToggleApplySelect: (fixIndex: number) => void;
  adviceApplySelected: ReadonlySet<number>;
  onReviseApply: (payload?: ReviseApplyPayload) => void;
  onReviseDiscard: (rejected?: RejectedFixPayload[]) => void;
  onSentenceApplySelected: () => void;
  onSentenceDismissAll: () => void;
  onSentenceToggleSelect: (commentIndex: number) => void;
  sentenceSelected: Set<number>;
  onToggleAdopt: (index: number) => void;
  onSetAdoptedBulk: (indexes: readonly number[], adopt: boolean) => void;
  adopted: ReadonlySet<number>;
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

  // 記事切替(item.id 変化)で相談ドロワーの表示状態を持ち越さない(兄弟フック useReviseEditing の
  // openId 変化リセットと対称)。開きっぱなし・前記事の mode 残りを防ぐため、記事が変わったら
  // レンダー中に open=false・mode を既定へ戻す(React 公式「prop 変化時の state 調整」パターン。
  // effect ではなく描画中に是正するため cascading render を起こさない)。
  // mode は既定 "overall"(リテラル)へ戻す。現在の stage に無ければ後段の activeMode が先頭タブへ
  // 昇格するため(例: outline 段階なら "revise")、ここでは stage 非依存のリテラルで十分。
  // prevItemId 初期値=現在の id のため、初回マウントではこのブロックに入らない(不要な close なし)。
  const [prevItemId, setPrevItemId] = useState(item.id);
  if (item.id !== prevItemId) {
    setPrevItemId(item.id);
    setOpen(false);
    setMode("overall");
  }

  function openDrawer(): void {
    // proto の openConsult("revise") と同じく、開くたびにモードを段階の先頭へ戻す。
    // これをしないと、前回「この文を直す」(sentence)を選んで閉じた mode が残り、次に
    // フッター「AIに相談」で開いた瞬間に本文注釈 UI が前面に出てプレビュー等のタブが
    // 隠れてしまう(F6 のユーザー報告バグ)。段階の先頭 = draft:"overall" / outline:"revise"。
    setMode(STAGE_KINDS[stage][0]);
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
  const allViews = rawViews.filter(
    (v): v is OverallConsultView | ReviseConsultView | SentenceConsultView => v !== null,
  );

  // Task 11 申し送り: mode 初期値は最初の stage で固定されるため、outline→draft 遷移後に
  // 当該段階のタブに無い mode が残りうる。段階(STAGE_KINDS[stage])に mode が無ければ先頭タブへ。
  const stageKinds = STAGE_KINDS[stage];
  const activeMode: ConsultKind = stageKinds.includes(mode) ? mode : stageKinds[0];

  // ドロワーには現在のモードに対応する相談結果カードだけを渡す(単一コールバックと整合させる)。
  const views = allViews.filter((v) => v.kind === activeMode);

  // overall カードの採用チェック表示(selectable)と各 fix の反映可否(classifications)を、
  // AdviceCard の判定ロジックに整合させて算出する(ドロワー内 AdviceResultBody が利用)。
  const overallView = allViews.find((v) => v.kind === "overall");
  const adviceFixes =
    overallView && overallView.kind === "overall" && overallView.advice !== null
      ? overallView.advice.fixes
      : [];
  const bodyHtml = draft?.bodyHtml ?? "";
  const classifications = adviceFixes.map((f) =>
    bodyHtml ? classifyFix(f, bodyHtml) : { applicable: false as const, reason: FIX_REASON_NO_QUOTE },
  );
  const applyStatus =
    overallView?.kind === "overall" ? overallView.apply?.status ?? "なし" : "なし";
  const selectable =
    applyStatus === "なし" && bodyHtml !== "" && classifications.some((c) => c.applicable);

  // 失敗カードの「再依頼」。表示中モードに対応する依頼を呼ぶ(overall/revise/sentence)。
  function onRetry(): void {
    if (activeMode === "overall") advice.requestAdvice();
    else if (activeMode === "revise") void revise.requestRevise(item);
    else void bodyCommentConsult.requestAi();
  }

  // 待ち状態カードの「再読み込み」。revise は盤(item の reviseStatus)を、
  // overall/sentence は下書き(advice/bodyComment)を最新化する。
  function onReload(): void {
    if (activeMode === "revise") void revise.refreshItems();
    else onReloadDraft();
  }

  // 表示中モードの操作が進行中か(各カードのボタン無効化に使う・フェッチ中で判定)。
  const busy =
    activeMode === "overall"
      ? advice.busy
      : activeMode === "revise"
        ? revise.reviseBusy
        : bodyCommentConsult.busy;

  return {
    open,
    stage,
    mode: activeMode,
    setMode,
    openDrawer,
    closeDrawer,
    views,
    busy,
    classifications,
    selectable,
    bodyHtml,
    advice,
    bodyCommentConsult,
    revise,
    onReload,
    onRetry,
    onAdviceDismiss: advice.dismiss,
    onAdviceSubmitApply: advice.submitApply,
    onAdviceDismissApply: advice.dismissApply,
    onAdviceApplyNow: () => void advice.applyNow(),
    onAdviceToggleApplySelect: advice.toggleApplySelect,
    adviceApplySelected: advice.applySelected,
    onReviseApply: (payload) => void (payload ? revise.applyRevise(item, "apply", payload) : revise.applyRevise(item, "apply")),
    onReviseDiscard: (rejected) => void (rejected ? revise.applyRevise(item, "discard", rejected) : revise.applyRevise(item, "discard")),
    onSentenceApplySelected: () => void bodyCommentConsult.applyNow(),
    onSentenceDismissAll: () => void bodyCommentConsult.dismissAll(),
    onSentenceToggleSelect: bodyCommentConsult.toggleSelect,
    sentenceSelected: bodyCommentConsult.selected,
    onToggleAdopt: advice.toggleAdopt,
    onSetAdoptedBulk: advice.setAdoptedBulk,
    adopted: advice.adopted,
  };
}
