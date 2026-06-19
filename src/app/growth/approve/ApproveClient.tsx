"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import { pendingStatus } from "@/lib/growth/approve";

import { AddProposalForm } from "./AddProposalForm";
import { revisePhase } from "./revisePhase";

// 提示待ちのあいだ修正ステータスを再取得する間隔(ミリ秒)。
const REVISE_POLL_MS = 5000;

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
  reviseInstructions?: string;
}

// 修正処理中(再依頼不可・承認排他の対象)の状態。
const REVISE_BUSY_STATUSES = ["依頼中", "処理中", "提示中"];

function isReviseBusy(status: string | undefined): boolean {
  return REVISE_BUSY_STATUSES.includes(status ?? "なし");
}

/** 構成案を行(見出し)単位に分割する。空行は除く。 */
function outlineLines(outline: string | undefined): string[] {
  return (outline ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(
      res.status === 401
        ? "合言葉が違います。LINE グループでお知らせした合言葉をご確認ください。"
        : json.error ?? "取得に失敗しました。"
    );
  }
  return json.items;
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
  // #42/#43: 構成案の行コメント(開いているパネルの 行index→コメント文)・修正操作の状態。
  // 重複見出し行でも衝突しないよう行テキストではなく index をキーにする。
  const [reviseComments, setReviseComments] = useState<Record<number, string>>({});
  const [reviseBusy, setReviseBusy] = useState(false);
  const [reviseError, setReviseError] = useState("");
  const passphraseRef = useRef<HTMLInputElement>(null);

  const processed = Object.keys(decided).length;

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(focusId);
    /* istanbul ignore else -- 対象ボタンは保存成功直後に必ず描画される */
    if (el) el.focus();
    setFocusId(null);
  }, [focusId]);

  // #42: パネルを開閉/切替したら、前の記事の行コメント・エラーをクリアする。
  useEffect(() => {
    setReviseComments({});
    setReviseError("");
  }, [openId]);

  // #43: 承認待ち一覧を取り直す(修正ステータス/修正案の最新化)。失敗は明示する。
  const refreshItems = useCallback(async (): Promise<void> => {
    try {
      setItems(await fetchPending(token));
    } catch (error) {
      setReviseError(toMessage(error, "最新の取得に失敗しました。"));
    }
  }, [token]);

  // #43: 開いている記事が提示待ち(依頼中/処理中)の間だけ、一定間隔で再取得する。
  useEffect(() => {
    const item = openId ? items.find((it) => it.id === openId) : undefined;
    if (!item || revisePhase(item.reviseStatus) !== "pending") return;
    const timer = setInterval(() => {
      void refreshItems();
    }, REVISE_POLL_MS);
    return () => clearInterval(timer);
  }, [openId, items, refreshItems]);

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
    const json = await res.json();
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

  // #42: 構成案の行コメントを「修正指示」として送る(プル型・常時稼働PCが拾う)。
  async function requestRevise(item: PendingItem): Promise<void> {
    const comments = outlineLines(item.outline)
      .map((line, i) => ({ line, comment: (reviseComments[i] ?? "").trim() }))
      .filter((c) => c.comment.length > 0);
    if (comments.length === 0) {
      setReviseError("コメントを1件以上入力してください。");
      return;
    }
    setReviseBusy(true);
    setReviseError("");
    try {
      const res = await fetch("/api/growth/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: item.id, comments }),
      });
      const json = await res.json();
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
      setReviseComments({});
    } catch (error) {
      setReviseError(toMessage(error, "修正依頼に失敗しました。"));
    } finally {
      setReviseBusy(false);
    }
  }

  // #43: 提示中の修正案を「反映」または「やり直し(破棄)」する。完了後に最新化する。
  async function applyRevise(item: PendingItem, action: "apply" | "discard"): Promise<void> {
    setReviseBusy(true);
    setReviseError("");
    try {
      const res = await fetch("/api/growth/revise/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: item.id, action }),
      });
      const json = await res.json();
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
    return (
      <li key={item.id} className={rowClass(choice, Boolean(failure))} data-decision={choice ?? ""}>
        {choice ? (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-gray-700">
              ✓ <span className="font-semibold">{choice}しました</span>
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{item.title}</span>
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
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
                {KIND_BADGE[item.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">
                {item.title}
              </span>
            </div>
            <div role="group" aria-label={`承認または却下: ${item.title}`} className="mt-2 flex gap-2">
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

  // #42/#43: 構成案の修正セクション(記事のみ)。修正ステータスのフェーズで描画を分ける。
  function renderReviseCommentForm(item: PendingItem, lines: string[]) {
    return (
      <>
        <ul className="mt-2 space-y-3">
          {lines.map((line, i) => (
            <li key={i}>
              <p className="text-sm text-gray-800">{line}</p>
              <textarea
                aria-label={`コメント: ${line}`}
                value={reviseComments[i] ?? ""}
                onChange={(event) =>
                  setReviseComments((prev) => ({ ...prev, [i]: event.target.value }))
                }
                placeholder="この見出しへの修正指示（任意）"
                className="mt-1 h-14 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => requestRevise(item)}
          disabled={reviseBusy}
          className={choiceButtonClass("mt-3 w-full border border-blue-600 bg-blue-600 text-white")}
        >
          修正を依頼
        </button>
      </>
    );
  }

  function renderRevisePending() {
    return (
      <div>
        <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          修正を依頼しました。PCが処理して最大5分で修正案を提示します。
        </p>
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
    return (
      <div>
        <p className="mt-2 text-xs text-gray-500">
          修正案が届きました。元の構成案と見比べて反映してください。
        </p>
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

  function renderReviseSection(item: PendingItem) {
    const lines = outlineLines(item.outline);
    const phase = revisePhase(item.reviseStatus);
    if (phase === "idle" && lines.length === 0) return null;
    return (
      <section aria-label="構成案の修正" className="mt-4 border-t border-gray-200 pt-4">
        <h3 className="text-sm font-bold text-gray-700">構成案の修正</h3>
        {phase === "pending"
          ? renderRevisePending()
          : phase === "ready"
            ? renderReviseReady(item)
            : phase === "failed"
              ? renderReviseFailed(item)
              : renderReviseCommentForm(item, lines)}
        {reviseError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {reviseError}
          </p>
        ) : null}
      </section>
    );
  }

  // #275: 詳細パネル(master-detail)。スマホ=全画面シート / PC=右サイドパネル。
  // 将来の AI 壁打ち・下書き生成は下部の拡張スロットに差し込む(今回は枠のみ)。
  function renderPanel(item: PendingItem) {
    const choice = decided[item.id];
    const isBusy = savingId === item.id;
    // #43: 修正中(依頼中/処理中/提示中)は承認/却下を無効化(古い構成案での承認を防ぐ)。
    const lockedForRevise = isReviseBusy(item.reviseStatus);
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
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-bold text-gray-900">{item.title}</h2>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className={`${TAP_TARGET} shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
            >
              閉じる
            </button>
          </div>
          {item.subtitle ? <p className="mt-1 text-sm text-gray-600">{item.subtitle}</p> : null}

          {item.details && item.details.length > 0 ? (
            <dl className="mt-3 space-y-1 text-sm">
              {item.details.map((detail) => (
                <div key={detail.label} className="flex gap-2">
                  <dt className="shrink-0 font-medium text-gray-700">{detail.label}</dt>
                  <dd className="whitespace-pre-wrap text-gray-800">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-4 flex gap-2">
            {choice ? (
              <button
                type="button"
                onClick={() => undoFromPanel(item)}
                disabled={isBusy}
                className={choiceButtonClass(
                  "flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
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
                  className={choiceButtonClass("flex-1 border border-blue-600 bg-blue-600 text-white")}
                >
                  承認
                </button>
                <button
                  type="button"
                  onClick={() => decideFromPanel(item, "却下")}
                  disabled={isBusy || lockedForRevise}
                  className={choiceButtonClass("flex-1 border border-gray-700 bg-gray-700 text-white")}
                >
                  却下
                </button>
              </>
            )}
          </div>

          {item.kind === "idea" ? renderReviseSection(item) : null}

          {/* #276/#277 の拡張スロット(今回は枠のみ・機能は後続issue) */}
          <section aria-label="AI壁打ち" className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-bold text-gray-700">AIと壁打ち</h3>
            <textarea
              aria-label="AI壁打ち（準備中）"
              disabled
              placeholder="（準備中）この提案について相談できます"
              className="mt-2 h-20 w-full rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">準備中（後続のアップデートで利用可能になります）。</p>
          </section>

          {item.kind === "idea" ? (
            <section aria-label="下書き生成" className="mt-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-bold text-gray-700">記事の下書きを生成</h3>
              <button
                type="button"
                disabled
                className={`${TAP_TARGET} mt-2 border border-gray-300 bg-gray-100 text-gray-500`}
              >
                下書きを生成
              </button>
              <p className="mt-1 text-xs text-gray-400">準備中（後続のアップデートで利用可能になります）。</p>
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-gray-900">今週の提案</h1>
        <p className="text-sm text-gray-600">
          処理済み {processed} / {items.length}件
        </p>
      </div>
      <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        承認した提案は制作キューに追加されます。この場では公開されません。
      </p>
      {allDone ? (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
          🎉 すべて処理しました。承認分は次の制作実行で成果物になります（公開はまだされません）。
        </p>
      ) : null}
      {proposals.length > 0 ? (
        <section className="mt-4">
          <h2 className="text-sm font-bold text-gray-700">施策</h2>
          <ul className="mt-2 space-y-2">{proposals.map(renderItem)}</ul>
        </section>
      ) : null}
      {ideas.length > 0 ? (
        <section className="mt-4">
          <h2 className="text-sm font-bold text-gray-700">記事</h2>
          <ul className="mt-2 space-y-2">{ideas.map(renderItem)}</ul>
        </section>
      ) : null}
      <AddProposalForm token={token} onAdded={addProposal} />
      {openItem ? renderPanel(openItem) : null}
    </main>
  );
}
