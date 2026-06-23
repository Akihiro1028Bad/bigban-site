import type { QualityCheck } from "./draftQuality";

interface DraftChecklistProps {
  checks: QualityCheck[];
}

/**
 * 公開前チェックリスト(#128)。各項目を ok=緑 / warn=黄 で表示する。
 * 色だけに依存しないよう、アイコン字形(✓/！)と sr-only テキストで状態を併記する(AA)。
 */
export function DraftChecklist({ checks }: DraftChecklistProps) {
  return (
    <section aria-label="公開前チェック">
      <h3 className="mb-2 text-sm font-bold text-gray-700">公開前チェック</h3>
      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                check.ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {check.ok ? "✓" : "！"}
            </span>
            <span className="flex-1 text-gray-700">{check.label}</span>
            <span className="text-gray-500">{check.value}</span>
            <span className="sr-only">{check.ok ? "OK" : "要確認"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
