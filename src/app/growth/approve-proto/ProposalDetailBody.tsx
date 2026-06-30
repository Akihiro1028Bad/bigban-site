/**
 * 施策詳細の本体(#proto・多種別化): proposalKind で中段だけ差し替える。
 * ConsultCard が status で本体を差し替えるのと対称。ヘッダ/フッタ/却下理由は ProposalView 側。
 */
"use client";

import React from "react";
import { IconBolt, IconCalendar, IconFileText, IconLayout } from "./icons";
import type { Article, ProposalKind } from "./types";

/** 種別→アイコン（JSXは純モジュール proposalKind.ts に置けないのでここで持つ）。 */
export const KIND_ICON: Record<ProposalKind, (p: { size?: number }) => React.ReactElement> = {
  article: IconFileText,
  site: IconLayout,
  event: IconCalendar,
  other: IconBolt,
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
      <div className="mt-[1px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>{value}</div>
    </div>
  );
}

export function ProposalDetailBody({ article }: { article: Article }) {
  const kind = article.proposalKind ?? "article";

  if (kind === "site") {
    const d = article.siteDetail;
    return (
      <div className="flex flex-col gap-3">
        {d?.whatChange && <Field label="何を変える" value={d.whatChange} />}
        {d?.whereTarget && <Field label="どこを" value={d.whereTarget} />}
        {d?.whyReason && <Field label="なぜ" value={d.whyReason} />}
        {article.refs.length > 0 && (
          <div>
            <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>参考</div>
            <div className="mt-1 flex flex-col gap-1">
              {article.refs.map((r) => (
                <span key={r.source} className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>↗ {r.title}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (kind === "event") {
    const d = article.eventDetail;
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {d?.whenLabel && <Field label="いつ" value={d.whenLabel} />}
        {d?.audience && <Field label="対象" value={d.audience} />}
        {d?.format && <Field label="形式" value={d.format} />}
        {d?.capacity && <Field label="想定人数" value={d.capacity} />}
      </div>
    );
  }

  if (kind === "other") {
    return article.freeNote ? (
      <div className="text-[13px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>{article.freeNote}</div>
    ) : null;
  }

  // article: 既存 hypothesis グリッドを移植
  return article.hypothesis ? (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
      <Field label="記事タイプ" value={article.hypothesis.articleType} />
      <Field label="狙う読者" value={article.hypothesis.targetReader} />
      <Field label="検索意図" value={article.hypothesis.searchIntent} />
      <Field label="勝ち筋" value={article.hypothesis.winningAngle} />
      <Field label="成功指標" value={article.hypothesis.successMetric} />
      <Field label="想定CTA" value={article.hypothesis.plannedCta} />
    </div>
  ) : null;
}
