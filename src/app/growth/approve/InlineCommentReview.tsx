"use client";

/**
 * 本文インラインコメントのレビューUI(#182 Phase 1)。
 *
 * 下書き本文を「1文＝1行」に分割し、GitHub の PR レビューのように行番号ガター＋ホバーで「+」を出す。
 * 各文にコメントを付け、「AIに指摘を依頼」で /api/growth/body-comment へまとめて送る。
 * アンカーは引用(excerpt)で固定し、サーバ側で再検証される(本文が変わって一致しなければ弾かれる)。
 *
 * 純ロジック(文分割・アンカー・スキーマ)は bodyComment.ts でテスト済み。本ファイルは薄い DOM 結線。
 */

import { Fragment } from "react";

import {
  extractReviewLines,
  type BodyCommentStatus,
  type BodyCommentView,
} from "@/lib/growth/bodyComment";

import { useBodyCommentConsult } from "./hooks/useBodyCommentConsult";

interface InlineCommentReviewProps {
  pageId: string;
  token: string;
  bodyHtml: string;
  bodyComment?: BodyCommentView;
  onChanged: () => void;
}

const STATUS_LABEL: Record<BodyCommentStatus, string> = {
  なし: "",
  依頼中: "AIに依頼しました。常駐PCの処理を待っています…",
  処理中: "AIが本文を確認しています…",
  提示中: "AIの修正案が届いています。下のプレビューで確認してください。",
  失敗: "AIの処理に失敗しました。もう一度依頼してください。",
};

/** #M5: before/after の HTMLタグ構造の変化(追加要素)を一言で示す。タグ除去で隠れる装飾変化を可視化。 */
function structureNote(before: string, after: string): string | null {
  const tagNames = (html: string): string[] =>
    [...html.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map((m) => m[1].toLowerCase());
  const beforeTags = new Set(tagNames(before));
  const added = [...new Set(tagNames(after))].filter((t) => !beforeTags.has(t));
  return added.length > 0 ? `構造変化: <${added.join(">, <")}> を追加` : null;
}

export function InlineCommentReview({
  pageId,
  token,
  bodyHtml,
  bodyComment,
  onChanged,
}: InlineCommentReviewProps) {
  const lines = extractReviewLines(bodyHtml);
  const ic = useBodyCommentConsult({ pageId, token, bodyHtml, bodyComment, onChanged });

  const status: BodyCommentStatus = bodyComment?.status ?? "なし";
  const proposal = bodyComment?.proposal ?? [];
  const canComment = status === "なし";

  const total = ic.buildPayload().length;
  const tbBtn =
    "rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40";

  return (
    <section aria-label="本文インラインコメント" className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          インラインコメント
        </h3>
        <span className="text-[11px] text-gray-500">行（文）ごとに ＋ でコメント → AIに指摘を依頼</span>
      </div>

      {status !== "なし" ? (
        <div
          className={`mb-2 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs ${
            status === "失敗" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
          }`}
        >
          <span role="status">{STATUS_LABEL[status]}</span>
          <button
            type="button"
            onClick={() => void ic.dismiss()}
            disabled={ic.busy}
            className="shrink-0 rounded border border-gray-300 bg-white/70 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-white disabled:opacity-40"
          >
            取り消し
          </button>
        </div>
      ) : null}

      {status === "提示中" && proposal.length > 0 ? (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50/40 p-2">
          <h4 className="mb-1.5 text-[11px] font-bold text-blue-800">AIの修正案（元 → 新）</h4>
          <ul className="space-y-1.5">
            {proposal.map((item, idx) => (
              <li key={idx} className="rounded border border-gray-200 bg-white p-2 text-xs">
                <p className="text-gray-400 line-through">{item.before.replace(/<[^>]*>/g, "")}</p>
                <p className="mt-0.5 text-gray-900">{item.after.replace(/<[^>]*>/g, "")}</p>
                {/* #M5: タグ除去で見えなくなる装飾/構造の追加(aside・リンク等)を明示する。 */}
                {structureNote(item.before, item.after) ? (
                  <p className="mt-0.5 text-[10px] font-medium text-amber-700">
                    {structureNote(item.before, item.after)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void ic.applyNow()}
              disabled={ic.busy}
              className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
            >
              本文へ反映（{proposal.length}）
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-gray-200">
        {lines.map((line, i) => {
          const key = line.excerpt !== null ? `${line.blockIndex}::${line.excerpt}` : `nt-${i}`;
          const thread = line.excerpt !== null ? ic.comments[key] ?? [] : [];
          const isHeading = line.tag === "h2" || line.tag === "h3" || line.tag === "h4";
          return (
            <Fragment key={key}>
              <div className="group flex items-start hover:bg-gray-50">
                <div className="flex w-12 shrink-0 select-none items-center justify-end gap-1 px-1.5 pt-1.5">
                  <span className="font-mono text-[11px] text-gray-400">{i + 1}</span>
                  {canComment && line.commentable ? (
                    <button
                      type="button"
                      aria-label={`${i + 1}行目にコメント`}
                      onClick={() => ic.openComposer(key)}
                      className="flex h-[18px] w-[18px] items-center justify-center rounded bg-blue-600 text-xs leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      ＋
                    </button>
                  ) : null}
                </div>
                <div
                  className={`flex-1 px-2 py-1.5 text-sm leading-relaxed ${
                    line.commentable ? "text-gray-800" : "text-gray-400"
                  } ${isHeading ? "font-bold" : ""} ${thread.length > 0 ? "bg-blue-50/40" : ""}`}
                >
                  {line.text}
                </div>
              </div>

              {thread.map((c, idx) => (
                <div
                  key={idx}
                  className="ml-12 flex items-start justify-between gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
                      あ
                    </span>
                    <span className="text-xs text-gray-700">{c}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="コメントを削除"
                    onClick={() => ic.removeComment(key, idx)}
                    className="shrink-0 text-[11px] text-gray-400 hover:text-red-600"
                  >
                    削除
                  </button>
                </div>
              ))}

              {ic.openFor === key ? (
                <div className="ml-12 border-t border-gray-200 bg-gray-50 px-3 py-2">
                  <textarea
                    aria-label={`${i + 1}行目へのコメント入力`}
                    value={ic.draft}
                    onChange={(e) => ic.setDraft(e.target.value)}
                    placeholder="この文への指摘を書く…"
                    className="min-h-12 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
                  />
                  <div className="mt-1.5 flex justify-end gap-2">
                    <button type="button" onClick={() => ic.closeComposer()} className={tbBtn}>
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => ic.addComment(key)}
                      disabled={!ic.draft.trim()}
                      className="rounded border border-blue-600 bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      コメント
                    </button>
                  </div>
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      {ic.error ? (
        <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {ic.error}
        </p>
      ) : null}

      {canComment ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void ic.requestAi()}
            disabled={ic.busy || total === 0}
            className="flex items-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
          >
            AIに指摘を依頼（{total}）
          </button>
        </div>
      ) : null}
    </section>
  );
}
