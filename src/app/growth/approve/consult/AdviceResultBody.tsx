"use client";

/**
 * AI相談ドロワーのアドバイス提示ボディ(Task 7: backend Advice 型で移植)。
 *
 * プロト(approve-proto/AdviceResultBody.tsx)の見た目を基に、backend の Advice 型へ adapt。
 * - overall(0-100/RingScore) → summary テキスト見出しに置換
 * - scores: label/0-100 → axis/score(0-5)/note
 * - fixes: quote必須 → area必須・severity・quote?・reason・suggestion
 *
 * status 管理・依頼フォーム・閉じる操作は持たない(親が担う)。
 * 採用チェックの可否判定・SEVERITY バッジ配色は AdviceCard の実装(renderFix/renderAdvice)に整合。
 */

import type { Advice, AdviceFix } from "@/lib/growth/advise";
import {
  classifyFix,
  FIX_REASON_NO_QUOTE,
  type FixClassification,
} from "@/lib/growth/adviseApply";

interface AdviceResultBodyProps {
  advice: Advice;
  /** 採用済みの fix インデックス集合。 */
  adopted: ReadonlySet<number>;
  /** true のとき採用チェックを表示する(反映が「なし」かつ bodyHtml あり)。 */
  selectable: boolean;
  /**
   * 各 fix の反映可否判定結果。advice.fixes と同じ順序・長さ。
   * bodyHtml なしの場合は全て `{ applicable: false, reason: FIX_REASON_NO_QUOTE }` を渡す。
   */
  classifications: { applicable: boolean; reason?: string }[];
  onToggleAdopt: (index: number) => void;
}

/** severity → Tailwind クラス(AdviceCard の SEVERITY_CLASS に整合)。 */
const SEVERITY_CLASS: Record<string, string> = {
  高: "bg-red-100 text-red-700",
  中: "bg-amber-100 text-amber-700",
  低: "bg-gray-100 text-gray-600",
};

function renderFix(
  fix: AdviceFix,
  index: number,
  canAdopt: boolean,
  isAdopted: boolean,
  reason: string | null,
  onToggleAdopt: (i: number) => void
) {
  return (
    <li key={index} className="rounded-md border border-gray-200 bg-white p-2">
      <div className="flex flex-wrap items-center gap-2">
        {canAdopt ? (
          <label className="flex items-center gap-1 text-[10px] text-blue-700">
            <input
              type="checkbox"
              aria-label={`修正案${index + 1}を採用`}
              checked={isAdopted}
              onChange={() => onToggleAdopt(index)}
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
        {/* 自動反映できない理由を表示(なぜチェックできないかを明示・沈黙させない #178 整合) */}
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
        <p className="mt-1 border-l-2 border-gray-300 pl-2 text-[11px] italic text-gray-500">
          「{fix.quote}」
        </p>
      ) : null}
      <p className="mt-1 text-xs text-gray-700">{fix.reason}</p>
      <p className="mt-0.5 text-xs text-blue-700">→ {fix.suggestion}</p>
    </li>
  );
}

export function AdviceResultBody({
  advice,
  adopted,
  selectable,
  classifications,
  onToggleAdopt,
}: AdviceResultBodyProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* 総評(backend: advice.summary テキスト。RingScore は撤去) */}
      <div className="rounded-[12px] p-3" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
        <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          総評
        </div>
        <p className="mt-1 text-xs text-gray-800">{advice.summary}</p>
      </div>

      {/* 観点別スコア(axis n/5・note) */}
      {advice.scores.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="観点別スコア">
          {advice.scores.map((s, i) => (
            <li
              key={i}
              className="rounded bg-white px-2 py-0.5 text-[11px] text-gray-700 ring-1 ring-gray-200"
            >
              {s.axis} <span className="font-bold">{s.score}</span>/5
              {s.note ? <span className="text-gray-400">（{s.note}）</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* 強み */}
      {advice.strengths.length > 0 ? (
        <div>
          <h5 className="text-[11px] font-bold text-green-700">強み</h5>
          <ul className="mt-1 list-disc pl-4 text-xs text-gray-700">
            {advice.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 直すべき点 */}
      {advice.fixes.length > 0 ? (
        <div>
          <h5 className="text-[11px] font-bold text-amber-700">直すべき点</h5>
          <ul className="mt-1 space-y-1.5">
            {advice.fixes.map((fix, i) => {
              const c = classifications[i] as FixClassification | undefined;
              const applicable = c?.applicable ?? false;
              const reason =
                selectable && !applicable && c != null && !c.applicable
                  ? (c.reason ?? null)
                  : null;
              return renderFix(
                fix,
                i,
                selectable && applicable,
                adopted.has(i),
                reason,
                onToggleAdopt
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
