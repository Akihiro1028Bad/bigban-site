"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import { motion, MotionConfig } from "framer-motion";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import type { AdviceView } from "@/lib/growth/advise";
import type { AdviceApplyView } from "@/lib/growth/adviseApply";
import type { BodyCommentView } from "@/lib/growth/bodyComment";
import { pendingStatus } from "@/lib/growth/approve";
import {
  BODY_REGEN_BUSY_STATUSES,
  type BodyRegenStatus,
} from "@/lib/growth/bodyImageRegen";
import type { DecorateView } from "@/lib/growth/decorate";
import { REGEN_BUSY_STATUSES, type RegenStatus } from "@/lib/growth/eyecatchRegen";
import { readJsonObject } from "@/lib/growth/safeJson";
import type { Stage } from "@/lib/growth/stage";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import {
  effectiveStage,
  groupArticlesByStage,
  isActionable,
  isAwaitingDownstream,
  scoreBarPct,
  STAGE_STEPS,
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

import { AddProposalForm } from "./AddProposalForm";
import { ArticlesView } from "./ArticlesView";
import { DetailHeader } from "./DetailHeader";
import { detailBadge } from "./detailBadge";
import { DraftChecklist } from "./DraftChecklist";
import { draftQuality } from "./draftQuality";
import { MetricChips } from "./MetricChips";
import {
  PREVIEW_DEVICES,
  previewDeviceLabel,
  previewWidthClass,
  type PreviewDevice,
} from "./previewDevice";
import { ProposalsView } from "./ProposalsView";
import { nextReviewId } from "./reviewNav";
import { APPROVE_VIEWS, decideInitialView, parseView } from "./viewRouting";
import type { ApproveView } from "./viewRouting";
import { AdviceCard } from "./AdviceCard";
import { BodyImagePicker } from "./BodyImagePicker";
import { DecorationAssistant } from "./DecorationAssistant";
import { InlineCommentReview } from "./InlineCommentReview";
import { CommandPalette } from "./CommandPalette";
import { DraftPreviewFrame } from "./DraftPreviewFrame";
import { EyecatchPicker } from "./EyecatchPicker";
import { DraftEditWorkspace } from "./DraftEditWorkspace";
import { StaleNotice } from "./StaleNotice";
import { buildDraftEditPayload } from "./draftEditorContent";
import {
  IMAGE_STYLES,
  parseOutlineSections,
  serializeOutlineSections,
  type ImageStyleKey,
  type OutlineImage,
  type OutlineSection,
} from "./outline";
import { revisePhase } from "./revisePhase";

// 提示待ちのあいだ修正ステータスを再取得する間隔(ミリ秒)。
const REVISE_POLL_MS = 5000;

// #166: AI再生成が依頼中/処理中の間、下書きを再取得して依頼中→完了を生更新する間隔(ミリ秒)。
const DRAFT_REGEN_POLL_MS = 5000;

// #109: 表示密度の保存キー(localStorage)。
const DENSITY_KEY = "growth-approve-density";

// 1 セクションに付けられる本文画像の上限(#61)。超過は下書き生成側(#63)でスキップ＋通知。
const MAX_SECTION_IMAGES = 3;

// #98: 編集中ライブプレビューのデバウンス間隔(ミリ秒)。入力追従とコストの折衷。
const LIVE_PREVIEW_DEBOUNCE_MS = 250;

// #100/#124: 本番プレビュー iframe の見た目。外側のブラウザ風chromeカードが枠/角丸を
// 担うため、iframe 自体は枠なし・暗背景のみ。中身は iframe 内で本番テーマ描画される。
const PREVIEW_FRAME_CLASS = "block h-96 w-full bg-[#0A0A0A]";

// #124: 詳細パネルのセクションカード共通スタイル(淡色サーフェスでグルーピング)。
const SECTION_CARD = "rounded-lg border border-gray-200 bg-white p-3";
const SECTION_HEAD = "text-sm font-bold text-gray-700";

// スタイルキー → 表示名(チップのバッジ用・分岐を作らない単一マップ)。
const STYLE_LABEL = Object.fromEntries(
  IMAGE_STYLES.map((s) => [s.key, s.label])
) as Record<ImageStyleKey, string>;

interface PendingDetail {
  label: string;
  value: string;
}

interface PendingItem {
  id: string;
  kind: "proposal" | "idea";
  title: string;
  subtitle: string;
  details?: PendingDetail[];
  score?: number;
  // #42: 記事ネタ案の構成案修正ループ。
  outline?: string;
  reviseStatus?: string;
  reviseProposal?: string;
  // #139 B: AI が提案した新タイトル(提示中に新旧比較で表示)。空=タイトル提案なし。
  reviseTitleProposal?: string;
  reviseInstructions?: string;
  // #C2 UI: 構成案修正の依頼時刻(ms)。経過/滞留表示用。未設定は null。
  reviseRequestedAtMs?: number | null;
  // #75: 生成済み下書きの microCMS contentId(空/無=未作成)。下書きプレビューの有無判定に使う。
  contentId?: string;
  // #87: 下書き作成済み(承認後に下書き生成完了)。下書きタブへ振り分け、承認/却下を出さない。
  isDraftReady?: boolean;
  // #106/#107: パイプライン段階。盤の列分け・段階インジケータに使う。
  stage: Stage;
}

// #75: 下書きプレビューの取得状態。
interface DraftPreview {
  title: string;
  displayMode: "html" | "rich";
  bodyHtml: string;
  body: string;
  // #141: アイキャッチURLミラー(未設定は空文字)。プレビュー上部の画像表示に使う。
  eyecatch?: string;
  // #146: スタイリング・アドバイスの表示用ビュー(ステータス＋提示中のみ解析済み)。
  advice?: AdviceView;
  // #165: アドバイス採用→反映の表示用ビュー(ステータス＋提示中のみ before/after 案)。
  adviceApply?: AdviceApplyView;
  // #147: 装飾提案の表示用ビュー(ステータス＋提示中のみ解析済み提案配列)。
  decorate?: DecorateView;
  // #166: AI再生成の依頼中/処理中/失敗の表示用ビュー(本文画像は対象src付き)。
  // #C2 UI: requestedAtMs は経過/滞留表示用(未設定は null)。
  bodyRegen?: { status: BodyRegenStatus; targetSrc: string; requestedAtMs?: number | null };
  eyecatchRegen?: { status: RegenStatus; requestedAtMs?: number | null };
  // #182: 本文インラインコメントの表示用ビュー(ステータス＋投稿済みコメント)。
  bodyComment?: BodyCommentView;
}

type DraftState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; error: string }
  | { status: "ready"; draft: DraftPreview };

// 修正処理中(再依頼不可・承認排他の対象)の状態。
const REVISE_BUSY_STATUSES = ["依頼中", "処理中", "提示中"];

function isReviseBusy(status: string | undefined): boolean {
  return REVISE_BUSY_STATUSES.includes(status ?? "なし");
}

/** 構成案をセクション(見出し＋1行説明)に分割する。 */
function outlineSections(outline: string | undefined): OutlineSection[] {
  return parseOutlineSections(outline ?? "");
}

function byScoreDesc(a: PendingItem, b: PendingItem): number {
  return (b.score ?? 0) - (a.score ?? 0);
}

type Choice = "承認" | "却下";

interface Failure {
  message: string;
  retry: () => void;
}

const KIND_BADGE: Record<PendingItem["kind"], string> = {
  proposal: "📋 施策",
  idea: "📝 記事",
};

// タップ領域 44px(min-h-11 / min-w-11 = 44px)+ AA コントラストを満たす操作ボタン
const TAP_TARGET = "min-h-11 min-w-11 px-4 rounded-md text-sm font-medium transition-colors";

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function approveUrl(token: string): string {
  return `/api/growth/approve?token=${encodeURIComponent(token)}`;
}

/** 承認待ち一覧を取得する。失敗時は表示用メッセージを持つ Error を投げる。 */
async function fetchPending(token: string): Promise<PendingItem[]> {
  const res = await fetch(approveUrl(token));
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(
      res.status === 401
        ? "合言葉が違います。LINE グループでお知らせした合言葉をご確認ください。"
        : json.error ?? "取得に失敗しました。"
    );
  }
  return json.items as PendingItem[];
}

function removeKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}

// #275: 一覧は高密度行。未処理=通常枠 / 処理済み=細い行 / 失敗=赤枠。
function rowClass(choice: Choice | undefined, failed: boolean): string {
  const base = "rounded-lg border transition-colors";
  if (failed) return `${base} border-red-400 bg-red-50 p-3`;
  if (choice) return `${base} border-gray-200 bg-gray-50 px-3 py-2`;
  return `${base} border-gray-200 bg-white p-3`;
}

function choiceButtonClass(activeClass: string): string {
  return `${TAP_TARGET} ${activeClass} disabled:opacity-50`;
}

// #107: 盤の列ヘッダ用スタイル。件数バッジ付きの淡色ヘッダ。
function columnHeaderClass(): string {
  return "flex items-center justify-between rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700";
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
  const [items, setItems] = useState<PendingItem[]>([]);
  // #108: 完了トースト/滞留検知用。itemsRef は poll で前回値を参照、nowTick は滞留経過の基準時刻、
  // firstSeenRef は記事が生成待ち/生成中に入った時刻。
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const itemsRef = useRef<PendingItem[]>([]);
  const firstSeenRef = useRef<Map<string, number>>(new Map());
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
  // 即時保存モデル: カードごとに保存済みの選択(承認/却下)と失敗状態を持つ。確定ボタンは無い。
  const [decided, setDecided] = useState<Record<string, Choice>>({});
  const [failures, setFailures] = useState<Record<string, Failure>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  // 認証無効時は初回マウントで自動取得するため、初期から読み込み中にしておく。
  const [busy, setBusy] = useState(authDisabled);
  // #240: 操作後に次の操作対象へフォーカスを移すための一時ターゲット(要素 id)。
  const [focusId, setFocusId] = useState<string | null>(null);
  // #275: master-detail。詳細パネルを開いている項目 id(クライアントのオーバーレイ)。
  const [openId, setOpenId] = useState<string | null>(null);
  // #90: トリアージ型UI。表示中のカテゴリタブ・未処理のみ表示・処理済みアコーディオンの開閉。
  // #53: 構成案セクション(index)ごとに溜めたコメント(複数可)。送信時に {見出し, comment} へ展開。
  const [draftComments, setDraftComments] = useState<Record<number, string[]>>({});
  // 現在コメント入力欄を開いているセクション index(null=どれも開いていない)。
  const [openCommentFor, setOpenCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  // 既存コメントを編集中のときの index(null=新規追加)。
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // #54: 手動編集中のセクション index と編集中の見出し/説明。
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editHeading, setEditHeading] = useState("");
  const [editDescription, setEditDescription] = useState("");
  // #61: 画像指示エディタ。フォームを開いているセクション index と入力値(スタイル/説明)、
  // 既存画像を編集中のときの index(null=新規追加)。
  const [imageFormFor, setImageFormFor] = useState<number | null>(null);
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);
  const [imageStyle, setImageStyle] = useState<ImageStyleKey>("mascot");
  const [imageDesc, setImageDesc] = useState("");
  const [reviseBusy, setReviseBusy] = useState(false);
  const [reviseError, setReviseError] = useState("");
  // #139 A: 記事タイトルの直接編集(構成案修正パネル内のインライン編集)。
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  // #139 B: タイトルへの AI 修正指示(構成案コメントとは別レーン)。
  const [titleRevisePrompt, setTitleRevisePrompt] = useState("");
  const passphraseRef = useRef<HTMLInputElement>(null);

  const processed = Object.keys(decided).length;

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(focusId);
    /* istanbul ignore else -- 対象ボタンは保存成功直後に必ず描画される */
    if (el) el.focus();
    setFocusId(null);
  }, [focusId]);

  // #42/#53/#54: パネルを開閉/切替したら、前の記事のコメント下書き・編集状態・エラーをクリアする。
  useEffect(() => {
    setDraftComments({});
    setOpenCommentFor(null);
    setCommentText("");
    setEditingIdx(null);
    setEditingSection(null);
    setEditHeading("");
    setEditDescription("");
    setImageFormFor(null);
    setEditingImageIdx(null);
    setImageDesc("");
    setReviseError("");
    setEditingTitle(false);
    setTitleInput("");
    setTitleRevisePrompt("");
    setEditingDraft(false);
    setConfirmDiscard(false);
    setDraftSaveError("");
    setDraftSaving(false);
    setEditedHtml("");
    setDraftOriginalHtml("");
  }, [openId]);

  // #43: 承認待ち一覧を取り直す(修正ステータス/修正案の最新化)。失敗は明示する。
  const refreshItems = useCallback(async (): Promise<void> => {
    try {
      setItems(await fetchPending(token));
    } catch (error) {
      setReviseError(toMessage(error, "最新の取得に失敗しました。"));
    }
  }, [token]);

  // #108: poll で前回 items を参照できるよう itemsRef を最新化する。
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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
  const pollBoard = useCallback(async (): Promise<void> => {
    let next: PendingItem[];
    try {
      next = await fetchPending(token);
    } catch {
      return; // 失敗は次の poll で回復(沈黙させるが盤は前回値を維持)。
    }
    const doneIds = newlyDraftedIds(itemsRef.current, next);
    if (doneIds.length > 0) {
      const done = new Set(doneIds);
      setToasts((prev) => [
        ...prev,
        ...next
          .filter((item) => done.has(item.id))
          .map((item) => ({
            id: `done-${item.id}`,
            message: `「${item.title}」の下書きが完成しました`,
          })),
      ]);
    }
    setItems(next);
    setNowTick(Date.now());
  }, [token]);

  // 生成待ち/生成中がある間だけポーリングする(完了検知＋滞留経過の更新)。
  const hasInFlight = items.some((item) => isInFlight(item.stage));
  useEffect(() => {
    if (!hasInFlight) return;
    const timer = setInterval(() => {
      void pollBoard();
    }, REVISE_POLL_MS);
    return () => clearInterval(timer);
  }, [hasInFlight, pollBoard]);

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
          `/api/growth/draft?pageId=${encodeURIComponent(pageId)}&token=${encodeURIComponent(token)}`
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
          `/api/growth/draft?pageId=${encodeURIComponent(pageId)}&token=${encodeURIComponent(token)}`
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

  // #77: 下書きの手動リッチ編集モード。
  const [editingDraft, setEditingDraft] = useState(false);
  const [editedHtml, setEditedHtml] = useState("");
  const [draftOriginalHtml, setDraftOriginalHtml] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // #110: 盤の下書きカードから直接編集を開く際、ドロワーの下書き取得完了を待って
  // ワークスペースを自動オープンするための保留 id(対象ページ)。
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  // #98: 編集中の本番ライブプレビュー。高頻度更新を間引くため editedHtml をデバウンスする。
  const livePreviewHtml = useDebouncedValue(editedHtml, LIVE_PREVIEW_DEBOUNCE_MS);
  // #129: 本番プレビューの表示デバイス(PC全幅 / モバイル幅)。
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("pc");

  function startEditDraft(html: string): void {
    setEditingDraft(true);
    setDraftOriginalHtml(html);
    setEditedHtml(html);
    setDraftSaveError("");
    setConfirmDiscard(false);
  }

  // #110: 盤カードの「編集」: ドロワーを開いて下書きを取得し、準備でき次第ワークスペースを開く。
  function openCardEditor(id: string): void {
    setOpenId(id);
    setPendingEditId(id);
  }

  // #110: 盤カードから編集を開いた時、下書き取得が完了したらワークスペースを自動オープンする。
  // ドロワーを別の対象/閉じる に切り替えたら保留を破棄する。
  useEffect(() => {
    if (!pendingEditId) return;
    if (pendingEditId !== openId) {
      setPendingEditId(null);
      return;
    }
    if (draftState.status === "ready") {
      const html = draftState.draft.bodyHtml;
      setEditingDraft(true);
      setDraftOriginalHtml(html);
      setEditedHtml(html);
      setDraftSaveError("");
      setConfirmDiscard(false);
      setPendingEditId(null);
    }
  }, [pendingEditId, openId, draftState]);

  function exitEditDraft(): void {
    setEditingDraft(false);
    setConfirmDiscard(false);
    setDraftSaveError("");
  }

  // 未保存の変更があれば破棄確認を挟む。
  function cancelEditDraft(): void {
    if (editedHtml !== draftOriginalHtml) {
      setConfirmDiscard(true);
      return;
    }
    exitEditDraft();
  }

  async function saveDraft(item: PendingItem): Promise<void> {
    setDraftSaving(true);
    setDraftSaveError("");
    try {
      const res = await fetch(
        `/api/growth/draft/edit?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildDraftEditPayload(item.id, editedHtml)),
        }
      );
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "保存に失敗しました。");
      }
      setEditingDraft(false);
      setConfirmDiscard(false);
      await loadDraft(item.id); // 保存後にプレビューを最新化
    } catch (error) {
      setDraftSaveError(toMessage(error, "保存に失敗しました。"));
    } finally {
      setDraftSaving(false);
    }
  }

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
      setItems(await fetchPending(pass));
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
      setItems(await fetchPending(""));
    } catch (error) {
      setLoadError(toMessage(error, "取得に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!authDisabled) return;
    void loadPending();
  }, [authDisabled, loadPending]);

  /** ステータスを 1 件だけ更新する(承認/却下/承認待ち復帰の共通処理)。 */
  async function postStatus(id: string, decision: string): Promise<void> {
    const res = await fetch(approveUrl(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: [{ id, decision }] }),
    });
    const json = await readJsonObject(res);
    if (!res.ok || !json.success) {
      throw new Error(json.error ?? "保存に失敗しました。");
    }
  }

  async function decide(item: PendingItem, choice: Choice): Promise<void> {
    setSavingId(item.id);
    setFailures((prev) => removeKey(prev, item.id));
    try {
      await postStatus(item.id, choice);
      setDecided((prev) => ({ ...prev, [item.id]: choice }));
      setFocusId(`undo-${item.id}`);
    } catch (error) {
      const text = toMessage(error, "保存に失敗しました。");
      setFailures((prev) => ({
        ...prev,
        [item.id]: { message: text, retry: () => decide(item, choice) },
      }));
    } finally {
      setSavingId(null);
    }
  }

  // #167: 公開・クローズ(取り消しづらい外向き操作のため確認ダイアログを必ず挟む)。
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function publishArticle(id: string): Promise<void> {
    if (!window.confirm("この記事を本番公開します。よろしいですか？（公開後は一般に表示されます）")) {
      return;
    }
    setActionBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/growth/publish?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: id }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error(json.error ?? "公開に失敗しました。");
      await pollBoard();
    } catch (error) {
      setActionError(toMessage(error, "公開に失敗しました。"));
    } finally {
      setActionBusy(false);
    }
  }

  async function closeTask(id: string): Promise<void> {
    if (!window.confirm("このタスクをクローズして盤から非表示にします。よろしいですか？")) return;
    setActionBusy(true);
    setActionError("");
    try {
      await postStatus(id, "クローズ");
      await pollBoard();
    } catch (error) {
      setActionError(toMessage(error, "クローズに失敗しました。"));
    } finally {
      setActionBusy(false);
    }
  }

  // #255: 手動追加した施策(承認待ち)を一覧の先頭に差し込み、通常フローに乗せる。
  function addProposal(item: PendingItem): void {
    setItems((prev) => [item, ...prev]);
  }

  async function undo(item: PendingItem): Promise<void> {
    setSavingId(item.id);
    setFailures((prev) => removeKey(prev, item.id));
    try {
      await postStatus(item.id, pendingStatus(item.kind));
      setDecided((prev) => removeKey(prev, item.id));
      setFocusId(`approve-${item.id}`);
    } catch (error) {
      const text = toMessage(error, "取り消しに失敗しました。");
      setFailures((prev) => ({
        ...prev,
        [item.id]: { message: text, retry: () => undo(item) },
      }));
    } finally {
      setSavingId(null);
    }
  }

  // #275: 詳細パネルからの操作。実行して即座にパネルを閉じる(結果は一覧の行に反映)。
  function decideFromPanel(item: PendingItem, choice: Choice): void {
    void decide(item, choice);
    setOpenId(null);
  }

  function undoFromPanel(item: PendingItem): void {
    void undo(item);
    setOpenId(null);
  }

  // #53/#139 B: セクションに溜めたコメントを {見出し, comment} へ展開し、タイトル指示と一緒に送る。
  async function requestRevise(item: PendingItem): Promise<void> {
    const sections = outlineSections(item.outline);
    const comments = sections.flatMap((section, i) =>
      (draftComments[i] ?? []).map((comment) => ({ line: section.heading, comment }))
    );
    const titleInstruction = titleRevisePrompt.trim();
    // 構成案コメント0件かつタイトル指示なしのときは「修正を依頼」ボタンが無効なので到達しない。
    setReviseBusy(true);
    setReviseError("");
    try {
      const res = await fetch(`/api/growth/revise?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: item.id,
          comments,
          ...(titleInstruction ? { titleInstruction } : {}),
        }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(
          res.status === 409
            ? "この記事は修正処理中です。完了までお待ちください。"
            : json.error ?? "修正依頼に失敗しました。"
        );
      }
      // 楽観更新: 依頼中にして即ポーリング表示へ(以降は poll が提示を取りに行く)。
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, reviseStatus: "依頼中" } : it))
      );
      setDraftComments({});
      setTitleRevisePrompt("");
    } catch (error) {
      setReviseError(toMessage(error, "修正依頼に失敗しました。"));
    } finally {
      setReviseBusy(false);
    }
  }

  // #53: セクションごとのコメント追加/編集/削除(送信前の下書き操作)。
  function startAddComment(section: number): void {
    setOpenCommentFor(section);
    setEditingIdx(null);
    setCommentText("");
    setImageFormFor(null); // 画像フォームが開いていれば閉じる
  }

  function startEditComment(section: number, idx: number, text: string): void {
    setOpenCommentFor(section);
    setEditingIdx(idx);
    setCommentText(text);
    setImageFormFor(null);
  }

  function cancelComment(): void {
    setOpenCommentFor(null);
    setEditingIdx(null);
    setCommentText("");
  }

  function saveComment(section: number): void {
    const text = commentText.trim();
    if (!text) {
      cancelComment();
      return;
    }
    setDraftComments((prev) => {
      const list = [...(prev[section] ?? [])];
      if (editingIdx !== null) list[editingIdx] = text;
      else list.push(text);
      return { ...prev, [section]: list };
    });
    cancelComment();
  }

  function deleteComment(section: number, idx: number): void {
    setDraftComments((prev) => {
      /* istanbul ignore next -- @preserve 削除は描画済みコメントからのみ呼ばれ section は必ず存在 */
      const list = prev[section] ?? [];
      return { ...prev, [section]: list.filter((_, k) => k !== idx) };
    });
  }

  // #54: セクションの手動編集(見出し＋説明)→ 構成案を直接保存(AI不要)。
  function startEditSection(i: number, section: OutlineSection): void {
    setEditingSection(i);
    setEditHeading(section.heading);
    setEditDescription(section.description);
    setOpenCommentFor(null); // コメント入力中なら閉じる
    setImageFormFor(null);
  }

  function cancelEditSection(): void {
    setEditingSection(null);
    setEditHeading("");
    setEditDescription("");
  }

  // #54/#61/#139: /revise/edit へ直接上書き(AI不要)を送る共通処理。成否を返す。
  // payload は構成案(outline)・タイトル(title)のいずれか/両方。
  async function postReviseEdit(
    item: PendingItem,
    payload: { outline?: string; title?: string }
  ): Promise<boolean> {
    setReviseBusy(true);
    setReviseError("");
    try {
      const res = await fetch(`/api/growth/revise/edit?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: item.id, ...payload }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(
          res.status === 409
            ? "この記事はAI修正処理中です。完了後に編集してください。"
            : json.error ?? "保存に失敗しました。"
        );
      }
      await refreshItems();
      return true;
    } catch (error) {
      setReviseError(toMessage(error, "保存に失敗しました。"));
      return false;
    } finally {
      setReviseBusy(false);
    }
  }

  // #54/#61: 構成案を直接上書き保存する(手動編集・画像指示で共用)。成否を返す。
  async function persistOutline(
    item: PendingItem,
    nextSections: OutlineSection[]
  ): Promise<boolean> {
    return postReviseEdit(item, { outline: serializeOutlineSections(nextSections) });
  }

  // #139 A: 記事タイトルを直接上書き保存する(AI不要)。空は弾く。
  function startEditTitle(title: string): void {
    setEditingTitle(true);
    setTitleInput(title);
  }
  function cancelEditTitle(): void {
    setEditingTitle(false);
    setTitleInput("");
  }
  async function saveTitle(item: PendingItem): Promise<void> {
    const title = titleInput.trim();
    if (!title) {
      setReviseError("タイトルは空にできません。");
      return;
    }
    if (await postReviseEdit(item, { title })) cancelEditTitle();
  }

  async function saveSection(
    item: PendingItem,
    sections: OutlineSection[],
    i: number
  ): Promise<void> {
    const heading = editHeading.trim();
    if (!heading) {
      setReviseError("見出しは空にできません。");
      return;
    }
    // 既存の画像指示(images)は保持したまま見出し・説明だけ差し替える。
    const next = sections.map((s, k) =>
      k === i ? { ...s, heading, description: editDescription.trim() } : s
    );
    if (await persistOutline(item, next)) cancelEditSection();
  }

  // #61: 画像指示の追加/編集/削除。構成案を直接上書き(AI不要・/revise/edit に相乗り)。
  // 画像フォームを開くときは、コメント・手動編集フォームを閉じる(同時に複数フォームを開かない)。
  function closeOtherForms(): void {
    setOpenCommentFor(null);
    setEditingSection(null);
    setEditHeading("");
    setEditDescription("");
  }

  function startAddImage(i: number): void {
    setImageFormFor(i);
    setEditingImageIdx(null);
    setImageStyle("mascot");
    setImageDesc("");
    closeOtherForms();
  }

  function startEditImage(i: number, idx: number, image: OutlineImage): void {
    setImageFormFor(i);
    setEditingImageIdx(idx);
    setImageStyle(image.style);
    setImageDesc(image.description);
    closeOtherForms();
  }

  function cancelImage(): void {
    setImageFormFor(null);
    setEditingImageIdx(null);
    setImageDesc("");
  }

  async function saveImage(
    item: PendingItem,
    sections: OutlineSection[],
    i: number
  ): Promise<void> {
    const description = imageDesc.trim();
    if (!description) {
      setReviseError("画像の説明を入力してください。");
      return;
    }
    const currentImages = sections[i].images;
    const nextImages =
      editingImageIdx !== null
        ? currentImages.map((img, k) =>
            k === editingImageIdx ? { style: imageStyle, description } : img
          )
        : [...currentImages, { style: imageStyle, description }];
    const next = sections.map((s, k) => (k === i ? { ...s, images: nextImages } : s));
    if (await persistOutline(item, next)) cancelImage();
  }

  async function deleteImage(
    item: PendingItem,
    sections: OutlineSection[],
    i: number,
    idx: number
  ): Promise<void> {
    const nextImages = sections[i].images.filter((_, k) => k !== idx);
    const next = sections.map((s, k) => (k === i ? { ...s, images: nextImages } : s));
    await persistOutline(item, next);
  }

  // #43: 提示中の修正案を「反映」または「やり直し(破棄)」する。完了後に最新化する。
  async function applyRevise(item: PendingItem, action: "apply" | "discard"): Promise<void> {
    setReviseBusy(true);
    setReviseError("");
    try {
      const res = await fetch(`/api/growth/revise/apply?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: item.id, action }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "更新に失敗しました。");
      }
      await refreshItems();
    } catch (error) {
      setReviseError(toMessage(error, "更新に失敗しました。"));
    } finally {
      setReviseBusy(false);
    }
  }

  // 認証無効(一時措置): 自動取得の読み込み中・失敗をそれぞれ明示する(沈黙させない)。
  if (authDisabled && busy) {
    return (
      <main className="mx-auto max-w-md p-6 text-center" aria-busy="true">
        <p className="mt-10 text-sm text-gray-600">読み込み中…</p>
      </main>
    );
  }

  if (authDisabled && loadError) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold text-gray-900">承認ページ</h1>
        <p role="alert" className="mt-3 text-sm text-red-700">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => void loadPending()}
          className={`${TAP_TARGET} mt-4 w-full bg-blue-600 text-white hover:bg-blue-700`}
        >
          再読み込み
        </button>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold text-gray-900">承認ページ</h1>
        <p className="mt-2 text-sm text-gray-700">
          LINE で届いた合言葉を入力してください。
        </p>
        <form onSubmit={enter} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="passphrase" className="block text-sm font-medium text-gray-800">
              合言葉
            </label>
            <div className="flex gap-2">
              <input
                id="passphrase"
                ref={passphraseRef}
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? "passphrase-error" : undefined}
                className="min-h-11 w-full rounded-md border border-gray-300 px-3 text-base text-gray-900"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((prev) => !prev)}
                aria-label={showPassphrase ? "合言葉を隠す" : "合言葉を表示"}
                className={`${TAP_TARGET} shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
              >
                {showPassphrase ? "隠す" : "表示"}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className={`${TAP_TARGET} w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}
          >
            確認する
          </button>
        </form>
        {message ? (
          <p id="passphrase-error" role="alert" className="mt-3 text-sm text-red-700">
            {message}
          </p>
        ) : null}
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="mt-10 text-3xl">🎉</p>
        <h1 className="mt-2 text-lg font-bold text-gray-900">
          今週の承認待ちはありません
        </h1>
        <p className="mt-2 text-sm text-gray-600">お疲れさまでした。</p>
        <div className="mx-auto mt-6 max-w-md text-left">
          <AddProposalForm token={token} onAdded={addProposal} />
        </div>
      </main>
    );
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
    const isBusy = savingId === item.id;
    // #43: 修正依頼中/処理中/提示中は、古い構成案のまま承認させない(承認排他)。
    const lockedForRevise = isReviseBusy(item.reviseStatus);
    const failure = failures[item.id];
    const detailButton = (
      <button
        type="button"
        aria-label={`詳細: ${item.title}`}
        onClick={() => setOpenId(item.id)}
        className={`${TAP_TARGET} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
      >
        詳細
      </button>
    );
    // #107: 記事カードは段階インジケータ(提案→…→公開)とスコアバーを上部に出す。
    const isIdea = item.kind === "idea";
    const step = isIdea ? stageStepIndex(effectiveStage(item, choice)) : -1;
    // #119: 記事カードは段階で左ボーダーを色分け(列ヘッダの色と揃え、流れを視覚化)。
    const stageAccent = isIdea
      ? `border-l-4 ${stageTheme(effectiveStage(item, choice)).accent}`
      : "";
    // #108: 生成待ち/生成中が閾値を超えて滞留しているか(自宅PC停止の疑い)。
    const stuck =
      isIdea &&
      isInFlight(item.stage) &&
      isStuck(nowTick - (firstSeenRef.current.get(item.id) ?? nowTick), STUCK_THRESHOLD_MS);
    const ideaHeader = isIdea ? (
      <div className="mb-2">
        <div aria-label="進捗" className="flex items-center gap-1">
          {STAGE_STEPS.map((label, i) => (
            <span
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={`h-1.5 w-1.5 rounded-full ${i <= step ? "bg-blue-600" : "bg-gray-300"}`}
            />
          ))}
          <span className="ml-1 text-xs text-gray-500">{STAGE_STEPS[step]}</span>
        </div>
        <div className="mt-1 h-1 w-full rounded-full bg-gray-200">
          <div
            className="h-1 rounded-full bg-blue-500"
            style={{ width: `${scoreBarPct(item.score ?? 0, ideaMaxScore)}%` }}
          />
        </div>
      </div>
    ) : null;
    return (
      <li
        key={item.id}
        className={`${rowClass(choice, Boolean(failure))} ${stageAccent} ${item.id === focusedId ? "ring-2 ring-blue-500" : ""}`}
        data-decision={choice ?? ""}
      >
        {isBulkActionable(item) ? (
          <label className="mb-1 flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              aria-label={`一括選択: ${item.title}`}
              checked={selected.has(item.id)}
              onChange={() => toggleSelect(item.id)}
            />
            選択
          </label>
        ) : null}
        {ideaHeader}
        {/* #119 follow-up: タイトルを最上段・全幅・2行クランプで主役化(列幅が狭い盤でも読める)。
            #137: タイトル自体を詳細を開くボタンにし、スマホでも大きなタップ領域を確保する。
            アクセシブル名はタイトル文字列(小さい「詳細: …」ボタンとは別名)。 */}
        <button
          type="button"
          onClick={() => setOpenId(item.id)}
          className={`w-full text-left line-clamp-2 text-[15px] font-semibold leading-snug ${
            choice ? "text-gray-600" : "text-gray-900"
          }`}
        >
          {item.title}
        </button>
        {choice ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-gray-700">
              ✓ <span className="font-semibold">{choice}しました</span>
            </span>
            <div className="ml-auto flex gap-2">
              {detailButton}
              <button
                type="button"
                id={`undo-${item.id}`}
                aria-label={`取り消す: ${item.title}`}
                onClick={() => undo(item)}
                disabled={isBusy}
                className={choiceButtonClass(
                  "shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                取り消す
              </button>
            </div>
          </div>
        ) : item.isDraftReady ? (
          // #87/#110: 下書き作成済みは承認/却下を出さず、詳細(プレビュー)と編集(全画面)へ。
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 rounded bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
              📝 下書き
            </span>
            <div className="ml-auto flex gap-2">
              {detailButton}
              <button
                type="button"
                id={`card-edit-${item.id}`}
                aria-label={`編集: ${item.title}`}
                onClick={() => openCardEditor(item.id)}
                className={`${TAP_TARGET} border border-blue-600 bg-blue-600 text-white`}
              >
                編集
              </button>
            </div>
          </div>
        ) : isAwaitingDownstream(item.stage) ? (
          // #107/#108: 承認済みで下流(自宅PC生成)待ち。承認/却下は出さず状態表示＋詳細。
          // 生成中は脈動＋進捗ステップで「執筆中」を可視化、滞留時は優しい警告を出す。
          <div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`shrink-0 rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white ${
                  item.stage === "generating" ? "motion-safe:animate-pulse" : ""
                }`}
              >
                {item.kind === "proposal"
                  ? "承認済み"
                  : item.stage === "generating"
                    ? "生成中"
                    : "生成待ち"}
              </span>
              <div className="ml-auto">{detailButton}</div>
            </div>
            {item.stage === "generating" ? (
              <div className="mt-2 text-xs text-gray-500">
                <span className="motion-safe:animate-pulse">🖊 自宅PCで執筆中…</span>
                <span className="ml-2">{GENERATING_STEPS.join(" → ")}</span>
              </div>
            ) : null}
            {stuck ? (
              <p role="status" className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                時間がかかっています。自宅PCの巡回が動いているか確認してください。
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className="shrink-0 rounded bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
                {KIND_BADGE[item.kind]}
              </span>
            </div>
            <div
              role="group"
              aria-label={`承認または却下: ${item.title}`}
              className="mt-2 flex flex-col gap-2 sm:flex-row"
            >
              <button
                type="button"
                id={`approve-${item.id}`}
                aria-label={`承認: ${item.title}`}
                onClick={() => decide(item, "承認")}
                disabled={isBusy || lockedForRevise}
                className={choiceButtonClass("flex-1 border border-blue-600 bg-blue-600 text-white")}
              >
                承認
              </button>
              <button
                type="button"
                aria-label={`却下: ${item.title}`}
                onClick={() => decide(item, "却下")}
                disabled={isBusy || lockedForRevise}
                className={choiceButtonClass("flex-1 border border-gray-700 bg-gray-700 text-white")}
              >
                却下
              </button>
              {detailButton}
            </div>
          </>
        )}
        {failure ? (
          <div
            role="alert"
            className="mt-2 flex items-center justify-between gap-2 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
          >
            <span>{failure.message}</span>
            <button
              type="button"
              aria-label={`再試行: ${item.title}`}
              onClick={failure.retry}
              disabled={isBusy}
              className={choiceButtonClass("shrink-0 border border-red-600 bg-red-600 text-white")}
            >
              再試行
            </button>
          </div>
        ) : null}
      </li>
    );
  }

  // #54: セクションの手動編集フォーム(見出し＋説明 → この行を保存)。
  function renderSectionEditor(item: PendingItem, sections: OutlineSection[], i: number) {
    const section = sections[i];
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <input
          type="text"
          aria-label={`見出しを編集: ${section.heading}`}
          value={editHeading}
          onChange={(event) => setEditHeading(event.target.value)}
          className="w-full rounded-md border border-gray-300 p-2 text-sm font-medium text-gray-900"
        />
        <textarea
          aria-label={`説明を編集: ${section.heading}`}
          value={editDescription}
          onChange={(event) => setEditDescription(event.target.value)}
          placeholder="このセクションの内容(1行)"
          className="mt-1 h-14 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-700"
        />
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelEditSection}
            className={choiceButtonClass(
              "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => saveSection(item, sections, i)}
            disabled={reviseBusy}
            className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
          >
            この行を保存
          </button>
        </div>
      </motion.div>
    );
  }

  // #61: 1セクション分の画像指示(チップ＋スタイル選択フォーム)を描画。
  function renderSectionImages(item: PendingItem, sections: OutlineSection[], i: number) {
    const section = sections[i];
    const images = section.images;
    const open = imageFormFor === i;
    return (
      <div className="mt-2 border-t border-gray-100 pt-2">
        {images.length > 0 ? (
          <ul className="space-y-1">
            {images.map((image, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1"
              >
                <span className="shrink-0 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                  {STYLE_LABEL[image.style]}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                  {image.description}
                </span>
                <button
                  type="button"
                  aria-label={`画像を編集: ${section.heading} ${idx + 1}`}
                  onClick={() => startEditImage(i, idx, image)}
                  disabled={reviseBusy}
                  className="shrink-0 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40"
                >
                  編集
                </button>
                <button
                  type="button"
                  aria-label={`画像を削除: ${section.heading} ${idx + 1}`}
                  onClick={() => deleteImage(item, sections, i, idx)}
                  disabled={reviseBusy}
                  className="shrink-0 text-xs text-gray-500 hover:text-red-700 disabled:opacity-40"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 overflow-hidden"
          >
            <label
              htmlFor={`image-style-${i}`}
              className="block text-xs font-medium text-gray-600"
            >
              スタイル
            </label>
            <select
              id={`image-style-${i}`}
              value={imageStyle}
              onChange={(event) => setImageStyle(event.target.value as ImageStyleKey)}
              className="mt-0.5 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
            >
              {IMAGE_STYLES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <textarea
              aria-label={`画像の説明: ${section.heading}`}
              value={imageDesc}
              onChange={(event) => setImageDesc(event.target.value)}
              placeholder="何を描くか（例: 宇宙人がパドルを構える）"
              className="mt-1 h-14 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-400">
              alt・キャプションは執筆AIが補完します。図解は「イメージ図」として下書きに入り、公開前に確認できます。
            </p>
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelImage}
                className={choiceButtonClass(
                  "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => saveImage(item, sections, i)}
                disabled={reviseBusy}
                className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
              >
                {editingImageIdx !== null ? "更新" : "追加"}
              </button>
            </div>
          </motion.div>
        ) : (
          <button
            type="button"
            aria-label={`画像を追加: ${section.heading}`}
            onClick={() => startAddImage(i)}
            disabled={reviseBusy || images.length >= MAX_SECTION_IMAGES}
            className="text-xs text-indigo-700 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
          >
            ＋画像（{images.length} / {MAX_SECTION_IMAGES}）
          </button>
        )}
      </div>
    );
  }

  // #53: 1セクション分の本文・件数・既存コメント(スレッド)・入力欄/＋コメント/編集を描画。
  function renderSection(item: PendingItem, sections: OutlineSection[], i: number) {
    const section = sections[i];
    const comments = draftComments[i] ?? [];
    const open = openCommentFor === i;
    const editing = editingSection === i;
    return (
      <li key={i} className="group rounded-md border border-gray-200 p-2 hover:border-gray-300">
        {editing ? (
          renderSectionEditor(item, sections, i)
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">{section.heading}</p>
              {comments.length > 0 ? (
                <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  コメント{comments.length}
                </span>
              ) : null}
            </div>
            {section.description ? (
              <p className="mt-0.5 text-xs text-gray-500">{section.description}</p>
            ) : null}

            {comments.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {comments.map((comment, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 border-l-2 border-blue-200 pl-2 text-sm text-gray-700"
                  >
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">{comment}</span>
                    <button
                      type="button"
                      aria-label={`コメントを編集: ${section.heading} ${idx + 1}`}
                      onClick={() => startEditComment(i, idx, comment)}
                      className="shrink-0 text-xs text-gray-500 hover:text-gray-800"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      aria-label={`コメントを削除: ${section.heading} ${idx + 1}`}
                      onClick={() => deleteComment(i, idx)}
                      className="shrink-0 text-xs text-gray-500 hover:text-red-700"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {open ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-2 overflow-hidden"
              >
                <textarea
                  aria-label={`コメント入力: ${section.heading}`}
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="この見出しへの修正指示を書く…"
                  className="h-16 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
                />
                <div className="mt-1 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelComment}
                    className={choiceButtonClass(
                      "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => saveComment(i)}
                    className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
                  >
                    {editingIdx !== null ? "更新" : "コメントを追加"}
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="mt-1 flex gap-3">
                <button
                  type="button"
                  aria-label={`コメントを追加: ${section.heading}`}
                  onClick={() => startAddComment(i)}
                  disabled={reviseBusy}
                  className="text-xs text-blue-700 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
                >
                  ＋ コメント
                </button>
                <button
                  type="button"
                  aria-label={`セクションを編集: ${section.heading}`}
                  onClick={() => startEditSection(i, section)}
                  disabled={reviseBusy}
                  className="text-xs text-gray-600 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
                >
                  編集
                </button>
              </div>
            )}

            {renderSectionImages(item, sections, i)}
          </>
        )}
      </li>
    );
  }

  // #42/#43/#52/#53/#54/#139 B: 構成案の修正セクション(記事のみ)。コメント＋タイトル指示＋手動編集。
  function renderReviseCommentForm(item: PendingItem, sections: OutlineSection[]) {
    const total = Object.values(draftComments).reduce((n, list) => n + list.length, 0);
    const hasTitlePrompt = titleRevisePrompt.trim() !== "";
    return (
      <MotionConfig reducedMotion="user">
        <p className="mt-1 text-xs text-gray-500">
          見出しの「＋ コメント」でAIに修正を依頼、「編集」で自分で直せます。
        </p>
        {/* #139 B: タイトルへの AI 修正指示(専用枠)。書いたときだけタイトルも直す。 */}
        <div className="mt-2">
          <label
            htmlFor={`title-revise-${item.id}`}
            className="block text-xs font-medium text-gray-500"
          >
            タイトルについて（AIに修正を依頼）
          </label>
          <textarea
            id={`title-revise-${item.id}`}
            value={titleRevisePrompt}
            onChange={(event) => setTitleRevisePrompt(event.target.value)}
            disabled={reviseBusy}
            rows={2}
            placeholder="例: 市川という地名を入れて、もっと具体的に"
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
          />
        </div>
        <ul className="mt-2 space-y-2">
          {sections.map((_, i) => renderSection(item, sections, i))}
        </ul>
        <button
          type="button"
          onClick={() => requestRevise(item)}
          disabled={reviseBusy || (total === 0 && !hasTitlePrompt)}
          className={choiceButtonClass("mt-3 w-full border border-blue-600 bg-blue-600 text-white")}
        >
          修正を依頼{total > 0 ? `（コメント${total}件）` : ""}
        </button>
      </MotionConfig>
    );
  }

  function renderRevisePending(item: PendingItem) {
    return (
      <div>
        <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          修正を依頼しました。PCが処理して最大5分で修正案を提示します。
        </p>
        <StaleNotice requestedAtMs={item.reviseRequestedAtMs ?? null} busy />
        <button
          type="button"
          onClick={() => void refreshItems()}
          disabled={reviseBusy}
          className={choiceButtonClass(
            "mt-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          )}
        >
          最新を確認
        </button>
      </div>
    );
  }

  function renderReviseReady(item: PendingItem) {
    // #139 B: 構成案・タイトルのうち提案がある方だけ新旧比較を出す(部分提案を許容)。
    const hasOutlineProposal = (item.reviseProposal ?? "") !== "";
    const hasTitleProposal = (item.reviseTitleProposal ?? "") !== "";
    return (
      <div>
        <p className="mt-2 text-xs text-gray-500">
          修正案が届きました。元と見比べて反映してください。
        </p>
        {hasTitleProposal ? (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-bold text-gray-500">元のタイトル</h4>
              <p className="mt-1 rounded-md bg-gray-50 p-2 text-xs text-gray-700">{item.title}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-blue-700">タイトル案</h4>
              <p className="mt-1 rounded-md bg-blue-50 p-2 text-xs font-medium text-gray-900">
                {item.reviseTitleProposal}
              </p>
            </div>
          </div>
        ) : null}
        {hasOutlineProposal ? (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-bold text-gray-500">元の構成案</h4>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                {item.outline}
              </pre>
            </div>
            <div>
              <h4 className="text-xs font-bold text-blue-700">修正案</h4>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-blue-50 p-2 text-xs text-gray-900">
                {item.reviseProposal}
              </pre>
            </div>
          </div>
        ) : null}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => applyRevise(item, "apply")}
            disabled={reviseBusy}
            className={choiceButtonClass("flex-1 border border-blue-600 bg-blue-600 text-white")}
          >
            反映する
          </button>
          <button
            type="button"
            onClick={() => applyRevise(item, "discard")}
            disabled={reviseBusy}
            className={choiceButtonClass(
              "flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            やり直し
          </button>
        </div>
      </div>
    );
  }

  function renderReviseFailed(item: PendingItem) {
    return (
      <div>
        <p role="alert" className="mt-2 text-sm text-red-700">
          修正に失敗しました: {item.reviseProposal || "理由不明"}
        </p>
        <button
          type="button"
          onClick={() => applyRevise(item, "discard")}
          disabled={reviseBusy}
          className={choiceButtonClass("mt-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
        >
          やり直し
        </button>
      </div>
    );
  }

  // #127: クリップボードへコピー(本文など)。非対応環境や権限拒否で落ちないよう握り込む。
  function copyText(text: string): void {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  // #75: 生成済み下書きを実プレビュー(NewsBodyRenderer)で表示する。記事のみ。
  function renderDraftPreview(item: PendingItem) {
    return (
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
              onClick={() => void loadDraft(item.id)}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2"
          >
            {/* #141: アイキャッチ(あれば)をプレビュー上部に表示。microCMS Media は next.config 許可済み。 */}
            {draftState.draft.eyecatch ? (
              <Image
                src={draftState.draft.eyecatch}
                alt={`アイキャッチ: ${draftState.draft.title}`}
                width={800}
                height={420}
                className="mb-1 h-auto w-full rounded-md border border-gray-200"
              />
            ) : null}
            {/* #143: アイキャッチをメディア選択/アップロードで差し替え。差し替え後は下書きを再取得。 */}
            <EyecatchPicker
              pageId={item.id}
              token={token}
              onReplaced={() => void loadDraft(item.id)}
              regenStatus={draftState.draft.eyecatchRegen?.status}
              regenRequestedAtMs={draftState.draft.eyecatchRegen?.requestedAtMs ?? null}
            />
            {/* #145: 本文画像の差し替え(画像があるときだけ表示)。保存後は下書きを再取得。 */}
            <BodyImagePicker
              pageId={item.id}
              token={token}
              bodyHtml={draftState.draft.bodyHtml}
              onSaved={() => void loadDraft(item.id)}
              regenStatus={draftState.draft.bodyRegen?.status}
              regenTargetSrc={draftState.draft.bodyRegen?.targetSrc}
              regenRequestedAtMs={draftState.draft.bodyRegen?.requestedAtMs ?? null}
            />
            {/* #146: スタイリング・アドバイザー(read-only)。依頼/閉じる後に下書きを再取得。 */}
            <AdviceCard
              pageId={item.id}
              token={token}
              advice={draftState.draft.advice}
              adviceApply={draftState.draft.adviceApply}
              bodyHtml={draftState.draft.bodyHtml}
              onChanged={() => void loadDraft(item.id)}
            />
            {/* #147: 装飾アシスタント。提案を採用→反映(draft/edit)後に下書きを再取得。 */}
            <DecorationAssistant
              pageId={item.id}
              token={token}
              bodyHtml={draftState.draft.bodyHtml}
              decorate={draftState.draft.decorate}
              onChanged={() => void loadDraft(item.id)}
            />
            {/* #182: 本文インラインコメント(1文＝1行)→AIに指摘依頼。依頼/片付け後に下書きを再取得。 */}
            <InlineCommentReview
              pageId={item.id}
              token={token}
              bodyHtml={draftState.draft.bodyHtml}
              bodyComment={draftState.draft.bodyComment}
              onChanged={() => void loadDraft(item.id)}
            />
            {/* #167: 公開・クローズ。取り消しづらい外向き操作のため確認ダイアログを挟む。 */}
            <div role="group" aria-label="公開・クローズ" className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap gap-2">
                {item.stage === "drafted" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void publishArticle(item.id)}
                    className="rounded-md border border-green-700 bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    公開する
                  </button>
                ) : null}
                {item.stage === "published" ? (
                  <span className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-bold text-green-800">公開済み</span>
                ) : null}
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void closeTask(item.id)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  クローズ（盤から非表示）
                </button>
              </div>
              {actionError ? (
                <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
                  {actionError}
                </p>
              ) : null}
            </div>
            {/* #129: PC/モバイルで表示幅を切替(読者の大半はスマホ)。 */}
            <div role="group" aria-label="プレビュー幅" className="mb-2 inline-flex rounded-md border border-gray-300 p-0.5 text-xs">
              {PREVIEW_DEVICES.map((device) => {
                const selected = previewDevice === device;
                return (
                  <button
                    key={device}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPreviewDevice(device)}
                    className={`rounded px-3 py-1 font-medium transition-colors ${
                      selected ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {previewDeviceLabel(device)}
                  </button>
                );
              })}
            </div>
            {/* #124: ブラウザ風 chrome の額装で「本番イメージ」感を出す。#129: 幅をデバイスで切替。 */}
            <div className={`overflow-hidden rounded-md border border-gray-800 ${previewWidthClass(previewDevice)}`}>
              <div className="flex items-center gap-1.5 bg-gray-900 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-600" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-gray-600" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-gray-600" aria-hidden="true" />
                <span className="ml-2 truncate text-[10px] text-gray-400">
                  thepicklebang.com / news
                </span>
              </div>
              <DraftPreviewFrame
                title="本番プレビュー"
                html={draftState.draft.bodyHtml || draftState.draft.body}
                className={PREVIEW_FRAME_CLASS}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                aria-label="下書きを編集"
                onClick={() => startEditDraft(draftState.draft.bodyHtml)}
                className={choiceButtonClass(
                  "border border-blue-600 bg-blue-600 text-white"
                )}
              >
                編集
              </button>
              {/* #127: 本文(プレーン)をクリップボードへコピー。 */}
              <button
                type="button"
                aria-label="本文をコピー"
                onClick={() => copyText(draftState.draft.body)}
                className={choiceButtonClass(
                  "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                コピー
              </button>
            </div>
          </motion.div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">まだ下書きは生成されていません。</p>
        )}
      </section>
    );
  }

  function renderReviseSection(item: PendingItem) {
    const sections = outlineSections(item.outline);
    const phase = revisePhase(item.reviseStatus);
    if (phase === "idle" && sections.length === 0) return null;
    return (
      <section aria-label="構成案の修正" className={`mt-4 ${SECTION_CARD}`}>
        <h3 className={SECTION_HEAD}>構成案の修正</h3>
        {/* #139 A: 記事タイトルの直接編集(AI不要)。 */}
        <div className="mb-3">
          {editingTitle ? (
            <div>
              <label
                htmlFor={`title-edit-${item.id}`}
                className="block text-xs font-medium text-gray-500"
              >
                記事タイトル
              </label>
              <input
                id={`title-edit-${item.id}`}
                type="text"
                aria-label="タイトルを編集"
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm font-medium text-gray-900"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  aria-label="タイトル編集をキャンセル"
                  onClick={cancelEditTitle}
                  className={choiceButtonClass(
                    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  )}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  aria-label="タイトルを保存"
                  onClick={() => saveTitle(item)}
                  disabled={reviseBusy}
                  className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">タイトル</span>
              <span className="flex-1 text-sm font-medium text-gray-900">{item.title}</span>
              <button
                type="button"
                aria-label={`タイトルを編集: ${item.title}`}
                onClick={() => startEditTitle(item.title)}
                className={choiceButtonClass(
                  "shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                編集
              </button>
            </div>
          )}
        </div>
        {phase === "pending"
          ? renderRevisePending(item)
          : phase === "ready"
            ? renderReviseReady(item)
            : phase === "failed"
              ? renderReviseFailed(item)
              : renderReviseCommentForm(item, sections)}
        {reviseError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {reviseError}
          </p>
        ) : null}
      </section>
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
        onSave={() => saveDraft(openItem)}
        onCancel={cancelEditDraft}
        saving={draftSaving}
        saveError={draftSaveError}
        confirmDiscard={confirmDiscard}
        onConfirmDiscard={exitEditDraft}
        onCancelDiscard={() => setConfirmDiscard(false)}
      />
    );
  }

  // #127: 記事=全画面の中央モーダル(レビュー・ワークスペース) / 施策=コンパクトな右ドロワー。
  function renderPanel(item: PendingItem) {
    const choice = decided[item.id];
    const isBusy = savingId === item.id;
    // #43: 修正中(依頼中/処理中/提示中)は承認/却下を無効化(古い構成案での承認を防ぐ)。
    const lockedForRevise = isReviseBusy(item.reviseStatus);
    const isIdea = item.kind === "idea";

    // 主操作(承認/却下/承認待ちに戻す)。下書き作成済みは出さない。コマンドバー/ドロワー共用。
    const decisionActions = item.isDraftReady ? null : choice ? (
      <button
        type="button"
        onClick={() => undoFromPanel(item)}
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
          onClick={() => decideFromPanel(item, "承認")}
          disabled={isBusy || lockedForRevise}
          className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
        >
          承認
        </button>
        <button
          type="button"
          onClick={() => decideFromPanel(item, "却下")}
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
          if (nextReviewableId) setOpenId(nextReviewableId);
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
        onClose={() => setOpenId(null)}
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

    if (isIdea) {
      // 全画面・中央フローティングモーダルのレビュー・ワークスペース。
      // 上=コマンドバー(固定) / 下=3ゾーン(左:インサイト / 中央:プレビュー追従 / 右:構成案)。
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-[2.5vw]">
          <button
            type="button"
            aria-label="オーバーレイを閉じる"
            onClick={() => setOpenId(null)}
            className="absolute inset-0 bg-black/50"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`詳細: ${item.title}`}
            className="relative flex h-[94vh] w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 pb-2">{header}</div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="lg:flex lg:items-start lg:gap-6">
                <div className="lg:w-[20rem] lg:shrink-0">
                  {insight}
                  {/* #128: 下書きが取得できたら公開前チェックリストを出す。 */}
                  {draftState.status === "ready" ? (
                    <div className="mt-4">
                      <DraftChecklist
                        checks={draftQuality({
                          bodyHtml: draftState.draft.bodyHtml,
                          body: draftState.draft.body,
                          title: item.title,
                        })}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="lg:sticky lg:top-0 lg:min-w-0 lg:flex-1">
                  {renderDraftPreview(item)}
                </div>
                <div className="lg:w-[24rem] lg:shrink-0">{renderReviseSection(item)}</div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 施策: コンパクトな右ドロワー(プレビュー/構成案は無い)。
    return (
      <div className="fixed inset-0 z-50 flex">
        <button
          type="button"
          aria-label="オーバーレイを閉じる"
          onClick={() => setOpenId(null)}
          className="flex-1 bg-black/40"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`詳細: ${item.title}`}
          className="ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-4 shadow-xl sm:w-[28rem]"
        >
          {header}
          <div className="mt-3">
            {insight}
            {/* 施策は決定可能(下書き作成済みにならない)ため常に主操作を出す。 */}
            <div className="mt-4 flex gap-2">{decisionActions}</div>
          </div>
        </div>
      </div>
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
      {/* #108: 下書き完成トースト(LINE通知と二重化)。閉じるまで残す。 */}
      {toasts.length > 0 ? (
        <div aria-label="お知らせ" className="mt-2 space-y-1">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800"
            >
              <span className="flex-1">🎉 {toast.message}</span>
              <button
                type="button"
                aria-label={`通知を閉じる: ${toast.message}`}
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 rounded border border-green-300 bg-white px-2 py-0.5 text-xs text-green-700"
              >
                閉じる
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
          <ArticlesView
            columns={articleColumns}
            renderItem={renderItem}
            densityClass={densityClass}
          />
        )}
      </div>
      {openItem ? renderPanel(openItem) : null}
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
