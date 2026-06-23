interface Metric {
  label: string;
  value: string;
}

interface MetricChipsProps {
  details?: Metric[];
}

/**
 * 詳細パネル(#124)の根拠メトリクス。素の dl の代わりに小さなチップ行で見せる。
 * details が空/未定義なら何も描かない。
 */
export function MetricChips({ details }: MetricChipsProps) {
  if (!details || details.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-2">
      {details.map((metric) => (
        <div
          key={metric.label}
          className="rounded-md bg-gray-50 px-3 py-1.5 ring-1 ring-gray-100"
        >
          <dt className="text-[11px] text-gray-500">{metric.label}</dt>
          <dd className="text-sm font-semibold text-gray-900">{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}
