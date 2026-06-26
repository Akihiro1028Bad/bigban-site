/**
 * 記事の仮説カード(#計測強化 S4)。承認前に「狙い(記事タイプ/読者/検索意図/勝ち筋/想定CTA/成功指標)」を
 * 確認できるようにする。空項目は出さない(欠落耐性)。表示のみ。
 */

import type { ArticleHypothesis } from "@/lib/growth/approve";

interface HypothesisCardProps {
  hypothesis: ArticleHypothesis;
}

const ROWS: { label: string; key: keyof Omit<ArticleHypothesis, "plannedCta"> }[] = [
  { label: "記事タイプ", key: "articleType" },
  { label: "狙う読者", key: "targetReader" },
  { label: "検索意図", key: "searchIntent" },
  { label: "勝ち筋", key: "winningAngle" },
  { label: "成功指標", key: "successMetric" },
];

export function HypothesisCard({ hypothesis }: HypothesisCardProps) {
  const rows = ROWS.filter((r) => hypothesis[r.key] !== "");
  return (
    <section aria-label="記事の仮説" className="mt-3 rounded-lg border border-purple-100 bg-purple-50/50 p-3">
      <p className="mb-1.5 text-xs font-bold text-purple-800">記事の仮説</p>
      <dl className="space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.key} className="flex gap-2">
            <dt className="shrink-0 text-xs text-purple-700/80">{r.label}</dt>
            <dd className="text-gray-700">{hypothesis[r.key]}</dd>
          </div>
        ))}
        {hypothesis.plannedCta.length > 0 ? (
          <div className="flex gap-2">
            <dt className="shrink-0 text-xs text-purple-700/80">想定CTA</dt>
            <dd className="flex flex-wrap gap-1">
              {hypothesis.plannedCta.map((cta) => (
                <span key={cta} className="rounded bg-purple-100 px-1.5 py-0.5 text-[11px] text-purple-700">
                  {cta}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
