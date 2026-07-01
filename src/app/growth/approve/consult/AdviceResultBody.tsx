"use client";

/**
 * AI相談ドロワーのアドバイス提示ボディ(proto へ再スキン)。
 *
 * proto(approve-proto/AdviceResultBody.tsx)の見た目を基に、backend の Advice 型へ adapt。
 * - 総評: RingScore(観点平均を overallFromScores で 0-100 導出) ＋ summary テキスト
 * - scores: axis/score(0-5)/note → 観点バー(幅 = score/5*100%・proto 閾値配色)
 * - strengths: IconArrowUp 見出し
 * - fixes: quote? → area必須・severity・quote?・reason・suggestion(IconChart)。severity バッジ配色。
 *
 * status 管理・依頼フォーム・閉じる操作は持たない(親が担う)。
 * 採用チェック(#165)の可否判定・reason 表示ロジック・aria は不変(配色のみ再スキン)。
 */

import { IconArrowDown, IconArrowUp, IconChart } from "../ui/icons";
import { RingScore } from "../ui/primitives";
import { overallFromScores } from "../adviceScore";

import type { Advice, AdviceFix } from "@/lib/growth/advise";
import type { FixClassification } from "@/lib/growth/adviseApply";

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

/** severity → バッジ配色(proto トーン。未知は弱グレーへフォールバック)。 */
const SEVERITY_STYLE: Record<string, { background: string; color: string }> = {
  高: { background: "var(--p-red-weak)", color: "var(--p-red)" },
  中: { background: "var(--p-amber-weak)", color: "var(--p-amber)" },
  低: { background: "var(--p-bg-active)", color: "var(--p-text-2)" },
};

/** score(0-5) → バー配色(0-100 換算の proto 閾値: 80+ 緑 / 65+ accent / else amber)。 */
function scoreBarColor(score: number): string {
  const scaled = (score / 5) * 100;
  if (scaled >= 80) return "var(--p-green)";
  if (scaled >= 65) return "var(--p-accent)";
  return "var(--p-amber)";
}

function renderFix(
  fix: AdviceFix,
  index: number,
  canAdopt: boolean,
  isAdopted: boolean,
  reason: string | null,
  onToggleAdopt: (i: number) => void
) {
  const severityStyle = SEVERITY_STYLE[fix.severity] ?? SEVERITY_STYLE["低"];
  return (
    <div
      key={index}
      className="rounded-[10px] p-3"
      style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {canAdopt ? (
          <label
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "var(--p-accent-ink)" }}
          >
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
          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: severityStyle.background, color: severityStyle.color }}
        >
          {fix.severity}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--p-text-2)" }}>
          {fix.area}
        </span>
        {/* 自動反映できない理由を表示(なぜチェックできないかを明示・沈黙させない #178 整合) */}
        {reason ? (
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: "var(--p-bg-active)", color: "var(--p-text-3)" }}
            title={reason}
          >
            {reason}
          </span>
        ) : null}
      </div>
      {fix.quote ? (
        <p
          className="mt-2 border-l-2 pl-2.5 text-[12.5px] italic"
          style={{ borderColor: "var(--p-amber)", color: "var(--p-text-2)" }}
        >
          「{fix.quote}」
        </p>
      ) : null}
      <p className="mt-2 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
        {fix.reason}
      </p>
      <p
        className="mt-1.5 flex items-start gap-1.5 text-[12.5px]"
        style={{ color: "var(--p-accent-ink)" }}
      >
        <IconChart size={13} style={{ marginTop: 2, color: "var(--p-accent)" }} />
        {fix.suggestion}
      </p>
    </div>
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
    <div className="flex flex-col gap-5">
      {/* 総評: RingScore(観点平均→0-100 導出) ＋ summary テキスト */}
      <div
        className="flex items-center gap-4 rounded-[12px] p-4"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <RingScore value={overallFromScores(advice.scores)} size={64} />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            総評
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--p-text-2)" }}>
            {advice.summary}
          </p>
        </div>
      </div>

      {/* 観点別スコア(axis・score/5・note) */}
      {advice.scores.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5" aria-label="観点別スコア">
          {advice.scores.map((s, i) => (
            <div
              key={i}
              className="rounded-[10px] p-3"
              style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "var(--p-text-2)" }}>
                  {s.axis}
                </span>
                <span className="text-[12px] font-semibold tabular-nums">{s.score}/5</span>
              </div>
              <div
                className="mt-2 h-[5px] overflow-hidden rounded-full"
                style={{ background: "var(--p-bg-active)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(s.score / 5) * 100}%`,
                    background: scoreBarColor(s.score),
                  }}
                />
              </div>
              {s.note ? (
                <div className="mt-1.5 text-[11px]" style={{ color: "var(--p-text-3)" }}>
                  {s.note}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* 強み */}
      {advice.strengths.length > 0 ? (
        <div>
          <div
            className="mb-2 flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: "var(--p-green)" }}
          >
            <IconArrowUp size={14} /> 強み
          </div>
          <ul className="flex flex-col gap-1.5">
            {advice.strengths.map((s, i) => (
              <li key={i} className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
                ・{s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 直すべき点 */}
      {advice.fixes.length > 0 ? (
        <div>
          <div
            className="mb-2 flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: "var(--p-amber)" }}
          >
            <IconArrowDown size={14} /> 直すべき点
          </div>
          <div className="flex flex-col gap-2.5">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
