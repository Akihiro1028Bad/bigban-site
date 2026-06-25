"use client";

import { useState } from "react";

import {
  applyDecorations,
  previewDecoration,
  type DecorateView,
  type DecorationProposal,
} from "@/lib/growth/decorate";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "./authHeaders";
import { StaleNotice } from "./StaleNotice";

interface DecorationAssistantProps {
  pageId: string;
  token: string;
  /** 現在の下書き本文HTML(提案のプレビュー・反映の対象)。 */
  bodyHtml: string;
  /** 下書き取得(loadDraft)で得た装飾提案の表示用ビュー。未取得は undefined。 */
  decorate?: DecorateView;
  /** 依頼/反映/閉じる の後に呼ぶ(親が下書きを再取得して最新化)。 */
  onChanged: () => void;
}

const MAX_INSTRUCTION = 500;

const OP_LABEL: Record<DecorationProposal["op"], string> = {
  add: "足す",
  change: "直す",
  remove: "消す",
};

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 記事装飾アシスタント(Epic #147)のカード。
 * AI が出した【箇所ごとの装飾提案】を採用/却下し、採用分だけを決定的な applyDecorations で
 * 本文へ反映する(保存は既存 /api/growth/draft/edit・サーバ側 STRICT 再サニタイズ)。
 * AI の生 HTML は使わない(装飾HTMLは固定変換で生成)。
 */
export function DecorationAssistant({ pageId, token, bodyHtml, decorate, onChanged }: DecorationAssistantProps) {
  const [instruction, setInstruction] = useState("");
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // decorate 未取得でも欠落なく扱えるよう既定ビューに正規化する(なし状態)。
  const view: DecorateView = decorate ?? { status: "なし", proposals: [], raw: "" };
  const status = view.status;

  async function postJson(path: string, body: unknown, fallback: string): Promise<boolean> {
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
      return true;
    } catch (e) {
      setError(errMsg(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function request(): Promise<void> {
    if (await postJson("/api/growth/decorate", { pageId, instruction: instruction.trim() }, "装飾提案の依頼に失敗しました。")) {
      onChanged();
    }
  }

  async function dismiss(): Promise<void> {
    if (await postJson("/api/growth/decorate/dismiss", { pageId }, "片付けに失敗しました。")) onChanged();
  }

  function toggle(id: string): void {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyAccepted(proposals: readonly DecorationProposal[]): Promise<void> {
    // 採用は適用可能な提案にだけチェックを出しているので、ここに来るのは適用可能分。
    const chosen = proposals.filter((p) => accepted.has(p.id));
    if (chosen.length === 0) {
      setError("採用する提案を選んでください。");
      return;
    }
    const { html } = applyDecorations(bodyHtml, chosen);
    if (await postJson("/api/growth/draft/edit", { pageId, bodyHtml: html }, "反映の保存に失敗しました。")) {
      setAccepted(new Set());
      onChanged();
    }
  }

  function renderError() {
    return error ? (
      <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
        {error}
      </p>
    ) : null;
  }

  function renderProposal(proposal: DecorationProposal) {
    const preview = previewDecoration(bodyHtml, proposal);
    const isAccepted = accepted.has(proposal.id);
    return (
      <li key={proposal.id} className="rounded-md border border-gray-200 bg-white p-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {OP_LABEL[proposal.op]}
          </span>
          <span className="text-[11px] font-semibold text-gray-600">{proposal.decoration}</span>
        </div>
        <p className="mt-1 text-xs text-gray-700">{proposal.reason}</p>
        {preview.applied ? (
          <div className="mt-1 space-y-0.5">
            <p className="truncate font-mono text-[10px] text-gray-400">before: {preview.before}</p>
            <p className="truncate font-mono text-[10px] text-blue-600">after: {preview.after}</p>
            <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={isAccepted}
                disabled={busy}
                aria-label={`採用: ${proposal.id}`}
                onChange={() => toggle(proposal.id)}
              />
              採用
            </label>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-amber-700">要確認: {preview.reason}（本文が変わっている可能性）</p>
        )}
      </li>
    );
  }

  function renderProposals(proposals: DecorationProposal[]) {
    if (proposals.length === 0) {
      return (
        <div>
          <p className="text-xs text-gray-600">提案できる装飾が見つかりませんでした。</p>
          {renderCloseRow()}
        </div>
      );
    }
    return (
      <div>
        <ul className="space-y-1.5">{proposals.map(renderProposal)}</ul>
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
            onClick={() => void applyAccepted(proposals)}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            採用分を反映
          </button>
        </div>
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
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-600" aria-busy="true">
            <span>AIが装飾を分析中です。数分後に再読み込みしてください。</span>
            <button
              type="button"
              disabled={busy}
              onClick={onChanged}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              再読み込み
            </button>
          </div>
          <StaleNotice requestedAtMs={view.requestedAtMs ?? null} busy />
        </div>
      );
    }
    if (status === "提示中") return renderProposals(view.proposals);
    if (status === "失敗") {
      return (
        <div>
          <p className="text-xs text-red-700">装飾提案に失敗しました。{view.raw ? `（${view.raw}）` : ""}</p>
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
              onClick={request}
              className="rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              再依頼
            </button>
          </div>
        </div>
      );
    }
    return (
      <div>
        <label className="block text-[11px] text-gray-500" htmlFor={`decorate-${pageId}`}>
          見てほしい点（任意・例: 注意書きを足して / 引用を整えて）
        </label>
        <textarea
          id={`decorate-${pageId}`}
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
            onClick={request}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            装飾を提案
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="装飾アシスタント" className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
      <h4 className="text-xs font-bold text-gray-600">装飾アシスタント（AI提案→採用で反映）</h4>
      <div className="mt-2">{renderBody()}</div>
      {renderError()}
    </section>
  );
}
