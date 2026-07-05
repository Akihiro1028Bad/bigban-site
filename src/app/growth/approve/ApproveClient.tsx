"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Editor } from "@tiptap/react";
// useDebouncedValue は useDraftEditing フックへ移設(#H7)。

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";

import { isActionable, isAwaitingDownstream, reconcileDecided } from "./board";
import { groupByBoardStage } from "./boardGroups";
import {
  isInFlight,
  isStuck,
  newlyDraftedIds,
  STUCK_THRESHOLD_MS,
} from "./generating";
import {
  isEditableTag,
  moveIndex,
  resolveShortcut,
  shouldBlockSingleKeys,
} from "./shortcuts";
import type { ShortcutAction } from "./shortcuts";
import {
  type Density,
  densityListClass,
  nextDensity,
  parseDensity,
  pruneSelection,
  toggleId,
} from "./boardPrefs";

import { fetchBoard, postRevert } from "./api";
import { authHeaders } from "./authHeaders";
import { readJsonObject } from "@/lib/growth/safeJson";
import { BoardCard } from "./BoardCard";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { PollStaleBanner } from "./PollStaleBanner";
import { DetailPanel } from "./DetailPanel";
import type { DetailTab } from "./DetailPanel";
import { ConsultComposer } from "./consult/ConsultComposer";
import { ConsultDrawer } from "./consult/ConsultDrawer";
import { deriveBoardStage } from "./ui/boardStage";
import { detailBadge } from "./detailBadge";
import { bodyImageUrlsOf } from "./detailBodyImages";
import { outlineSections } from "./outline";
import type { OutlineViewSection } from "./OutlineView";
import type { DraftPreview } from "./draftTypes";
import { BODY_REGEN_BUSY_STATUSES, extractBodyImages } from "@/lib/growth/bodyImageRegen";
import {
  bodyImageFigureHtml,
  buildPendingFigureHtml,
  insertHtmlAfterHeading,
} from "@/lib/growth/bodyImageInsert";
import { bodyRegenIndices } from "./bodyRegenKeys";
import { useConsult } from "./hooks/useConsult";
import { EmptyGateContent, LoadErrorGate, LoadingGate, SearchEmpty } from "./GateScreens";
import { LoginScreen } from "./LoginScreen";
import { ToastList } from "./ToastList";
import { APPROVE_BOARD_KEY, useApproveBoard } from "./hooks/useApproveBoard";
import { BoardList } from "./BoardList";
import { PerformanceBoard } from "./PerformanceBoard";
import { PublishQueue } from "./PublishQueue";
import { MediaLibraryModal } from "./MediaLibraryModal";
import { BodyImageInsertModal } from "./BodyImageInsertModal";
import type { BodyImageInsertChoice } from "./BodyImageInsertModal";
import type { BodyImageRegenInput, BodyImageRegenTarget } from "./bodyRegenRequest";
import { buildBodyRegenBody } from "./bodyRegenRequest";
import { BodyImageRegenModal } from "./BodyImageRegenModal";
import { PromptsView } from "./PromptsView";
import { ProposalView } from "./ProposalView";
import { ProposalFormModal } from "./ProposalFormModal";
import { nextReviewId } from "./reviewNav";
import { decideInitialView, initialDraftFromUrl, parseView } from "./viewRouting";
import type { ApproveView } from "./viewRouting";
import { deriveShellCounts, syncAgoLabel } from "./boardShellStats";
import type { ShellSegmentKey } from "./boardShellStats";
import { matchesSegment, SHELL_SEGMENTS } from "./shellNav";
import { TopBar } from "./shell/TopBar";
import { LeftRail } from "./shell/LeftRail";
import { ShortcutBar } from "./shell/ShortcutBar";
import { ShortcutOverlay } from "./shell/ShortcutOverlay";
import { BulkBar } from "./shell/BulkBar";
import { CommandPalette } from "./CommandPalette";
import { DraftEditWorkspace } from "./DraftEditWorkspace";
import { replacePreservedImageSrc, replacePreservedPendingFigure } from "./DraftEditor";
import { reconcilePendingImage } from "./draftEditorContent";
import { shouldWarnPollStale } from "./pollHealth";
import { toMessage } from "./errorMessage";
import { isReviseBusy, KIND_BADGE, rowClass } from "./boardItemHelpers";
import type { Choice, PendingItem } from "./types";
import { useApproveDecisions } from "./hooks/useApproveDecisions";
import { useDraftEditing } from "./hooks/useDraftEditing";
import { useDraftPreview } from "./hooks/useDraftPreview";
import { useReviseEditing } from "./hooks/useReviseEditing";
import { useToasts } from "./hooks/useToasts";
import { revisePhase } from "./revisePhase";

// 提示待ちのあいだ修正ステータスを再取得する間隔(ミリ秒)。
const REVISE_POLL_MS = 5000;

// 盤データ未取得時の安定した空配列(#H7: 参照を固定して不要な再計算を避ける)。
const EMPTY_ITEMS: PendingItem[] = [];

// #109: 表示密度の保存キー(localStorage)。
const DENSITY_KEY = "growth-approve-density";

/* istanbul ignore next -- @preserve MediaLibraryModal の select mode は onSelect だけを使う。必須 prop を満たす no-op */
function noopModalApplied(): void {
  return undefined;
}

// #242: 施策/記事を優先度スコア降順に並べる比較関数。
function byScoreDesc(a: PendingItem, b: PendingItem): number {
  return (b.score ?? 0) - (a.score ?? 0);
}

// #119: マウント時の初期タブ(SSR では URL を読めないため null)。同期初期化で proposals の
// チラ見えを防ぎ、URL 指定時はその段階のカードを初回描画から表示する。
function initialViewFromUrl(): ApproveView | null {
  /* istanbul ignore next -- @preserve SSR 専用パス: jsdom では window 常在のため到達不可 */
  if (typeof window === "undefined") return null;
  return parseView(new URLSearchParams(window.location.search).get("view"));
}

// タブ切替は履歴を汚さないよう replaceState で現在エントリを置換する(pushState にしない)。
// 戻る/進むで ?view が変わるのは別ページ遷移時のみで、その際は再マウントで同期される。
function writeViewParam(view: ApproveView): void {
  const params = new URLSearchParams(window.location.search);
  params.set("view", view);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

export function ApproveClient() {
  // 合言葉認証が無効(一時措置)のときはゲートを出さず、未認証扱いにしない。
  // APPROVE_AUTH_ENABLED はモジュール定数のため実行中に変化しないが、復元(true)時に
  // 構造が読み取りやすいよう render 内で参照し、依存する effect にも明示する。
  // 認証無効時は token を空("")のまま使い、サーバ側(verifyToken)が検証をスキップする。
  const authDisabled = !APPROVE_AUTH_ENABLED;
  const [passphrase, setPassphrase] = useState("");
  // 既定は表示(text)。type=password は日本語IMEを無効化するため、合言葉が日本語でも
  // 打てるよう text を既定にし、必要なときだけトグルで隠せるようにする。
  const [showPassphrase, setShowPassphrase] = useState(true);
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(authDisabled);
  // 認証無効時はマウント時の自動取得が走るため、その間は読み込み中表示にする。
  const [loadError, setLoadError] = useState("");
  // #H7: 盤(サーバ状態)は React Query を単一ソースにする。初期ロードは命令的に取得して
  // cache を seed し(boardSeeded で query を有効化)、以降の更新は poll/手動 refetch のみ。
  const queryClient = useQueryClient();
  const [boardSeeded, setBoardSeeded] = useState(false);
  const boardQuery = useApproveBoard({
    token,
    enabled: authed && boardSeeded,
    pollIntervalMs: REVISE_POLL_MS,
    shouldPoll: (data) => (data ?? []).some((it) => isInFlight(it.stage)),
  });
  const items = boardQuery.data ?? EMPTY_ITEMS;
  /** 盤データを差し替える(命令的 seed/楽観更新)。setItems 相当。 */
  const setBoardData = useCallback(
    (updater: PendingItem[] | ((prev: PendingItem[]) => PendingItem[])): void => {
      // 関数形は seed 後(楽観更新)のみ呼ぶため prev は常に定義済み。
      queryClient.setQueryData<PendingItem[]>(APPROVE_BOARD_KEY, (prev) =>
        typeof updater === "function" ? updater(prev as PendingItem[]) : updater
      );
    },
    [queryClient]
  );
  // #108: 通知トーストはカスタムフックへ集約(#H7)。nowTick は滞留経過の基準時刻、
  // firstSeenRef は記事が生成待ち/生成中に入った時刻。前回値の参照は prevBoardRef(盤更新effect)が担う。
  const { toasts, pushToast, pushToasts, dismissToast } = useToasts();
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  // #H5: 盤ポーリングの連続失敗と最終成功時刻(沈黙させず「最新化できていない」を可視化)。
  const [pollFailures, setPollFailures] = useState(0);
  const [lastBoardSuccessMs, setLastBoardSuccessMs] = useState<number | null>(null);
  // #109: 操作性。フォーカス中カード/コマンドパレット/一括選択/表示密度。
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<Density>("comfortable");
  // #119: 表示タブ(施策/記事)。URL 指定があれば同期確定、無ければ null(読込後に自動選択)。
  const [view, setView] = useState<ApproveView | null>(initialViewFromUrl);
  // ユーザーがタブを選んだ/URL指定があれば「確定」とし、以降は自動切替で上書きしない。
  // 初期 view(URL 由来)が確定済みかで判定する(initialViewFromUrl の二重呼び出しを避ける)。
  const [viewPinned, setViewPinned] = useState<boolean>(() => view !== null);
  // #proto P1: TopBar 段階セグメント(approve view のカード絞り込み)。既定は全件。
  const [segment, setSegment] = useState<ShellSegmentKey>("all");
  // #proto P1: TopBar 検索(approve/proposal view のカード絞り込み)。`/` キーでフォーカスを移す。
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // #proto P1: ショートカット一覧オーバーレイ(ボタン到達のみ・`?` キーバインドは P6 へ)。
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // #P5a: 施策作成モーダル(proto ProposalFormModal)の開閉。旧 AddProposalForm(inline details)を置換。
  const [proposalFormOpen, setProposalFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  // 認証無効時は初回マウントで自動取得するため、初期から読み込み中にしておく。
  const [busy, setBusy] = useState(authDisabled);
  // #240: 操作後に次の操作対象へフォーカスを移すための一時ターゲット(要素 id)。
  const [focusId, setFocusId] = useState<string | null>(null);
  // #275/#proto P3a: master-detail。右詳細ペインでアクティブにしている項目 id。
  const [activeId, setActiveId] = useState<string | null>(null);
  // #proto P6/#143: 詳細パネル素材タブの「メディアから選ぶ」で開くメディアライブラリの対象記事。
  // null で閉じ、非 null で MediaLibraryModal を描画する(P5b と同じ pull 型導線)。
  const [mediaFor, setMediaFor] = useState<PendingItem | null>(null);
  // 本文画像の差し替え(#145/P1)。対象記事＋差し替える現 src を持ち、MediaLibraryModal を本文画像モードで開く。
  const [bodyMediaFor, setBodyMediaFor] = useState<{ item: PendingItem; targetSrc: string } | null>(null);
  // 本文画像 AI 再生成モーダル(#156/P2)。対象記事＋対象 src を持ち、確定でスタイル/指示/文字指定を送る。
  const [bodyRegenFor, setBodyRegenFor] = useState<{ item: PendingItem; target: BodyImageRegenTarget } | null>(null);
  const [bodyInsertFor, setBodyInsertFor] = useState<{ item: PendingItem; bodyHtml: string } | null>(null);
  const [bodyInsertMediaFor, setBodyInsertMediaFor] =
    useState<{ item: PendingItem; bodyHtml: string; headingIndex: number | null } | null>(null);
  const [bodyInsertRegenFor, setBodyInsertRegenFor] =
    useState<{ item: PendingItem; bodyHtml: string; headingIndex: number | null } | null>(null);
  const [editorMediaFor, setEditorMediaFor] = useState<{ item: PendingItem; editor: Editor } | null>(null);
  const [editorImageReplaceFor, setEditorImageReplaceFor] =
    useState<{ item: PendingItem; targetSrc: string; editor: Editor } | null>(null);
  const [editorInsertRegenFor, setEditorInsertRegenFor] =
    useState<{ item: PendingItem; editor: Editor } | null>(null);
  // #H7: 承認/却下/承認待ちに戻す(即時保存モデル)はカスタムフックへ集約。
  const {
    decided,
    setDecided,
    decide,
    undo,
    decideFromPanel,
  } = useApproveDecisions({
    token,
    onFocus: setFocusId,
    onClosePanel: () => setActiveId(null),
    // #213: 決定/取消の保存失敗をトーストで可視化(カード失敗アラート撤去に先行)。
    onError: (message) => pushToast(message, "error"),
  });
  // #H7: 構成案の修正(AI依頼/手動編集/画像指示/タイトル/提示反映)はカスタムフックへ集約し、
  // 戻り値を丸ごと ReviseSectionView へ渡す。refreshItems(最新化)のみ提示待ちポーリングで共用。
  // #proto P3a: フック側 prop 名は openId のまま、値はアクティブ項目 id(activeId)を渡す。
  const revise = useReviseEditing({ token, openId: activeId, setBoardData });
  // 提示待ちポーリングの依存に使う安定参照(useCallback)。
  const { refreshItems } = revise;
  const passphraseRef = useRef<HTMLInputElement>(null);

  const processed = Object.keys(decided).length;

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(focusId);
    /* istanbul ignore else -- 対象ボタンは保存成功直後に必ず描画される */
    if (el) el.focus();
    setFocusId(null);
  }, [focusId]);

  // フォーム状態のリセット(activeId 変化)は useDraftEditing / useReviseEditing 各フックが担う(#H7)。

  // #119: 初期表示タブの確定。URL の ?view 指定はマウント時に同期確定済み。ここでは未確定時に
  // 一覧読込後、未処理がある方(両方あれば施策)を自動選択する。確定後は自動上書きしない。
  useEffect(() => {
    if (viewPinned) return;
    if (items.length === 0) return;
    // #proto P1: proto 既定着地。施策に未処理(あなたのアクション待ち)があれば施策、
    // 記事に「あなた待ち」があれば記事、どちらも無ければ成績。deriveShellCounts に写像を一本化。
    const counts = deriveShellCounts(items, decided);
    setView(
      decideInitialView(null, {
        proposalPending: counts.proposalPending,
        awaiting: counts.awaiting,
      }),
    );
    setViewPinned(true);
  }, [items, decided, viewPinned]);

  // #119/#proto P1: view を切り替える(URL にも反映し、以降の自動切替を止める)。
  // view 間でカード件数が異なるため、キーボードフォーカスは未選択(-1)に戻す。
  const changeView = useCallback((next: ApproveView): void => {
    setView(next);
    setViewPinned(true);
    setFocusedIndex(-1);
    writeViewParam(next);
  }, []);

  // #proto P1: 段階セグメント変更。非 approve view で段階を選んだら approve view へ遷移しフィルタ適用。
  const handleSegmentChange = useCallback(
    (next: ShellSegmentKey): void => {
      setSegment(next);
      if (view !== "approve") changeView("approve");
    },
    [view, changeView],
  );

  // #108: 記事が生成待ち/生成中に入った時刻を記録し、抜けたら破棄する(滞留検知の基準)。
  useEffect(() => {
    const now = Date.now();
    const seen = firstSeenRef.current;
    items.forEach((item) => {
      if (isInFlight(item.stage)) {
        if (!seen.has(item.id)) seen.set(item.id, now);
      } else {
        seen.delete(item.id);
      }
    });
  }, [items]);

  // #108: 盤の最新化ポーリング。生成完了(→drafted)を検知してトースト、滞留経過の基準時刻も更新。
  // 盤の手動再取得(公開/クローズ/再試行/公開キュー)。自動ポーリングは useApproveBoard の
  // refetchInterval が担う。完了検知トースト等の副作用は boardQuery.data の変化を見る effect 側。
  const pollBoard = useCallback(async (): Promise<void> => {
    await boardQuery.refetch();
  }, [boardQuery]);

  const boardInitRef = useRef(false);
  const prevBoardRef = useRef<PendingItem[]>([]);
  // 通知の「承認画面で開く」ディープリンク(?draft=<contentId>)を一度だけ適用するためのガード。
  const deepLinkAppliedRef = useRef(false);

  // 通知ディープリンク: URL の ?draft(=下書きID/contentId)に一致する記事を、盤読込後に一度だけ
  // 記事ビューで自動選択する。認証ゲートを挟んでも URL は保持されるため、認証後に盤が載った時点で
  // 自然に適用される。一致しない(盤に無い/状態違い)場合は何もしない(クラッシュしない)。
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (items.length === 0) return;
    const draftParam = initialDraftFromUrl();
    if (!draftParam) {
      // ?draft が無ければ以後判定しない(盤更新のたびに再走査しない)。
      deepLinkAppliedRef.current = true;
      return;
    }
    const target = items.find((item) => item.contentId === draftParam);
    if (!target) return; // まだ盤に載っていない可能性があるので適用済みにはしない。
    deepLinkAppliedRef.current = true;
    setActiveId(target.id);
    changeView("approve");
  }, [items, changeView]);

  // 取得成功(値が同じでも)ごとの副作用: 滞留経過の基準時刻・最終成功時刻・連続失敗リセット。
  // dataUpdatedAt は毎回の成功で更新されるため、ポーリングで値が変わらなくても確実に走る。
  useEffect(() => {
    if (boardQuery.data === undefined) return;
    setNowTick(Date.now());
    setLastBoardSuccessMs(Date.now());
    setPollFailures(0);
  }, [boardQuery.dataUpdatedAt, boardQuery.data]);

  // 値が変化したときの副作用: 完成トースト・楽観決定の掃除(#H10)。初回(seed)はトーストを出さない。
  useEffect(() => {
    const next = boardQuery.data;
    if (next === undefined) return;
    if (!boardInitRef.current) {
      boardInitRef.current = true;
      prevBoardRef.current = next;
      return;
    }
    const doneIds = newlyDraftedIds(prevBoardRef.current, next);
    prevBoardRef.current = next;
    if (doneIds.length > 0) {
      const done = new Set(doneIds);
      pushToasts(
        next
          .filter((item) => done.has(item.id))
          .map((item) => ({
            id: `done-${item.id}`,
            message: `🎉 「${item.title}」の下書きが完成しました`,
            tone: "success" as const,
          }))
      );
    }
    setDecided((prev) => reconcileDecided(prev, next));
    // setDecided / pushToasts は安定参照(useState セッター / useCallback)。
  }, [boardQuery.data, setDecided, pushToasts]);

  // #H5: poll/refetch の失敗を連続失敗として可視化(沈黙させない)。初期ロード失敗は loadError/failAuth 側。
  useEffect(() => {
    if (boardQuery.isError) setPollFailures((f) => f + 1);
  }, [boardQuery.isError, boardQuery.errorUpdatedAt]);

  // #109: キーボード操作の最新ハンドラを ref に保持(早期 return より前で document に結線するため)。
  const dispatchRef = useRef<(action: ShortcutAction, editable: boolean) => void>(
    /* istanbul ignore next -- @preserve 初期値はレンダリングで即上書きされるため未実行 */
    () => {}
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const action = resolveShortcut(event.key, event.metaKey, event.ctrlKey);
      if (!action) return;
      const tag = (event.target as HTMLElement | null)?.tagName ?? "";
      const editable = isEditableTag(tag);
      // 入力欄での単一キーは抑止(検索/編集の妨げにしない)。palette/escape は許可。
      // search(`/`)は入力欄外からのみ検索フォーカスへ通す(editable のときは抑止=検索欄での
      // `/` 文字入力を優先する proto 挙動を維持)。
      if (editable && action !== "palette" && action !== "escape") return;
      event.preventDefault();
      dispatchRef.current(action, editable);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // #109: 表示密度を localStorage から復元する(初回)。
  useEffect(() => {
    setDensity(parseDensity(window.localStorage.getItem(DENSITY_KEY)));
  }, []);

  // #proto P6: 表示密度トグル(TopBar)。切替後に localStorage へ保存し、次回マウントで復元する。
  const handleToggleDensity = useCallback(() => {
    setDensity((prev) => {
      const next = nextDensity(prev);
      window.localStorage.setItem(DENSITY_KEY, next);
      return next;
    });
  }, []);

  // #109: 取得更新で消えた選択を掃除する。
  useEffect(() => {
    setSelected((prev) => pruneSelection(prev, items.map((item) => item.id)));
  }, [items]);

  function toggleSelect(id: string): void {
    setSelected((prev) => toggleId(prev, id));
  }

  // #43: 開いている記事が提示待ち(依頼中/処理中)かどうか。
  const polledItem = activeId ? items.find((it) => it.id === activeId) : undefined;
  const isRevisePending = polledItem
    ? revisePhase(polledItem.reviseStatus) === "pending"
    : false;

  // 提示待ちの間だけ一定間隔で再取得する。提示/失敗/なしへ移ったら interval を確実に止める
  // (deps は boolean なので、poll で items が変わっても pending のままなら張り直さない)。
  useEffect(() => {
    if (!isRevisePending) return;
    const timer = setInterval(() => {
      void refreshItems();
    }, REVISE_POLL_MS);
    return () => clearInterval(timer);
  }, [isRevisePending, refreshItems]);

  // #75/#166: 下書きプレビューの取得・ポーリングはカスタムフックへ集約(#H7 分解)。
  const openHasDraft = polledItem?.kind === "idea" && Boolean(polledItem.contentId);
  const { draftState, loadDraft, draftRegenPending } = useDraftPreview({ token, openId: activeId, openHasDraft });

  // #77/#98/#110/#129: 下書きの手動リッチ編集はカスタムフックへ集約(#H7 分解)。
  const {
    editingDraft,
    editedHtml,
    draftOriginalHtml,
    draftSaving,
    draftSaveError,
    confirmDiscard,
    livePreviewHtml,
    setEditedHtml,
    setConfirmDiscard,
    startEditDraft,
    cancelEditDraft,
    exitEditDraft,
    updateDraftOriginalHtml,
    saveDraft,
    saveDraftInPlace,
  } = useDraftEditing({
    token,
    openId: activeId,
    loadDraft,
    // #UI: 保存成功トースト。失敗は saveError(role=alert)で表示済み。
    onSaved: () => pushToast("保存しました"),
  });
  const editedHtmlRef = useRef(editedHtml);
  const draftOriginalHtmlRef = useRef(draftOriginalHtml);
  const editorRef = useRef<Editor | null>(null);
  const previousBodyRegenRef = useRef<{ isBusy: boolean; targetSrc: string }>({
    isBusy: false,
    targetSrc: "",
  });
  useEffect(() => {
    editedHtmlRef.current = editedHtml;
  }, [editedHtml]);
  useEffect(() => {
    draftOriginalHtmlRef.current = draftOriginalHtml;
  }, [draftOriginalHtml]);

  useEffect(() => {
    if (!editingDraft || draftState.status !== "ready") {
      previousBodyRegenRef.current = { isBusy: false, targetSrc: "" };
      return;
    }

    const bodyRegen = draftState.draft.bodyRegen;
    const isBusy = bodyRegen
      ? (BODY_REGEN_BUSY_STATUSES as readonly string[]).includes(bodyRegen.status)
      : false;
    const targetSrc = bodyRegen?.targetSrc ?? "";
    const previous = previousBodyRegenRef.current;

    if (previous.isBusy && !isBusy && previous.targetSrc.startsWith("placeholder:")) {
      const placeholderId = previous.targetSrc.slice("placeholder:".length);
      const editor = editorRef.current;
      const freshBodyHtml = draftState.draft.bodyHtml ?? "";
      const result = editor
        ? reconcilePendingImage(editor.getHTML(), freshBodyHtml, placeholderId)
        : null;
      const replaced =
        editor && result
          ? replacePreservedPendingFigure(
              editor,
              placeholderId,
              bodyImageFigureHtml(result.newSrc, result.alt),
            )
          : false;

      if (editor && result && replaced) {
        const nextHtml = editor.getHTML();
        setEditedHtml(nextHtml);
        updateDraftOriginalHtml(freshBodyHtml);
        pushToast("AI画像が完成し、エディタに反映しました。");
      } else {
        pushToast("画像の生成が完了しました。保存前にプレビューで本文を確認してください。", "error");
      }
    }

    previousBodyRegenRef.current = { isBusy, targetSrc };
  }, [draftState, editingDraft, pushToast, setEditedHtml, updateDraftOriginalHtml]);

  // #proto P3b: 詳細パネル(新 DetailPanel)の結線。詳細タブ(リーフ)は
  // 開いている項目が変わったらリセットする(前の記事の状態を持ち越さない)。
  const [detailTab, setDetailTab] = useState<DetailTab>("preview");
  useEffect(() => {
    setDetailTab("preview");
  }, [activeId]);

  // 差分B(#proto P3b で DetailPanelView から移設): AI相談ドロワー。DetailPanelView 撤去に伴い、
  // useConsult を ApproveClient で生成し ConsultDrawer/ConsultComposer もここで描画する(相談フロー不変)。
  // フックは早期 return より前で無条件に呼ぶ必要があるため、開いている項目(polledItem)を渡す。
  // 未選択時は安定したプレースホルダ item を渡す(相談は開かないため副作用なし)。
  const consultItem: PendingItem = polledItem ?? {
    id: "",
    kind: "idea",
    title: "",
    subtitle: "",
    stage: "proposed",
  };
  const consultDraft: DraftPreview | null =
    draftState.status === "ready" ? draftState.draft : null;
  const consult = useConsult({
    item: consultItem,
    token,
    draft: consultDraft,
    onReloadDraft: () => void loadDraft(consultItem.id),
    revise,
  });

  // #244: 合言葉エラーは入力欄へフォーカスを戻し、再入力しやすくする。
  function failAuth(text: string): void {
    setMessage(text);
    const input = passphraseRef.current;
    /* istanbul ignore else -- 合言葉入力欄は認証前画面で常にマウント済み */
    if (input) input.focus();
  }

  async function enter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pass = passphrase.trim();
    if (!pass) {
      failAuth("合言葉を入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      setBoardData(await fetchBoard(pass));
      setBoardSeeded(true);
      setToken(pass);
      setAuthed(true);
    } catch (error) {
      failAuth(toMessage(error, "取得に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  // 認証無効(一時措置)時は合言葉なしで承認待ちを取得する。失敗は握り潰さず再読込で復帰。
  const loadPending = useCallback(async (): Promise<void> => {
    setBusy(true);
    setLoadError("");
    try {
      setBoardData(await fetchBoard(""));
      setBoardSeeded(true);
    } catch (error) {
      setLoadError(toMessage(error, "取得に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }, [setBoardData]);

  useEffect(() => {
    if (!authDisabled) return;
    void loadPending();
  }, [authDisabled, loadPending]);

  // #proto P3b: 構成やり直し(revert)の確認ダイアログ状態。公開/クローズ(#167)は proto 厳密優先で
  // 詳細パネルから撤去したため、確認ダイアログは "revert" 専用に縮約した(公開キューは PublishQueue へ)。
  const [actionBusy, setActionBusy] = useState(false);
  // #167/H2: 構成やり直しの確認ダイアログ(window.confirm を置換・対象タイトルを明示)。
  const [confirmAction, setConfirmAction] = useState<
    { kind: "revert"; id: string; title: string } | null
  >(null);

  /**
   * 下書き作成済みを提案中に戻す(構成からやり直す)。成功で盤を最新化しパネルを閉じる。
   * 起点(構成からやり直すボタン)はコマンドバーにあり、失敗時の inline 表示先(下書きプレビュー)が
   * 必ずしも描画されていないため、成否はトーストで明示する(沈黙させない)。
   */
  async function revertArticle(id: string): Promise<void> {
    setActionBusy(true);
    try {
      await postRevert(token, id);
      await pollBoard();
      setActiveId(null);
      pushToast("提案中に戻しました。構成・タイトルを直して再承認してください。");
    } catch (error) {
      pushToast(toMessage(error, "提案中に戻せませんでした。"), "error");
    } finally {
      setActionBusy(false);
    }
  }

  /** 構成やり直しの確認ダイアログを開く(対象タイトルを明示)。 */
  function openConfirm(item: PendingItem): void {
    setConfirmAction({ kind: "revert", id: item.id, title: item.title });
  }

  /** 確認ダイアログで「確定」したときに実行する(構成やり直し専用)。 */
  async function runConfirm(action: { kind: "revert"; id: string }): Promise<void> {
    setConfirmAction(null);
    await revertArticle(action.id);
  }

  // #255: 手動追加した施策(承認待ち)を一覧の先頭に差し込み、通常フローに乗せる。
  function addProposal(item: PendingItem): void {
    setBoardData((prev) => [item, ...prev]);
  }

  // #proto P3b: プレビュータブのメタディスクリプション保存。ExcerptEditor と同じ実経路
  // (/api/growth/draft/excerpt・CONTENT キー)へ薄く結線する(no-op ではない)。成否をトーストで明示。
  async function saveMeta(pageId: string, text: string): Promise<void> {
    try {
      const res = await fetch("/api/growth/draft/excerpt", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, excerpt: text }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "保存に失敗しました。");
      }
      pushToast("メタディスクリプションを保存しました。");
    } catch (error) {
      pushToast(toMessage(error, "メタディスクリプションの保存に失敗しました。"), "error");
    }
  }


  // 認証無効(一時措置): 自動取得の読み込み中・失敗をそれぞれ明示する(沈黙させない)。
  if (authDisabled && busy) {
    return <LoadingGate />;
  }

  if (authDisabled && loadError) {
    return <LoadErrorGate message={loadError} onRetry={() => void loadPending()} />;
  }

  if (!authed) {
    return (
      <LoginScreen
        passphrase={passphrase}
        onPassphraseChange={setPassphrase}
        showPassphrase={showPassphrase}
        onToggleShow={() => setShowPassphrase((prev) => !prev)}
        onSubmit={enter}
        busy={busy}
        message={message}
        inputRef={passphraseRef}
      />
    );
  }

  // #Task2: 盤が完全空(全カテゴリ0件)でも、ヘッダー＋左ナビのシェルは常に描画する。
  // 空状態(ReviewDoneEmpty＋施策追加フォーム)はメインコンテンツ内に出し、
  // 成績/公開キュー/プロンプト view へナビで移動できるようにする(全画面 EmptyGate への差し替えを廃止)。
  const boardEmpty = items.length === 0;

  const allDone = processed === items.length;
  // #242: 施策/記事をセクション分割し、各セクション内を優先度スコア降順に並べる。
  const proposals = items.filter((item) => item.kind === "proposal").sort(byScoreDesc);
  const ideas = items.filter((item) => item.kind === "idea").sort(byScoreDesc);
  const activeItem = activeId ? items.find((item) => item.id === activeId) : undefined;

  // #proto P1: シェル統計(段階セグメント件数 / あなた待ち / 公開済み / 施策残 / 公開キュー)。
  const counts = deriveShellCounts(items, decided);
  // #proto P1: approve view のカードは段階セグメント＋検索で絞り込んでから段階列に振り分ける。
  const trimmedQuery = query.trim().toLowerCase();
  function matchesQuery(item: PendingItem): boolean {
    if (trimmedQuery === "") return true;
    const haystack = `${item.title} ${item.subtitle ?? ""}`.toLowerCase();
    return haystack.includes(trimmedQuery);
  }
  const visibleIdeas = ideas.filter(
    (item) => matchesSegment(item, segment, decided) && matchesQuery(item),
  );
  // #proto P1: 施策 view も検索で絞り込む(段階セグメントは記事専用のため施策には適用しない)。
  const visibleProposals = proposals.filter(matchesQuery);

  // #proto P3a: 記事を BoardStage ごとの単一縦リスト(段階セクション)へ分ける。
  const boardGroups = groupByBoardStage(visibleIdeas);

  // #proto P1: 表示中 view(未確定時は施策を既定描画)。
  const activeView: ApproveView = view ?? "proposal";

  // #proto P2: 検索絞り込みで active view が0件になったら SearchEmpty を出す
  // (元データはあるのに検索で消えた状態を「該当なし」として明示する)。
  const searchEmpty =
    trimmedQuery !== "" &&
    ((activeView === "proposal" && visibleProposals.length === 0 && proposals.length > 0) ||
      (activeView === "approve" && visibleIdeas.length === 0 && ideas.length > 0));

  // #109/#proto P1/P3a: キーボード操作対象はアクティブ view のカードに限定。パレットは両ストリーム横断。
  // 記事は段階セクションを跨いで並んだ順(リスト表示順)を連続レビューの並びに使う。
  const articleNavItems = boardGroups.flatMap((group) => group.items);
  // prompt/performance/queue view はカードを持たないのでキー操作対象は空。
  const navItems =
    activeView === "proposal" ? visibleProposals : activeView === "approve" ? articleNavItems : [];
  const paletteSource = [...proposals, ...ideas];
  const focusedItem = focusedIndex >= 0 ? navItems[focusedIndex] : undefined;
  const focusedId = focusedItem?.id;
  const densityClass = densityListClass(density);

  // 承認/却下できる(=提案中/未処理で未決定)か。一括・キー操作の対象判定(純関数を再利用)。
  function isBulkActionable(item: PendingItem): boolean {
    return isActionable(item, decided);
  }

  // #130: 連続レビューの並び(記事を盤の並び順で)。次/前の未処理記事の決定に使う。
  const reviewOrder = articleNavItems.map((item) => ({
    id: item.id,
    actionable: isBulkActionable(item),
  }));

  // #119/#proto P1: パレットから記事/施策どちらへもジャンプ。対象 view へ自動切替してから詳細を開く。
  function jumpTo(id: string): void {
    const isIdea = ideas.some((item) => item.id === id);
    changeView(isIdea ? "approve" : "proposal");
    setActiveId(id);
    setPaletteOpen(false);
  }

  function bulkDecide(value: Choice): void {
    navItems
      .filter((item) => selected.has(item.id) && isBulkActionable(item))
      .forEach((item) => void decide(item, value));
    setSelected(new Set());
  }

  // #109/#130: キーボードショートカットの実処理(毎レンダリングで最新化し ref 経由で呼ぶ)。
  dispatchRef.current = (action, editable) => {
    // #proto P6: モーダル/オーバーレイ開放中は単一キー操作を盤へ漏らさない(proto page.tsx:908 相当)。
    // palette/escape は抑止対象外(shouldBlockSingleKeys 内で判定)。
    const hasOpenOverlay =
      paletteOpen ||
      shortcutsOpen ||
      proposalFormOpen ||
      confirmAction !== null ||
      consult.open ||
      editingDraft;
    if (shouldBlockSingleKeys(hasOpenOverlay, action)) return;
    // #proto P1: `/` は検索欄へフォーカスを移す。⌘K/Ctrl+K のみコマンドパレットを開く。
    if (action === "search") {
      searchRef.current?.focus();
      return;
    }
    if (action === "palette") {
      setPaletteOpen(true);
      return;
    }
    // #proto P6: ? はショートカット一覧(ShortcutOverlay)を開く。
    if (action === "help") {
      setShortcutsOpen(true);
      return;
    }
    // #proto P6: 1/2/3 は詳細タブを切替(詳細パネルが開いている記事があるときのみ)。
    // 3=素材クラスタの既定リーフ(DetailPanel の clusterTargetLeaf: 素材の先頭リーフ=images)。
    if (action === "tab-outline" || action === "tab-preview" || action === "tab-material") {
      if (!activeItem) return;
      setDetailTab(
        action === "tab-outline" ? "outline" : action === "tab-preview" ? "preview" : "images",
      );
      return;
    }
    // #proto P6: x はフォーカス行/アクティブ行の選択をトグル(既存 bulk 選択ハンドラ)。
    if (action === "select-toggle") {
      const id = activeId ?? focusedId;
      if (id) toggleSelect(id);
      return;
    }
    if (action === "escape") {
      // #proto P6: 相談ドロワー(ConsultDrawer)は aria-modal=false の非モーダルのため、
      // 各 fixed モーダルの自前 Esc ではなくこの中央処理が担う。開いていれば最優先で閉じ、
      // 詳細パネル/フォーカスは維持する(proto の「1つずつ閉じる」優先順)。
      if (consult.open) {
        consult.closeDrawer();
        return;
      }
      // パレット→フォーカス解除に加え、詳細パネルが開いていれば閉じる(#127)。
      // ただし下書き編集中・入力欄(コメント等)での Esc は、そちらの操作を優先して閉じない。
      setPaletteOpen(false);
      setFocusedIndex(-1);
      if (activeId && !editingDraft && !editable) setActiveId(null);
      return;
    }
    // #130: 詳細ペイン表示中はペイン操作を優先(連続レビュー)。a承認/r却下/e編集/j次・k前。
    if (activeItem) {
      if (action === "approve") {
        if (isBulkActionable(activeItem)) void decide(activeItem, "承認");
      } else if (action === "reject") {
        if (isBulkActionable(activeItem)) void decide(activeItem, "却下");
      } else if (action === "edit") {
        if (draftState.status === "ready") startEditDraft(draftState.draft.bodyHtml);
      } else if (action === "next") {
        const id = nextReviewId(reviewOrder, activeItem.id, 1);
        if (id) setActiveId(id);
      } else {
        // prev
        const id = nextReviewId(reviewOrder, activeItem.id, -1);
        if (id) setActiveId(id);
      }
      return;
    }
    // 盤の操作(従来)。
    if (action === "next") {
      setFocusedIndex(moveIndex(focusedIndex, 1, navItems.length));
    } else if (action === "prev") {
      setFocusedIndex(moveIndex(focusedIndex, -1, navItems.length));
    } else if (action === "approve") {
      if (focusedItem && isBulkActionable(focusedItem)) void decide(focusedItem, "承認");
    } else if (action === "reject") {
      if (focusedItem && isBulkActionable(focusedItem)) void decide(focusedItem, "却下");
    } else {
      // edit
      if (focusedItem) setActiveId(focusedItem.id);
    }
  };

  // #275/#proto P3a/#P5a: 記事(idea)一覧の高密度行。施策は proto ProposalView へ移植したため、
  // renderItem は記事(idea)専用になった(BoardList の renderRow からのみ・常に as="div")。
  // BoardList は自前で `<li role="listitem">` を持つため、行は as="div" で `<li>` の入れ子
  // (不正 HTML・jsdom クラッシュ)を避ける。
  function renderItem(item: PendingItem, as: "li" | "div") {
    const choice = decided[item.id];
    return (
      <BoardCard
        key={item.id}
        as={as}
        item={item}
        choice={choice}
        isFocused={item.id === focusedId}
        bulkSelectable={isBulkActionable(item)}
        selected={selected.has(item.id)}
        stuck={
          isInFlight(item.stage) &&
          isStuck(nowTick - (firstSeenRef.current.get(item.id) ?? nowTick), STUCK_THRESHOLD_MS)
        }
        rowClassName={rowClass()}
        awaitingDownstream={isAwaitingDownstream(item.stage)}
        onOpen={() => setActiveId(item.id)}
        onToggleSelect={() => toggleSelect(item.id)}
      />
    );
  }


  // #proto P3b/P6: アイキャッチの AI 再生成(おまかせ)を実経路(/api/growth/eyecatch/regen)へ結線する。
  // 差し替え(メディア選択)は #143 で MediaLibraryModal へ実結線済み(onPickEyecatch → setMediaFor)。
  async function requestEyecatchRegen(pageId: string): Promise<void> {
    try {
      const res = await fetch("/api/growth/eyecatch/regen", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, instruction: "" }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "再生成の依頼に失敗しました。");
      }
      pushToast("アイキャッチの再生成を依頼しました。PCが処理して数分で反映されます。");
    } catch (error) {
      pushToast(toMessage(error, "アイキャッチの再生成に失敗しました。"), "error");
    }
  }

  // 本文画像の AI 再生成を実経路(/api/growth/body-image/regen)へ結線する(#156/P2)。
  // スタイル・自由指示・文字指定は生成モーダル(BodyImageRegenModal)で集めて渡す。
  async function requestBodyImageRegen(
    pageId: string,
    target: BodyImageRegenTarget,
    input: BodyImageRegenInput
  ): Promise<void> {
    try {
      const res = await fetch("/api/growth/body-image/regen", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(buildBodyRegenBody(pageId, target, input)),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "再生成の依頼に失敗しました。");
      }
      pushToast("本文画像の再生成を依頼しました。PCが処理して数分で反映されます。");
    } catch (error) {
      pushToast(toMessage(error, "本文画像の再生成に失敗しました。"), "error");
    }
  }

  // #59/P1: 本文画像ボタン(差し替え/再生成)の抽出順 index を実 src へ写像し、存在すれば apply を呼ぶ。
  // ボタンは draft ready 時のみ描画され、index は描画済み一覧由来のため src は実質必ず存在する(防御ガード)。
  function bodyImageTargetAt(index: number, apply: (targetSrc: string) => void): void {
    /* istanbul ignore next -- @preserve 本文画像ボタンは draft ready 時のみ描画され : [] 側は到達不可(防御) */
    const srcs =
      draftState.status === "ready" ? bodyImageUrlsOf(draftState.draft.bodyHtml ?? "") : [];
    const targetSrc = srcs[index];
    /* istanbul ignore else -- @preserve index は描画済み一覧由来のため src は必ず存在(防御) */
    if (targetSrc) apply(targetSrc);
  }

  function handleEditorMediaInsert(editor: Editor): void {
    /* istanbul ignore next -- @preserve エディタの画像ボタンは activeItem 配下でのみ描画される防御ガード */
    if (!activeItem) return;
    setEditorMediaFor({ item: activeItem, editor });
  }

  function handleEditorImageGenerate(editor: Editor): void {
    /* istanbul ignore next -- @preserve エディタの画像ボタンは activeItem 配下でのみ描画される防御ガード */
    if (!activeItem) return;
    setEditorInsertRegenFor({ item: activeItem, editor });
  }

  function handleEditorImagePick(targetSrc: string, editor: Editor): void {
    /* istanbul ignore next -- @preserve エディタの画像ボタンは activeItem 配下でのみ描画される防御ガード */
    if (!activeItem) return;
    setEditorImageReplaceFor({ item: activeItem, targetSrc, editor });
  }

  function handleEditorImageRegen(targetSrc: string): void {
    /* istanbul ignore next -- @preserve エディタの画像ボタンは activeItem 配下でのみ描画される防御ガード */
    if (!activeItem) return;
    if (editedHtmlRef.current !== draftOriginalHtmlRef.current) {
      pushToast("先に保存してください", "error");
      return;
    }
    setBodyRegenFor({ item: activeItem, target: { kind: "src", targetSrc } });
  }

  function handleAddBodyImage(item: PendingItem): void {
    /* istanbul ignore next -- @preserve 画像タブの追加ボタンは編集ワークスペース外でのみ操作される防御ガード */
    if (editingDraft) {
      pushToast("編集画面から挿入してください", "error");
      return;
    }
    /* istanbul ignore next -- @preserve 画像タブの追加ボタンは draft ready 後の詳細パネルで操作される防御ガード */
    if (draftState.status !== "ready") {
      pushToast("下書きの読み込み後に挿入できます。", "error");
      return;
    }
    setBodyInsertFor({ item, bodyHtml: draftState.draft.bodyHtml ?? "" });
  }

  function submitBodyImageInsert(choice: BodyImageInsertChoice): void {
    /* istanbul ignore next -- @preserve BodyImageInsertModal の onSubmit からのみ呼ばれるため state は必ず存在 */
    if (!bodyInsertFor) return;
    const next = {
      item: bodyInsertFor.item,
      bodyHtml: bodyInsertFor.bodyHtml,
      headingIndex: choice.headingIndex,
    };
    setBodyInsertFor(null);
    if (choice.method === "media") {
      setBodyInsertMediaFor(next);
      return;
    }
    setBodyInsertRegenFor(next);
  }

  async function saveInsertedBodyImage(
    item: PendingItem,
    bodyHtml: string,
    headingIndex: number | null,
    fragment: string
  ): Promise<boolean> {
    const nextHtml = insertHtmlAfterHeading(bodyHtml, headingIndex, fragment);
    const saved = await saveDraftInPlace(item.id, nextHtml);
    if (saved) {
      pushToast("本文画像を挿入しました。");
      return true;
    }
    pushToast("本文画像を挿入できませんでした。", "error");
    return false;
  }

  async function submitBodyImageInsertGenerate(input: BodyImageRegenInput): Promise<void> {
    /* istanbul ignore next -- @preserve BodyImageRegenModal(挿入) の onSubmit からのみ呼ばれるため state は必ず存在 */
    if (!bodyInsertRegenFor) return;
    const placeholderId = `img-${crypto.randomUUID()}`;
    const saved = await saveInsertedBodyImage(
      bodyInsertRegenFor.item,
      bodyInsertRegenFor.bodyHtml,
      bodyInsertRegenFor.headingIndex,
      buildPendingFigureHtml(placeholderId),
    );
    if (!saved) {
      setBodyInsertRegenFor(null);
      return;
    }
    await requestBodyImageRegen(
      bodyInsertRegenFor.item.id,
      { kind: "placeholder", placeholderId },
      input,
    );
    setBodyInsertRegenFor(null);
  }

  async function submitEditorImageGenerate(input: BodyImageRegenInput): Promise<void> {
    /* istanbul ignore next -- @preserve BodyImageRegenModal(エディタ挿入) の onSubmit からのみ呼ばれるため state は必ず存在 */
    if (!editorInsertRegenFor) return;
    const placeholderId = `img-${crypto.randomUUID()}`;
    editorInsertRegenFor.editor
      .chain()
      .focus()
      .insertContent(buildPendingFigureHtml(placeholderId))
      .run();
    const nextHtml = editorInsertRegenFor.editor.getHTML();
    setEditedHtml(nextHtml);
    const saved = await saveDraftInPlace(editorInsertRegenFor.item.id, nextHtml);
    if (!saved) {
      pushToast(
        "保存に失敗したため生成を依頼していません。プレースホルダはエディタに残っています。",
        "error",
      );
      setEditorInsertRegenFor(null);
      return;
    }
    await requestBodyImageRegen(
      editorInsertRegenFor.item.id,
      { kind: "placeholder", placeholderId },
      input,
    );
    setEditorInsertRegenFor(null);
  }

  // #proto P3b: draft の再生成ステータスから「生成中」の regenKey を導出する(ImagesView の生成中表示用)。
  // 依頼中/処理中を生成中扱いにし、`${id}:eyecatch` / `${id}:body:<index>` の集合にする。
  function deriveRegenKeys(item: PendingItem): Set<string> {
    const keys = new Set<string>();
    if (draftState.status !== "ready") return keys;
    const { eyecatchRegen, bodyRegen, bodyHtml } = draftState.draft;
    const busy = (status?: string) => status === "依頼中" || status === "処理中";
    if (busy(eyecatchRegen?.status)) keys.add(`${item.id}:eyecatch`);
    if (busy(bodyRegen?.status)) {
      /* istanbul ignore next -- @preserve bodyHtml/targetSrc は busy な body 再生成時に PC ループが必ず設定する防御既定 */
      const srcs = extractBodyImages(bodyHtml ?? "").map((ref) => ref.src);
      /* istanbul ignore next -- @preserve targetSrc 既定("")は busy 時に必ず設定されるため到達不可(防御) */
      for (const index of bodyRegenIndices(srcs, bodyRegen?.targetSrc ?? "")) {
        keys.add(`${item.id}:body:${index}`);
      }
    }
    return keys;
  }

  // #proto P3b: 現行 outline(文字列)を parse し、useReviseEditing の下書きコメント(draftComments)を
  // 合成した OutlineView 用セクションにする。
  function detailSections(item: PendingItem): OutlineViewSection[] {
    return outlineSections(item.outline).map((s, i) => ({
      heading: s.heading,
      summary: s.description || undefined,
      comments: revise.draftComments[i],
    }));
  }

  async function saveArtboard(item: PendingItem, nextSections: ReturnType<typeof outlineSections>): Promise<boolean> {
    return revise.persistOutline(item, nextSections);
  }

  function openArtboardFromConsult(): void {
    setDetailTab("artboard");
    consult.closeDrawer();
  }

  // #275/#proto P3b: 詳細パネル本体。記事は approve view の右ペイン内、施策は proposal view のドロワーとして
  // 親が配置する。2段タブ DetailPanel(proto 移植)へ本番データ・主操作・相談導線を結線する。
  function renderDetailPanel(item: PendingItem) {
    const stage = deriveBoardStage(item);
    // 本文編集の起点(下書きを編集)は draft ready のときだけ DetailPanel が描画する。
    // ready でないときは空文字(この経路は UI 到達しない)。
    const readyBodyHtml = draftState.status === "ready" ? draftState.draft.bodyHtml : "";
    return (
      <DetailPanel
        item={item}
        stage={stage}
        badgeLabel={detailBadge(item, decided[item.id]).label}
        kindLabel={KIND_BADGE[item.kind]}
        details={item.details}
        tab={detailTab}
        editing={editingDraft}
        draftState={draftState}
        onBack={() => setActiveId(null)}
        onTabChange={setDetailTab}
        onApprove={() => decideFromPanel(item, "承認")}
        onRevise={consult.openDrawer}
        onReject={() => decideFromPanel(item, "却下")}
        onRevert={() => openConfirm(item)}
        revertDisabled={isReviseBusy(item.reviseStatus)}
        decisionsDisabled={isReviseBusy(item.reviseStatus)}
        decision={decided[item.id]}
        onUndo={() => void undo(item)}
        onEdit={() => startEditDraft(readyBodyHtml)}
        prompt={item.subtitle || "この記事の生成メモはまだありません。"}
        hue={200}
        slug={item.id}
        regenKeys={deriveRegenKeys(item)}
        onPickEyecatch={() => setMediaFor(item)}
        onRegenEyecatch={() => void requestEyecatchRegen(item.id)}
        onAddBodyImage={() => handleAddBodyImage(item)}
        onPickBodyImage={(index) => bodyImageTargetAt(index, (targetSrc) => setBodyMediaFor({ item, targetSrc }))}
        onRegenBodyImage={(index) =>
          bodyImageTargetAt(index, (targetSrc) =>
            setBodyRegenFor({ item, target: { kind: "src", targetSrc } })
          )
        }
        sections={detailSections(item)}
        artboardSections={outlineSections(item.outline)}
        hypothesis={item.hypothesis}
        revising={revise.reviseBusy}
        onAddComment={(sectionIndex, text) => {
          // OutlineView は入力欄の text を直接渡す。setCommentText→saveComment を同一 tick で
          // 呼ぶと state 反映前の stale("")を掴んで取りこぼすため、明示引数でそのまま確定する(#proto P3b)。
          revise.startAddComment(sectionIndex);
          revise.saveComment(sectionIndex, text);
        }}
        onRemoveComment={(sectionIndex, commentIndex) =>
          revise.deleteComment(sectionIndex, commentIndex)
        }
        onRequestOutlineRevise={() => void revise.requestRevise(item)}
        onSaveArtboard={(nextSections) => saveArtboard(item, nextSections)}
        isSavingArtboard={revise.reviseBusy}
        artboardSaveError={revise.reviseError}
        onSaveMeta={(text) => void saveMeta(item.id, text)}
        onReloadDraft={() => void loadDraft(item.id)}
      />
    );
  }

  // #104/#136: 編集は全画面2ペインのワークスペース(オーバーレイ)で行う。route 遷移しない。
  // 詳細パネル(Framer の transform・sticky を持つ)の内側にネストすると position:fixed が
  // 祖先に閉じ込められ全画面オーバーレイが崩れるため、トップレベルで描画する。
  function renderEditWorkspace() {
    if (!editingDraft || !activeItem || draftState.status !== "ready") return null;
    return (
      <DraftEditWorkspace
        title={draftState.draft.title}
        initialHtml={draftOriginalHtml}
        livePreviewHtml={livePreviewHtml}
        onChange={setEditedHtml}
        onSave={() => saveDraft(activeItem.id)}
        onCancel={cancelEditDraft}
        saving={draftSaving}
        saveError={draftSaveError}
        dirty={editedHtml !== draftOriginalHtml}
        confirmDiscard={confirmDiscard}
        onConfirmDiscard={exitEditDraft}
        onCancelDiscard={() => setConfirmDiscard(false)}
        onSaveMeta={(text) => void saveMeta(activeItem.id, text)}
        isRegenPending={draftRegenPending}
        onEditorReady={(editor) => {
          editorRef.current = editor;
        }}
        onInsertImageFromMedia={handleEditorMediaInsert}
        onGenerateImage={handleEditorImageGenerate}
        onPickImage={handleEditorImagePick}
        onRegenImage={handleEditorImageRegen}
      />
    );
  }


  // #proto P1: 同期ラベル(盤の最終取得時刻からの経過)。dataUpdatedAt は ms epoch(未取得時 0)。
  const sync = syncAgoLabel(nowTick, boardQuery.dataUpdatedAt || null);
  const syncing = boardQuery.isRefetching || boardQuery.isFetching;
  // #proto P1: TopBar の段階セグメント(件数つき)。
  const topBarSegments = SHELL_SEGMENTS.map((s) => ({
    ...s,
    count: counts.segmentCounts[s.key],
  }));
  // #proto P1: 各 view の tabpanel a11y ラベル(従来のセクション region と別に panel 全体を識別)。
  const viewPanelLabel: Record<ApproveView, string> = {
    proposal: "施策",
    approve: "記事",
    prompt: "プロンプト",
    performance: "成績",
    queue: "公開キュー",
  };

  // #proto P1: proto 固定シェル(position:fixed; inset:0)。MotionConfig で OS の motion 設定を尊重。
  // DraftEditWorkspace は .approve-shell の外(MotionConfig 直下)で全画面オーバーレイとして描画する。
  return (
    <MotionConfig reducedMotion="user">
      <div className="approve-shell flex h-full flex-col">
        <TopBar
          segment={segment}
          segments={topBarSegments}
          query={query}
          awaitingCount={counts.awaiting}
          publishedTotal={counts.publishedTotal}
          onSegmentChange={handleSegmentChange}
          onQueryChange={setQuery}
          searchRef={searchRef}
          syncLabel={sync.label}
          syncStale={sync.stale}
          syncing={syncing}
          onRefresh={() => void pollBoard()}
          onOpenProposal={() => changeView("proposal")}
          density={density}
          onToggleDensity={handleToggleDensity}
        />

        <div className="flex min-h-0 flex-1">
          <LeftRail
            view={activeView}
            articleCount={counts.articlePending}
            proposalCount={counts.proposalPending}
            queueReadyCount={counts.queueReady}
            onChange={changeView}
          />

          <main
            aria-label={viewPanelLabel[activeView]}
            className={
              activeView === "approve" || activeView === "proposal"
                ? "flex min-w-0 flex-1 flex-col"
                : "min-w-0 flex-1 overflow-auto p-4 lg:px-6"
            }
          >
            {/* #H5: ポーリング連続失敗を可視化(古いデータを最新のように見せない・沈黙させない)。 */}
            {shouldWarnPollStale(pollFailures) ? (
              <PollStaleBanner
                lastBoardSuccessMs={lastBoardSuccessMs}
                onRetry={() => void pollBoard()}
              />
            ) : null}
            {/* #Task2: 完全空のときは「すべて処理しました」ではなく空状態(EmptyGateContent)を出す
                (元々1件も無い盤で完了メッセージを出さない)。 */}
            {!boardEmpty && allDone && activeView !== "approve" ? (
              <p className="mb-3 rounded-md bg-[var(--p-green-weak)] px-3 py-2 text-sm font-semibold text-[var(--p-green)]">
                🎉 すべて処理しました。承認分は次の制作実行で成果物になります（公開はまだされません）。
              </p>
            ) : null}

            {/* #Task2: 盤が完全空 かつ 施策/記事 view のときは、その view の通常コンテンツの代わりに
                空状態(達成感メッセージ＋施策追加フォーム)を出す。プロンプト/成績/公開キューは
                各自が空を扱えるため通常描画のままにし、ナビ移動を妨げない。 */}
            {boardEmpty && (activeView === "approve" || activeView === "proposal") ? (
              <EmptyGateContent token={token} onAdded={addProposal} />
            ) : activeView === "approve" ? (
              // #proto P3a: approve view は「単一リスト(左)＋詳細ペイン(右)」の2ペイン。
              // 狭幅(lg未満)は master-detail の1ペイン: activeId!=null は右詳細のみ、
              // null は左リストのみを見せ、右ペイン先頭の「← 一覧」で戻る。
              <div className="flex min-h-0 flex-1">
                <section
                  aria-label="記事リスト"
                  className={`${
                    activeId != null ? "hidden lg:block" : "block"
                  } w-full overflow-y-auto lg:w-[38%] lg:min-w-[330px] lg:max-w-[480px]`}
                  style={{ borderRight: "1px solid var(--p-border)" }}
                >
                  {searchEmpty ? (
                    <SearchEmpty query={query} />
                  ) : (
                    <BoardList
                      groups={boardGroups}
                      activeId={activeId}
                      decided={decided}
                      densityClass={densityClass}
                      onActivate={setActiveId}
                      renderRow={(item) => renderItem(item, "div")}
                    />
                  )}
                </section>
                <section
                  aria-label="記事の詳細"
                  className={`${activeId != null ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto`}
                  style={{ background: "var(--p-bg)" }}
                >
                  {activeItem ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveId(null)}
                        className="approve-back sticky top-0 z-10 flex items-center gap-1 px-4 py-3 text-[13px] font-medium lg:hidden"
                        style={{ color: "var(--p-text-2)", background: "var(--p-bg)" }}
                      >
                        ← 一覧
                      </button>
                      <div className="p-4 lg:px-6">{renderDetailPanel(activeItem)}</div>
                    </>
                  ) : (
                    <div
                      className="hidden h-full flex-col items-center justify-center gap-2 px-6 text-center lg:flex"
                      style={{ color: "var(--p-text-3)" }}
                    >
                      <span className="text-[13px]">記事を選択すると詳細が表示されます</span>
                    </div>
                  )}
                </section>
              </div>
            ) : searchEmpty ? (
              <SearchEmpty query={query} />
            ) : activeView === "proposal" ? (
              <ProposalView
                proposals={visibleProposals}
                decided={decided}
                activeId={activeId}
                onActivate={setActiveId}
                onApprove={(item) => void decide(item, "承認")}
                onReopen={(item) => void undo(item)}
                onReject={(item) => void decide(item, "却下")}
                onOpenForm={() => setProposalFormOpen(true)}
              />
            ) : activeView === "prompt" ? (
              <PromptsView token={token} />
            ) : activeView === "performance" ? (
              <PerformanceBoard items={ideas} />
            ) : (
              <PublishQueue
                items={ideas}
                token={token}
                onChanged={() => void pollBoard()}
                onFix={(id) => {
                  // #proto P5b: 要対応行の修正導線。既存の詳細遷移(approve view へ切替＋activeId 設定)を再利用する。
                  changeView("approve");
                  setActiveId(id);
                }}
              />
            )}
          </main>
        </div>

        <ShortcutBar onOpenShortcuts={() => setShortcutsOpen(true)} />

        {/* #109/#proto P1: 一括選択バー(fixed フローティング)。内部の count>0 ガードで出し入れする。 */}
        <BulkBar
          count={selected.size}
          onApproveAll={() => bulkDecide("承認")}
          onRejectAll={() => bulkDecide("却下")}
          onClear={() => setSelected(new Set())}
        />

        {/* #proto P1: ショートカット一覧(ボタン到達のみ)。 */}
        {shortcutsOpen ? <ShortcutOverlay onClose={() => setShortcutsOpen(false)} /> : null}

        {/* #P5a: 施策作成モーダル(proto ProposalFormModal)。dialog overlay は CSS 変数(--p-*)を
            継承するため .approve-shell 配下で描画する。作成成功時は addProposal で一覧先頭へ差し込む。 */}
        {proposalFormOpen ? (
          <ProposalFormModal
            token={token}
            onClose={() => setProposalFormOpen(false)}
            onAdded={addProposal}
          />
        ) : null}

        {/* #167/H2: 構成やり直しの確認ダイアログ(window.confirm を置換・対象タイトルを明示)。公開/クローズは撤去。 */}
        {confirmAction ? (
          <ConfirmActionDialog
            action={confirmAction}
            busy={actionBusy}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => void runConfirm(confirmAction)}
          />
        ) : null}

        {/* #108: 下書き完成トースト(LINE通知と二重化)。閉じるまで残す。 */}
        <ToastList toasts={toasts} onDismiss={dismissToast} />

        {/* #109/#proto P1: コマンドパレット(⌘K)。両ストリーム横断検索→view 切替＋詳細へジャンプ。 */}
        {paletteOpen ? (
          <CommandPalette
            items={paletteSource.map((item) => ({
              id: item.id,
              title: item.title,
              subtitle: item.subtitle,
            }))}
            onJump={jumpTo}
            onClose={() => setPaletteOpen(false)}
          />
        ) : null}
      </div>

      {/* #P5a: 施策(proposal view)は ProposalView 内の右ペインで詳細(ProposalDetailBody)を出すため、
          旧「非 approve view の DetailPanel ドロワー」は撤去した。記事(approve view)は右ペインで
          renderDetailPanel を出す(2ペイン)。他 view(prompt/performance/queue)はカードを持たない。 */}

      {/* 差分B(#proto P3b で DetailPanelView から移設): AI相談ドロワー。ConsultDrawer/ConsultComposer は
          ApproveClient から描画する(相談フロー不変)。記事(approve view)を開いているときのみ意味を持つ。 */}
      {activeItem && activeView === "approve" ? (
        <ConsultDrawer
          open={consult.open}
          stage={consult.stage}
          mode={consult.mode}
          views={consult.views}
          composer={
            <ConsultComposer
              mode={consult.mode}
              item={activeItem}
              bodyHtml={consult.bodyHtml}
              advice={consult.advice}
              bodyCommentConsult={consult.bodyCommentConsult}
              revise={revise}
              onOpenArtboard={openArtboardFromConsult}
            />
          }
          busy={consult.busy}
          onModeChange={consult.setMode}
          onClose={consult.closeDrawer}
          onReload={consult.onReload}
          onAdviceDismiss={consult.onAdviceDismiss}
          onAdviceSubmitApply={consult.onAdviceSubmitApply}
          onAdviceDismissApply={consult.onAdviceDismissApply}
          onAdviceApplyNow={consult.onAdviceApplyNow}
          onReviseApply={consult.onReviseApply}
          onReviseDiscard={consult.onReviseDiscard}
          onSentenceApplyAll={consult.onSentenceApplyAll}
          onRetry={consult.onRetry}
          adopted={consult.adopted}
          selectable={consult.selectable}
          classifications={consult.classifications}
          onToggleAdopt={consult.onToggleAdopt}
        />
      ) : null}

      {/* #proto P6/#143: 詳細パネル素材タブ「メディアから選ぶ」→ メディアライブラリ。反映成功で下書き再取得＋盤再取得。
          PublishQueue の結線例と同形(token/pageId/onClose/onApplied)。失敗系は modal 内で可視化済み(P5b)。 */}
      {mediaFor ? (
        <MediaLibraryModal
          token={token}
          pageId={mediaFor.id}
          heading={mediaFor.title}
          onClose={() => setMediaFor(null)}
          onApplied={() => {
            // 反映成功→下書きを再取得(既存 loadDraft)＋盤を再取得(pollBoard)。モーダルは自身で閉じる。
            void loadDraft(mediaFor.id);
            void pollBoard();
            pushToast("アイキャッチを差し替えました。");
            setMediaFor(null);
          }}
        />
      ) : null}

      {bodyMediaFor ? (
        <MediaLibraryModal
          token={token}
          pageId={bodyMediaFor.item.id}
          heading={bodyMediaFor.item.title}
          mode="body-image"
          targetSrc={bodyMediaFor.targetSrc}
          onClose={() => setBodyMediaFor(null)}
          onApplied={() => {
            void loadDraft(bodyMediaFor.item.id);
            void pollBoard();
            pushToast("本文画像を差し替えました。");
            setBodyMediaFor(null);
          }}
        />
      ) : null}

      {bodyInsertFor ? (
        <BodyImageInsertModal
          heading={bodyInsertFor.item.title}
          bodyHtml={bodyInsertFor.bodyHtml}
          onClose={() => setBodyInsertFor(null)}
          onSubmit={submitBodyImageInsert}
        />
      ) : null}

      {bodyInsertMediaFor ? (
        <MediaLibraryModal
          token={token}
          pageId={bodyInsertMediaFor.item.id}
          heading={bodyInsertMediaFor.item.title}
          onClose={() => setBodyInsertMediaFor(null)}
          onApplied={noopModalApplied}
          onSelect={(url) => {
            void saveInsertedBodyImage(
              bodyInsertMediaFor.item,
              bodyInsertMediaFor.bodyHtml,
              bodyInsertMediaFor.headingIndex,
              bodyImageFigureHtml(url, ""),
            ).finally(() => setBodyInsertMediaFor(null));
          }}
        />
      ) : null}

      {editorMediaFor ? (
        <MediaLibraryModal
          token={token}
          pageId={editorMediaFor.item.id}
          heading={editorMediaFor.item.title}
          onClose={() => setEditorMediaFor(null)}
          onApplied={noopModalApplied}
          onSelect={(url) => {
            editorMediaFor.editor
              .chain()
              .focus()
              .insertContent(bodyImageFigureHtml(url, ""))
              .run();
            setEditedHtml(editorMediaFor.editor.getHTML());
            setEditorMediaFor(null);
          }}
        />
      ) : null}

      {editorImageReplaceFor ? (
        <MediaLibraryModal
          token={token}
          pageId={editorImageReplaceFor.item.id}
          heading={editorImageReplaceFor.item.title}
          onClose={() => setEditorImageReplaceFor(null)}
          onApplied={noopModalApplied}
          onSelect={(url) => {
            replacePreservedImageSrc(
              editorImageReplaceFor.editor,
              editorImageReplaceFor.targetSrc,
              url,
            );
            setEditedHtml(editorImageReplaceFor.editor.getHTML());
            setEditorImageReplaceFor(null);
          }}
        />
      ) : null}

      {bodyRegenFor ? (
        <BodyImageRegenModal
          heading={bodyRegenFor.item.title}
          onClose={() => setBodyRegenFor(null)}
          onSubmit={(input) => {
            void requestBodyImageRegen(bodyRegenFor.item.id, bodyRegenFor.target, input);
            setBodyRegenFor(null);
          }}
        />
      ) : null}

      {bodyInsertRegenFor ? (
        <BodyImageRegenModal
          heading={bodyInsertRegenFor.item.title}
          onClose={() => setBodyInsertRegenFor(null)}
          onSubmit={(input) => {
            void submitBodyImageInsertGenerate(input);
          }}
        />
      ) : null}

      {editorInsertRegenFor ? (
        <BodyImageRegenModal
          heading={editorInsertRegenFor.item.title}
          onClose={() => setEditorInsertRegenFor(null)}
          onSubmit={(input) => {
            void submitEditorImageGenerate(input);
          }}
        />
      ) : null}

      {/* #104/#136: 編集は全画面2ペインのワークスペース。position:fixed が祖先 transform に
          閉じ込められないよう .approve-shell の外(MotionConfig 直下)で描画する。 */}
      {renderEditWorkspace()}
    </MotionConfig>
  );
}
