import { styleLint, styleLintSummary, termHints } from "@/lib/growth/styleLint";

interface StyleHintsProps {
  /** 本文プレーンテキスト。 */
  plain: string;
}

/**
 * 文体チェック(#C5/WRITE-02/#H22)。style-guide §6/§14 の NG語・AI定型を確定的に検出し、
 * §9/用語のゆれは置換候補とともに示す。自動却下ではなく編集者の見直し補助(ハイライト＋件数)。
 */
export function StyleHints({ plain }: StyleHintsProps) {
  const summary = styleLintSummary(styleLint(plain));
  // 用語ゆれは語ごとに1つにまとめる(同じ語が複数出ても候補は1回表示)。
  const terms = [...new Map(termHints(plain).map((t) => [t.term, t.suggestion])).entries()];
  const clean = summary.length === 0 && terms.length === 0;

  return (
    <section aria-label="文体チェック" className="mt-4">
      <h3 className="mb-2 text-sm font-bold text-gray-700">文体チェック（要確認）</h3>
      {clean ? (
        <p className="text-sm text-gray-500">気になる表現は見つかりませんでした。</p>
      ) : (
        <div className="space-y-2">
          {summary.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="NG語・AI定型">
              {summary.map((s) => (
                <li
                  key={s.category}
                  className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                >
                  {s.category} <span className="font-bold">{s.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {terms.length > 0 ? (
            <ul className="space-y-0.5" aria-label="用語の統一候補">
              {terms.map(([term, suggestion]) => (
                <li key={term} className="text-[11px] text-gray-600">
                  「{term}」→ <span className="font-medium text-gray-800">{suggestion}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
