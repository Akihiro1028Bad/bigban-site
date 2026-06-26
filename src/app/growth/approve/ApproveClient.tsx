"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
// useDebouncedValue は useDraftEditing フックへ移設(#H7)。

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { BODY_REGEN_BUSY_STATUSES } from "@/lib/growth/bodyImageRegen";
import { REGEN_BUSY_STATUSES } from "@/lib/growth/eyecatchRegen";
import { readJsonObject } from "@/lib/growth/safeJson";

import {
  effectiveStage,
  groupArticlesByStage,
  isActionable,
  isAwaitingDownstream,
  reconcileDecided,
  scoreBarPct,
  stageStepIndex,
} from "./board";
import { stageTheme } from "./boardColors";
import {
  GENERATING_STEPS,
  isInFlight,
  isStuck,
  newlyDraftedIds,
  STUCK_THRESHOLD_MS,
} from "./generating";
import { isEditableTag, moveIndex, resolveShortcut } from "./shortcuts";
import {
  type Density,
  densityListClass,
  nextDensity,
  parseDensity,
  pruneSelection,
  toggleId,
} from "./boardPrefs";

import { fetchBoard, postPublish } from "./api";
import { choiceButtonClass, TAP_TARGET } from "./approveStyles";
import { BoardCard } from "./BoardCard";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { DetailPanelView } from "./DetailPanelView";
import { EmptyGate, LoadErrorGate, LoadingGate } from "./GateScreens";
import { LoginScreen } from "./LoginScreen";
import { ToastList } from "./ToastList";
import { APPROVE_BOARD_KEY, useApproveBoard } from "./hooks/useApproveBoard";
import { AddProposalForm } from "./AddProposalForm";
import { ArticlesView } from "./ArticlesView";
import { PerformanceBoard } from "./PerformanceBoard";
import { PublishQueue } from "./PublishQueue";
import { ProposalsView } from "./ProposalsView";
import { nextReviewId } from "./reviewNav";
import { APPROVE_VIEWS, decideInitialView, parseView } from "./viewRouting";
import type { ApproveView } from "./viewRouting";
import { CommandPalette } from "./CommandPalette";
import { DraftEditWorkspace } from "./DraftEditWorkspace";
import { authHeaders } from "./authHeaders";
import { formatLastUpdated, shouldWarnPollStale } from "./pollHealth";
import { type DraftPreview, type DraftState } from "./draftTypes";
import { toMessage } from "./errorMessage";
import { columnHeaderClass, isReviseBusy, KIND_BADGE, rowClass } from "./boardItemHelpers";
import type { Choice, PendingItem } from "./types";
import { useApproveDecisions } from "./hooks/useApproveDecisions";
import { useDraftEditing } from "./hooks/useDraftEditing";
import { useReviseEditing } from "./hooks/useReviseEditing";
import { revisePhase } from "./revisePhase";

// 提示待ちのあいだ修正ステータスを再取得する間隔(ミリ秒)。
const REVISE_POLL_MS = 5000;

// 盤データ未取得時の安定した空配列(#H7: 参照を固定して不要な再計算を避ける)。
const EMPTY_ITEMS: PendingItem[] = [];

// #166: AI再生成が依頼中/処理中の間、下書きを再取得して依頼中→完了を生更新する間隔(ミリ秒)。
const DRAFT_REGEN_POLL_MS = 5000;

// #109: 表示密度の保存キー(localStorage)。
const DENSITY_KEY = "growth-approve-density";


// 修正処理中(再依頼不可・承認排他の対象)の状態。
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
  // #108: 完了トースト/滞留検知用。nowTick は滞留経過の基準時刻、
  // firstSeenRef は記事が生成待ち/生成中に入った時刻。前回値の参照は prevBoardRef(盤更新effect)が担う。
  const [toasts, setToasts] = useState<
    { id: string; message: string; tone: "success" | "error" }[]
  >([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  // M8: コピー等の通知トーストに使う一意 id 採番。
  const toastSeq = useRef(0);
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
  const [message, setMessage] = useState("");
  // 認証無効時は初回マウントで自動取得するため、初期から読み込み中にしておく。
  const [busy, setBusy] = useState(authDisabled);
  // #240: 操作後に次の操作対象へフォーカスを移すための一時ターゲット(要素 id)。
  const [focusId, setFocusId] = useState<string | null>(null);
  // #275: master-detail。詳細パネルを開いている項目 id(クライアントのオーバーレイ)。
  const [openId, setOpenId] = useState<string | null>(null);
  // #H7: 承認/却下/承認待ちに戻す(即時保存モデル)はカスタムフックへ集約。
  // decisionMutation はクローズ操作でも共用するため公開分を受け取る。
  const {
    decided,
    failures,
    savingId,
    setDecided,
    decisionMutation,
    decide,
    undo,
    decideFromPanel,
    undoFromPanel,
  } = useApproveDecisions({
    token,
    onFocus: setFocusId,
    onClosePanel: () => setOpenId(null),
  });
  // #H7: 構成案の修正(AI依頼/手動編集/画像指示/タイトル/提示反映)はカスタムフックへ集約し、
  // 戻り値を丸ごと ReviseSectionView へ渡す。refreshItems(最新化)のみ提示待ちポーリングで共用。
  const revise = useReviseEditing({ token, openId, setBoardData });
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

  // フォーム状態のリセット(openId 変化)は useDraftEditing / useReviseEditing 各フックが担う(#H7)。

  // #119: 初期表示タブの確定。URL の ?view 指定はマウント時に同期確定済み。ここでは未確定時に
  // 一覧読込後、未処理がある方(両方あれば施策)を自動選択する。確定後は自動上書きしない。
  useEffect(() => {
    if (viewPinned) return;
    if (items.length === 0) return;
    // 施策は「未処理(承認/却下できる)」があるか、記事は「パイプラインに記事があるか」で判定。
    // 施策に未処理が無くても記事が動いていれば記事を初期表示する(両方あれば施策優先)。
    const counts = {
      proposals: items.filter((i) => i.kind === "proposal" && isActionable(i, decided)).length,
      articles: items.filter((i) => i.kind === "idea").length,
    };
    setView(decideInitialView(null, counts));
    setViewPinned(true);
  }, [items, decided, viewPinned]);

  // #119: タブを切り替える(URL にも反映し、以降の自動切替を止める)。
  // タブ間でカード件数が異なるため、キーボードフォーカスは未選択(-1)に戻す。
  const changeView = useCallback((next: ApproveView): void => {
    setView(next);
    setViewPinned(true);
    setFocusedIndex(-1);
    writeViewParam(next);
  }, []);

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
      setToasts((prev) => [
        ...prev,
        ...next
          .filter((item) => done.has(item.id))
          .map((item) => ({
            id: `done-${item.id}`,
            message: `🎉 「${item.title}」の下書きが完成しました`,
            tone: "success" as const,
          })),
      ]);
    }
    setDecided((prev) => reconcileDecided(prev, next));
    // setDecided は useApproveDecisions が返す安定参照(useState セッター)。
  }, [boardQuery.data, setDecided]);

  // #H5: poll/refetch の失敗を連続失敗として可視化(沈黙させない)。初期ロード失敗は loadError/failAuth 側。
  useEffect(() => {
    if (boardQuery.isError) setPollFailures((f) => f + 1);
  }, [boardQuery.isError, boardQuery.errorUpdatedAt]);

  // M8: 通知トーストを1件積む(一意 id を採番)。
  function pushToast(message: string, tone: "success" | "error" = "success"): void {
    toastSeq.current += 1;
    const id = `toast-${toastSeq.current}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
  }

  function dismissToast(id: string): void {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  // #109: キーボード操作の最新ハンドラを ref に保持(早期 return より前で document に結線するため)。
  const dispatchRef = useRef<
    (action: ReturnType<typeof resolveShortcut>, editable: boolean) => void
  >(
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

  function toggleDensity(): void {
    setDensity((prev) => {
      const next = nextDensity(prev);
      window.localStorage.setItem(DENSITY_KEY, next);
      return next;
    });
  }

  // #109: 取得更新で消えた選択を掃除する。
  useEffect(() => {
    setSelected((prev) => pruneSelection(prev, items.map((item) => item.id)));
  }, [items]);

  function toggleSelect(id: string): void {
    setSelected((prev) => toggleId(prev, id));
  }

  // #43: 開いている記事が提示待ち(依頼中/処理中)かどうか。
  const polledItem = openId ? items.find((it) => it.id === openId) : undefined;
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

  // #75: 下書きプレビュー。開いている記事が下書き作成済み(contentId あり)のときだけ取得する。
  const [draftState, setDraftState] = useState<DraftState>({ status: "idle" });
  const openHasDraft = polledItem?.kind === "idea" && Boolean(polledItem.contentId);

  const loadDraft = useCallback(
    async (pageId: string): Promise<void> => {
      setDraftState({ status: "loading" });
      try {
        const res = await fetch(
          `/api/growth/draft?pageId=${encodeURIComponent(pageId)}`,
          { headers: authHeaders(token) }
        );
        const json = await readJsonObject(res);
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "下書きの取得に失敗しました。");
        }
        if (!json.exists) {
          setDraftState({ status: "empty" });
          return;
        }
        setDraftState({ status: "ready", draft: json.draft as DraftPreview });
      } catch (error) {
        setDraftState({ status: "error", error: toMessage(error, "下書きの取得に失敗しました。") });
      }
    },
    [token]
  );

  // パネルを開いたら(下書きありの記事のみ)取得。閉じる/対象外は idle に戻す。
  useEffect(() => {
    if (openId && openHasDraft) {
      void loadDraft(openId);
    } else {
      setDraftState({ status: "idle" });
    }
  }, [openId, openHasDraft, loadDraft]);

  // #166: ローディング表示に切り替えずに下書きだけ静かに再取得する(ポーリング用)。
  // 失敗/消失時は現在の表示を維持して次の tick に委ねる(沈黙させるが画面は壊さない)。
  const refreshDraftSilently = useCallback(
    async (pageId: string): Promise<void> => {
      try {
        const res = await fetch(
          `/api/growth/draft?pageId=${encodeURIComponent(pageId)}`,
          { headers: authHeaders(token) }
        );
        const json = await readJsonObject(res);
        if (!res.ok || !json.success || !json.exists) return;
        setDraftState({ status: "ready", draft: json.draft as DraftPreview });
      } catch {
        // ネットワーク一時障害は無視(次の tick で回復)。
      }
    },
    [token]
  );

  // #166: AI再生成(本文画像/アイキャッチ)が依頼中/処理中の間だけ下書きを定期再取得し、
  // 「依頼中→完了」をバッジ消滅＋画像更新として生反映する。なし/失敗になったら止める。
  const draftRegenPending =
    draftState.status === "ready" &&
    (((draftState.draft.bodyRegen &&
      (BODY_REGEN_BUSY_STATUSES as readonly string[]).includes(draftState.draft.bodyRegen.status)) ??
      false) ||
      ((draftState.draft.eyecatchRegen &&
        (REGEN_BUSY_STATUSES as readonly string[]).includes(draftState.draft.eyecatchRegen.status)) ??
        false));

  useEffect(() => {
    if (!openId || !draftRegenPending) return;
    const timer = setInterval(() => {
      void refreshDraftSilently(openId);
    }, DRAFT_REGEN_POLL_MS);
    return () => clearInterval(timer);
  }, [openId, draftRegenPending, refreshDraftSilently]);

  // #77/#98/#110/#129: 下書きの手動リッチ編集はカスタムフックへ集約(#H7 分解)。
  const {
    editingDraft,
    draftOriginalHtml,
    draftSaving,
    draftSaveError,
    confirmDiscard,
    livePreviewHtml,
    previewDevice,
    setEditedHtml,
    setPreviewDevice,
    setConfirmDiscard,
    startEditDraft,
    openCardEditor,
    cancelEditDraft,
    exitEditDraft,
    saveDraft,
  } = useDraftEditing({ token, openId, draftState, loadDraft, onOpen: setOpenId });

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

  // #H7: 公開/修正系の更新を useMutation 化(fetch ロジックは api.ts)。承認/却下/復帰の
  // decisionMutation は useApproveDecisions から受け取る(クローズで共用)。
  // 公開は外向き操作のため成功時に盤を invalidate して最新化する。
  const publishMutation = useMutation({
    mutationFn: (id: string) => postPublish(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPROVE_BOARD_KEY }),
  });

  // #167: 公開・クローズ(取り消しづらい外向き操作のため確認ダイアログを必ず挟む)。
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  // #167/H2: 公開・クローズの確認ダイアログ(window.confirm を置換・対象タイトルを明示)。
  const [confirmAction, setConfirmAction] = useState<
    { kind: "publish" | "close"; id: string; title: string } | null
  >(null);

  async function publishArticle(id: string): Promise<void> {
    setActionBusy(true);
    setActionError("");
    try {
      await publishMutation.mutateAsync(id);
      pushToast("記事を公開しました。");
    } catch (error) {
      setActionError(toMessage(error, "公開に失敗しました。"));
    } finally {
      setActionBusy(false);
    }
  }

  async function closeTask(id: string): Promise<void> {
    setActionBusy(true);
    setActionError("");
    try {
      await decisionMutation.mutateAsync({ id, decision: "クローズ" });
      await pollBoard();
    } catch (error) {
      setActionError(toMessage(error, "クローズに失敗しました。"));
    } finally {
      setActionBusy(false);
    }
  }

  /** 公開/クローズの確認ダイアログを開く(対象タイトルを明示)。 */
  function openConfirm(item: PendingItem, kind: "publish" | "close"): void {
    setConfirmAction({ kind, id: item.id, title: item.title });
  }

  /** 確認ダイアログで「確定」したときに実行する(対象はダイアログ表示中の confirmAction)。 */
  async function runConfirm(action: { kind: "publish" | "close"; id: string }): Promise<void> {
    setConfirmAction(null);
    if (action.kind === "publish") await publishArticle(action.id);
    else await closeTask(action.id);
  }

  // #255: 手動追加した施策(承認待ち)を一覧の先頭に差し込み、通常フローに乗せる。
  function addProposal(item: PendingItem): void {
    setBoardData((prev) => [item, ...prev]);
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

  if (items.length === 0) {
    return <EmptyGate token={token} onAdded={addProposal} />;
  }

  const allDone = processed === items.length;
  // #242: 施策/記事をセクション分割し、各セクション内を優先度スコア降順に並べる。
  const proposals = items.filter((item) => item.kind === "proposal").sort(byScoreDesc);
  const ideas = items.filter((item) => item.kind === "idea").sort(byScoreDesc);
  const openItem = openId ? items.find((item) => item.id === openId) : undefined;

  // #107: 記事をパイプライン段階(#106)ごとの列に振り分ける。承認は生成待ち列へ前進。
  const articleColumns = groupArticlesByStage(ideas, decided);
  // 段階インジケータ/スコアバーの分母(記事の最大スコア)。
  const ideaMaxScore = ideas.reduce((max, item) => Math.max(max, item.score ?? 0), 0);

  // #119: 表示中タブ(未確定時は施策を既定描画)。タブの未処理件数バッジも算出。
  const activeView: ApproveView = view ?? "proposals";
  const proposalPending = proposals.filter((item) => isActionable(item, decided)).length;
  const articlePending = ideas.filter((item) => isActionable(item, decided)).length;
  const pendingByView: Record<ApproveView, number> = {
    proposals: proposalPending,
    articles: articlePending,
  };

  // #109/#119: キーボード操作対象はアクティブタブのカードに限定。パレットは両ストリーム横断。
  const articleNavItems = articleColumns.flatMap((col) => col.items);
  const navItems = activeView === "proposals" ? proposals : articleNavItems;
  const paletteSource = [...proposals, ...articleNavItems];
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

  // #119: パレットから記事/施策どちらへもジャンプ。対象タブへ自動切替してから詳細を開く。
  function jumpTo(id: string): void {
    const isIdea = ideas.some((item) => item.id === id);
    changeView(isIdea ? "articles" : "proposals");
    setOpenId(id);
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
    if (action === "search" || action === "palette") {
      setPaletteOpen(true);
      return;
    }
    if (action === "escape") {
      // パレット→フォーカス解除に加え、詳細パネルが開いていれば閉じる(#127)。
      // ただし下書き編集中・入力欄(コメント等)での Esc は、そちらの操作を優先して閉じない。
      setPaletteOpen(false);
      setFocusedIndex(-1);
      if (openId && !editingDraft && !editable) setOpenId(null);
      return;
    }
    // #130: 詳細パネル表示中はパネル操作を優先(連続レビュー)。a承認/r却下/e編集/j次・k前。
    if (openItem) {
      if (action === "approve") {
        if (isBulkActionable(openItem)) void decide(openItem, "承認");
      } else if (action === "reject") {
        if (isBulkActionable(openItem)) void decide(openItem, "却下");
      } else if (action === "edit") {
        if (draftState.status === "ready") startEditDraft(draftState.draft.bodyHtml);
      } else if (action === "next") {
        const id = nextReviewId(reviewOrder, openItem.id, 1);
        if (id) setOpenId(id);
      } else {
        // prev
        const id = nextReviewId(reviewOrder, openItem.id, -1);
        if (id) setOpenId(id);
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
      if (focusedItem) setOpenId(focusedItem.id);
    }
  };

  // #275: 高密度な一覧行。詳細はパネルへ寄せ、行では承認/却下/詳細だけを出す。
  function renderItem(item: PendingItem) {
    const choice = decided[item.id];
    const isIdea = item.kind === "idea";
    const failure = failures[item.id];
    return (
      <BoardCard
        key={item.id}
        item={item}
        choice={choice}
        isBusy={savingId === item.id}
        lockedForRevise={isReviseBusy(item.reviseStatus)}
        failure={failure}
        isFocused={item.id === focusedId}
        bulkSelectable={isBulkActionable(item)}
        selected={selected.has(item.id)}
        isIdea={isIdea}
        step={isIdea ? stageStepIndex(effectiveStage(item, choice)) : -1}
        scoreBarWidth={scoreBarPct(item.score ?? 0, ideaMaxScore)}
        stageAccentClass={isIdea ? `border-l-4 ${stageTheme(effectiveStage(item, choice)).accent}` : ""}
        stuck={
          isIdea &&
          isInFlight(item.stage) &&
          isStuck(nowTick - (firstSeenRef.current.get(item.id) ?? nowTick), STUCK_THRESHOLD_MS)
        }
        rowClassName={rowClass(choice, Boolean(failure))}
        kindLabel={KIND_BADGE[item.kind]}
        generatingStepsText={GENERATING_STEPS.join(" → ")}
        awaitingDownstream={isAwaitingDownstream(item.stage)}
        onOpen={() => setOpenId(item.id)}
        onUndo={() => void undo(item)}
        onEdit={() => openCardEditor(item.id)}
        onToggleSelect={() => toggleSelect(item.id)}
        onApprove={() => void decide(item, "承認")}
        onReject={() => void decide(item, "却下")}
      />
    );
  }


  // #104/#136: 編集は全画面2ペインのワークスペース(オーバーレイ)で行う。route 遷移しない。
  // 詳細パネル(Framer の transform・sticky を持つ)の内側にネストすると position:fixed が
  // 祖先に閉じ込められ全画面オーバーレイが崩れるため、トップレベルで描画する。
  function renderEditWorkspace() {
    if (!editingDraft || !openItem || draftState.status !== "ready") return null;
    return (
      <DraftEditWorkspace
        title={draftState.draft.title}
        initialHtml={draftOriginalHtml}
        livePreviewHtml={livePreviewHtml}
        onChange={setEditedHtml}
        onSave={() => saveDraft(openItem.id)}
        onCancel={cancelEditDraft}
        saving={draftSaving}
        saveError={draftSaveError}
        confirmDiscard={confirmDiscard}
        onConfirmDiscard={exitEditDraft}
        onCancelDiscard={() => setConfirmDiscard(false)}
      />
    );
  }


  return (
    <main className="mx-auto max-w-md p-4 lg:max-w-7xl lg:px-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-gray-900">今週の提案</h1>
        <p className="text-sm text-gray-600">
          処理済み {processed} / {items.length}件
        </p>
      </div>
      <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        承認した提案は制作キューに追加されます。この場では公開されません。
      </p>
      {/* #H5: ポーリング連続失敗を可視化(古いデータを最新のように見せない・沈黙させない)。 */}
      {shouldWarnPollStale(pollFailures) ? (
        <p
          role="status"
          className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <span className="flex-1">
            最新情報を取得できていません（最終更新 {formatLastUpdated(lastBoardSuccessMs)}）。回線や自宅PCの状態を確認してください。
          </span>
          <button
            type="button"
            onClick={() => void pollBoard()}
            className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            再試行
          </button>
        </p>
      ) : null}

      {/* #119: 施策/記事のタブ切替。各タブに未処理件数バッジを出し残件を可視化する。 */}
      <div
        role="tablist"
        aria-label="表示切替"
        onKeyDown={(event) => {
          // WAI-ARIA tabs: ←→ でタブ移動。それ以外のキーは既定動作を維持する。
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const idx = APPROVE_VIEWS.indexOf(activeView);
          const delta = event.key === "ArrowRight" ? 1 : -1;
          changeView(APPROVE_VIEWS[(idx + delta + APPROVE_VIEWS.length) % APPROVE_VIEWS.length]);
        }}
        className="mt-3 inline-flex gap-1 rounded-md bg-gray-100 p-1"
      >
        {APPROVE_VIEWS.map((v) => {
          const selectedTab = activeView === v;
          const label = v === "proposals" ? "施策" : "記事";
          const count = pendingByView[v];
          return (
            <button
              key={v}
              type="button"
              role="tab"
              id={`approve-tab-${v}`}
              aria-controls="approve-tabpanel"
              aria-selected={selectedTab}
              tabIndex={selectedTab ? 0 : -1}
              onClick={() => changeView(v)}
              className={`min-h-11 flex items-center gap-2 rounded px-4 text-sm font-medium transition-colors ${
                selectedTab ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
              {count > 0 ? (
                <span
                  aria-label={`未処理 ${count} 件`}
                  className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* #109: 操作ツールバー。コマンドパレット起動と表示密度トグル(キーボード非依存の可視UI)。 */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={`${TAP_TARGET} flex-1 border border-gray-300 bg-white text-left text-sm text-gray-600 hover:bg-gray-50`}
        >
          🔍 検索・ジャンプ（⌘K / /）
        </button>
        <button
          type="button"
          aria-pressed={density === "compact"}
          onClick={toggleDensity}
          className={`${TAP_TARGET} border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50`}
        >
          {density === "compact" ? "コンパクト" : "標準"}
        </button>
      </div>
      {/* #137: キーボードヒントはPCのみ。スマホにはタッチ向けの一言を出す。 */}
      <p className="mt-1 hidden text-xs text-gray-400 lg:block">
        キーボード: j/k 移動・a 承認・r 却下・e 詳細・/ 検索・Esc 解除
      </p>
      <p className="mt-1 text-xs text-gray-400 lg:hidden">
        カードをタップで詳細・承認/却下はカード内のボタンから
      </p>

      {/* #109: 一括選択バー(選択がある時のみ)。一括承認/却下は各カードと同じ即時保存＋取り消し。 */}
      {selected.size > 0 ? (
        <div
          role="group"
          aria-label="一括操作"
          className="mt-2 flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm"
        >
          <span className="flex-1 text-gray-700">{selected.size}件 選択中</span>
          <button
            type="button"
            onClick={() => bulkDecide("承認")}
            className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
          >
            一括承認
          </button>
          <button
            type="button"
            onClick={() => bulkDecide("却下")}
            className={choiceButtonClass("border border-gray-700 bg-gray-700 text-white")}
          >
            一括却下
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className={choiceButtonClass("border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
          >
            解除
          </button>
        </div>
      ) : null}
      {/* #167/H2: 公開・クローズの確認ダイアログ(window.confirm を置換・対象タイトルを明示)。 */}
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
      {allDone ? (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
          🎉 すべて処理しました。承認分は次の制作実行で成果物になります（公開はまだされません）。
        </p>
      ) : null}
      {/* #119: タブで施策/記事を完全分離。施策=トリアージ用リスト、記事=全幅カンバン。 */}
      <div
        role="tabpanel"
        id="approve-tabpanel"
        aria-labelledby={`approve-tab-${activeView}`}
        aria-label={activeView === "proposals" ? "施策" : "記事"}
      >
        {activeView === "proposals" ? (
          <>
            <ProposalsView
              proposals={proposals}
              renderItem={renderItem}
              densityClass={densityClass}
              headerClass={columnHeaderClass()}
            />
            <AddProposalForm token={token} onAdded={addProposal} />
          </>
        ) : (
          <>
            <div className="mb-4 space-y-4">
              <PublishQueue items={ideas} token={token} onChanged={() => void pollBoard()} />
              <PerformanceBoard items={ideas} />
            </div>
            <ArticlesView
              columns={articleColumns}
              renderItem={renderItem}
              densityClass={densityClass}
            />
          </>
        )}
      </div>
      {openItem ? (
        <DetailPanelView
          item={openItem}
          choice={decided[openItem.id]}
          isBusy={savingId === openItem.id}
          draftState={draftState}
          token={token}
          previewDevice={previewDevice}
          actionBusy={actionBusy}
          actionError={actionError}
          reviewOrder={reviewOrder}
          revise={revise}
          onDecide={decideFromPanel}
          onUndo={undoFromPanel}
          onOpen={setOpenId}
          onClose={() => setOpenId(null)}
          onPreviewDeviceChange={setPreviewDevice}
          onStartEdit={startEditDraft}
          onReloadDraft={(pageId) => void loadDraft(pageId)}
          onConfirm={openConfirm}
          onToast={pushToast}
        />
      ) : null}
      {renderEditWorkspace()}
      {/* #109/#119: コマンドパレット(⌘K / /)。両ストリーム横断検索→タブ切替＋詳細へジャンプ。 */}
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
    </main>
  );
}
