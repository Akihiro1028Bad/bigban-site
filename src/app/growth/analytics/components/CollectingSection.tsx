interface CollectingSectionProps { sections: readonly string[]; }
export function CollectingSection({ sections }: CollectingSectionProps) {
  // 収集中の項目が無ければ見出しだけの空セクションを出さない。
  if (sections.length === 0) return null;
  return <section aria-labelledby="analytics-collecting-heading"><h2 id="analytics-collecting-heading">これからの分析</h2><ul className="analytics-collecting">{sections.map((section) => <li key={section}><strong>収集中</strong><span>{section}</span></li>)}</ul></section>;
}
