"use client";

import { useState } from "react";

import type { AdviceFix, AdviceView } from "@/lib/growth/advise";
import {
  applyAdviceItems,
  classifyFix,
  FIX_REASON_NO_QUOTE,
  type AdviceApplyView,
} from "@/lib/growth/adviseApply";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "./authHeaders";
import { StaleNotice } from "./StaleNotice";

interface AdviceCardProps {
  pageId: string;
  token: string;
  /** 下書き取得(loadDraft)で得たアドバイスの表示用ビュー。未取得は undefined。 */
  advice?: AdviceView;
  /** #165: アドバイス採用→反映の表示用ビュー。未取得は undefined。 */
  adviceApply?: AdviceApplyView;
  /** #165: 現在の下書き本文HTML(採用候補の判定・反映に使う)。 */
  bodyHtml?: string;
  /** 依頼/再読み込み/閉じる/反映 の後に呼ぶ(親が下書きを再取得して最新化する)。 */
  onChanged: () => void;
}

/** 再生成指示の上限長(API の MAX_INSTRUCTION_LEN と一致)。 */
const MAX_INSTRUCTION = 500;

const SEVERITY_CLASS: Record<string, string> = {
  高: "bg-red-100 text-red-700",
  中: "bg-amber-100 text-amber-700",
  低: "bg-gray-100 text-gray-600",
};

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 記事スタイリング・アドバイザー(Epic #146)のカード。
 * 承認画面の下書きプレビューに表示し、AI に文体・構成・読みやすさ(＋見た目の軽い助言)を
 * 依頼し、強み／直すべき点／観点別スコアを表示する。**read-only**(本文は書き換えない・プル型)。
 */
export function AdviceCard({
  pageId,
  token,
  advice,
  adviceApply,
  bodyHtml,
  onChanged,
}: AdviceCardProps) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // #165: 本文反映で採用する fix の index 集合。
  const [adopted, setAdopted] = useState<ReadonlySet<number>>(new Set());

  const status = advice?.status ?? "なし";
  const applyStatus = adviceApply?.status ?? "なし";

  async function postJson(path: string, body: unknown, fallback: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) throw new Error(json.error ?? fallback);
      onChanged();
    } catch (e) {
      setError(errMsg(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  function requestAdvice(): void {
    void postJson("/api/growth/advise", { pageId, instruction: instruction.trim() }, "アドバイス依頼に失敗しました。");
  }

  function dismiss(): void {
    void postJson("/api/growth/advise/dismiss", { pageId }, "アドバイスの片付けに失敗しました。");
  }

  // ── #165: 採用→本文反映 ──
  function toggleAdopt(index: number): void {
    setAdopted((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function submitApply(): void {
    void postJson(
      "/api/growth/advise/apply",
      { pageId, adoptedIndexes: [...adopted] },
      "反映依頼に失敗しました。"
    );
  }

  function dismissApply(): void {
    void postJson("/api/growth/advise/apply/dismiss", { pageId }, "反映の片付けに失敗しました。");
  }

  /** 提示された before/after 案を決定的に本文へ反映し、保存→片付け→再取得する。 */
  async function applyNow(): Promise<void> {
    if (!bodyHtml || !adviceApply) return;
    const { html, applied, skipped } = applyAdviceItems(bodyHtml, adviceApply.proposal);
    if (applied.length === 0) {
      setError("反映できる案がありませんでした（本文が変わった可能性・要確認）。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saveRes = await fetch("/api/growth/draft/edit", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, bodyHtml: html }),
      });
      const saveJson = await readJsonObject(saveRes);
      if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error ?? "保存に失敗しました。");
      const clearRes = await fetch("/api/growth/advise/apply/dismiss", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId }),
      });
      const clearJson = await readJsonObject(clearRes);
      if (!clearRes.ok || !clearJson.success) throw new Error(clearJson.error ?? "片付けに失敗しました。");
      if (skipped.length > 0) {
        setError(`${applied.length}件を反映しました（${skipped.length}件は本文不一致でスキップ）。`);
      }
      onChanged();
    } catch (e) {
      setError(errMsg(e, "反映に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  function renderError() {
    return error ? (
      <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
        {error}
      </p>
    ) : null;
  }

  function renderFix(fix: AdviceFix, i: number, selectable: boolean, reason: string | null) {
    return (
      <li key={i} className="rounded-md border border-gray-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          {selectable ? (
            <label className="flex items-center gap-1 text-[10px] text-blue-700">
              <input
                type="checkbox"
                aria-label={`修正案${i + 1}を採用`}
                checked={adopted.has(i)}
                onChange={() => toggleAdopt(i)}
              />
              採用
            </label>
          ) : null}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_CLASS[fix.severity] ?? SEVERITY_CLASS["低"]}`}
          >
            {fix.severity}
          </span>
          <span className="text-[11px] font-semibold text-gray-600">{fix.area}</span>
          {/* #178: 自動反映できない理由を表示(なぜチェックできないかを明示・沈黙させない)。 */}
          {reason ? (
            <span
              className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
              title={reason}
            >
              {reason}
            </span>
          ) : null}
        </div>
        {fix.quote ? (
          <p className="mt-1 border-l-2 border-gray-300 pl-2 text-[11px] italic text-gray-500">「{fix.quote}」</p>
        ) : null}
        <p className="mt-1 text-xs text-gray-700">{fix.reason}</p>
        <p className="mt-0.5 text-xs text-blue-700">→ {fix.suggestion}</p>
      </li>
    );
  }

  function renderAdvice() {
    const data = advice?.advice ?? null;
    if (!data) {
      return (
        <div>
          <p className="text-xs text-gray-600">アドバイスを解釈できませんでした。もう一度依頼してください。</p>
          {renderCloseRow()}
        </div>
      );
    }
    // #165/#178: 各 fix を分類(applicable か、不可なら理由)。反映が「なし」のときだけ選べる。
    const canSelect = applyStatus === "なし" && !!bodyHtml;
    const classifications = data.fixes.map((f) =>
      bodyHtml ? classifyFix(f, bodyHtml) : ({ applicable: false, reason: FIX_REASON_NO_QUOTE } as const)
    );
    const selectable = canSelect && classifications.some((c) => c.applicable);
    return (
      <div>
        <p className="text-xs text-gray-800">{data.summary}</p>
        {data.scores.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="観点別スコア">
            {data.scores.map((s, i) => (
              <li key={i} className="rounded bg-white px-2 py-0.5 text-[11px] text-gray-700 ring-1 ring-gray-200">
                {s.axis} <span className="font-bold">{s.score}</span>/5
                {s.note ? <span className="text-gray-400">（{s.note}）</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {data.strengths.length > 0 ? (
          <div className="mt-2">
            <h5 className="text-[11px] font-bold text-green-700">強み</h5>
            <ul className="mt-1 list-disc pl-4 text-xs text-gray-700">
              {data.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.fixes.length > 0 ? (
          <div className="mt-2">
            <h5 className="text-[11px] font-bold text-amber-700">直すべき点</h5>
            <ul className="mt-1 space-y-1.5">
              {data.fixes.map((fix, i) => {
                const c = classifications[i];
                return renderFix(
                  fix,
                  i,
                  canSelect && c.applicable,
                  canSelect && !c.applicable ? c.reason : null
                );
              })}
            </ul>
          </div>
        ) : null}
        {renderApplySection(selectable)}
        {renderCloseRow()}
      </div>
    );
  }

  /** #165: 採用→反映の操作セクション。反映ステータスに応じて出し分ける。 */
  function renderApplySection(selectable: boolean) {
    const proposal = adviceApply?.proposal ?? [];
    const applyRaw = adviceApply?.raw ?? "";
    if (selectable) {
      return (
        <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-2">
          <p className="text-[11px] text-blue-800">
            文体・読みやすさ・構成の修正案は本文へ反映できます（採用→差分確認→反映）。
          </p>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              disabled={busy || adopted.size === 0}
              onClick={submitApply}
              className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              採用分を反映依頼（{adopted.size}）
            </button>
          </div>
        </div>
      );
    }
    if (applyStatus === "依頼中" || applyStatus === "処理中") {
      return (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800" aria-busy="true">
          <span>反映案を作成中です。数分後に再読み込みしてください。</span>
          <button
            type="button"
            disabled={busy}
            onClick={onChanged}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            再読み込み
          </button>
        </div>
      );
    }
    if (applyStatus === "提示中") {
      return (
        <div className="mt-2 rounded-md border border-blue-200 bg-white p-2">
          <h5 className="text-[11px] font-bold text-blue-700">反映案（元 → 新）</h5>
          <ul className="mt-1 space-y-2">
            {proposal.map((item, i) => (
              <li key={i} className="rounded border border-gray-200 p-1.5">
                <p className="text-[10px] text-gray-400">元</p>
                <p className="text-[11px] text-gray-500 line-through">{item.before}</p>
                <p className="mt-1 text-[10px] text-gray-400">新</p>
                <p className="text-[11px] text-gray-800">{item.after}</p>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={dismissApply}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              反映を閉じる
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyNow()}
              className="rounded border border-blue-600 bg-blue-600 px-3 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              本文に反映する
            </button>
          </div>
        </div>
      );
    }
    if (applyStatus === "失敗") {
      return (
        <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
          <span>反映に失敗しました。{applyRaw ? `（${applyRaw}）` : ""}</span>
          <button
            type="button"
            disabled={busy}
            onClick={dismissApply}
            className="ml-2 rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            反映を閉じる
          </button>
        </div>
      );
    }
    return null;
  }

  function renderCloseRow() {
    return (
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={dismiss}
          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          閉じる
        </button>
      </div>
    );
  }

  function renderBody() {
    if (status === "依頼中" || status === "処理中") {
      return (
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-600" aria-busy="true">
            <span>AIが分析中です。数分後に再読み込みしてください。</span>
            <button
              type="button"
              disabled={busy}
              onClick={onChanged}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              再読み込み
            </button>
          </div>
          <StaleNotice requestedAtMs={advice?.requestedAtMs ?? null} busy />
        </div>
      );
    }
    if (status === "提示中") return renderAdvice();
    if (status === "失敗") {
      return (
        <div>
          <p className="text-xs text-red-700">アドバイスに失敗しました。{advice?.raw ? `（${advice.raw}）` : ""}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={dismiss}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              閉じる
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={requestAdvice}
              className="rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              再依頼
            </button>
          </div>
        </div>
      );
    }
    // status === "なし": 依頼フォーム
    return (
      <div>
        <label className="block text-[11px] text-gray-500" htmlFor={`advice-${pageId}`}>
          見てほしい点（任意・例: 見た目も助言して / 翻訳調を直したい）
        </label>
        <textarea
          id={`advice-${pageId}`}
          value={instruction}
          maxLength={MAX_INSTRUCTION}
          disabled={busy}
          onChange={(event) => setInstruction(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={requestAdvice}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            アドバイスを依頼
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="スタイリング・アドバイス" className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
      <h4 className="text-xs font-bold text-gray-600">スタイリング・アドバイス（AI・read-only）</h4>
      <div className="mt-2">{renderBody()}</div>
      {renderError()}
    </section>
  );
}
