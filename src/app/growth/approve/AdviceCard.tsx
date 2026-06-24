"use client";

import { useState } from "react";

import type { AdviceFix, AdviceView } from "@/lib/growth/advise";
import { readJsonObject } from "@/lib/growth/safeJson";

interface AdviceCardProps {
  pageId: string;
  token: string;
  /** 下書き取得(loadDraft)で得たアドバイスの表示用ビュー。未取得は undefined。 */
  advice?: AdviceView;
  /** 依頼/再読み込み/閉じる の後に呼ぶ(親が下書きを再取得して最新化する)。 */
  onChanged: () => void;
}

/** 再生成指示の上限長(API の MAX_INSTRUCTION_LEN と一致)。 */
const MAX_INSTRUCTION = 500;

const SEVERITY_CLASS: Record<string, string> = {
  高: "bg-red-100 text-red-700",
  中: "bg-amber-100 text-amber-700",
  低: "bg-gray-100 text-gray-600",
};

function withToken(path: string, token: string): string {
  return `${path}?token=${encodeURIComponent(token)}`;
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 記事スタイリング・アドバイザー(Epic #146)のカード。
 * 承認画面の下書きプレビューに表示し、AI に文体・構成・読みやすさ(＋見た目の軽い助言)を
 * 依頼し、強み／直すべき点／観点別スコアを表示する。**read-only**(本文は書き換えない・プル型)。
 */
export function AdviceCard({ pageId, token, advice, onChanged }: AdviceCardProps) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const status = advice?.status ?? "なし";

  async function postJson(path: string, body: unknown, fallback: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(withToken(path, token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  function renderError() {
    return error ? (
      <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
        {error}
      </p>
    ) : null;
  }

  function renderFix(fix: AdviceFix, i: number) {
    return (
      <li key={i} className="rounded-md border border-gray-200 bg-white p-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_CLASS[fix.severity] ?? SEVERITY_CLASS["低"]}`}
          >
            {fix.severity}
          </span>
          <span className="text-[11px] font-semibold text-gray-600">{fix.area}</span>
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
            <ul className="mt-1 space-y-1.5">{data.fixes.map(renderFix)}</ul>
          </div>
        ) : null}
        {renderCloseRow()}
      </div>
    );
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
