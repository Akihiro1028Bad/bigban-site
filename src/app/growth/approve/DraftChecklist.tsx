import type { CheckLevel, QualityCheck } from "./draftQuality";

interface DraftChecklistProps {
  checks: QualityCheck[];
}

/** 重大度ごとの見た目(色だけに依存せずアイコン字形＋sr-onlyテキストで併記・AA)。 */
const LEVEL_STYLE: Record<CheckLevel, { badge: string; icon: string; sr: string }> = {
  ok: { badge: "bg-green-100 text-green-700", icon: "✓", sr: "OK" },
  warn: { badge: "bg-amber-100 text-amber-700", icon: "！", sr: "要確認" },
  block: { badge: "bg-red-100 text-red-700", icon: "✕", sr: "公開ブロック" },
};

/**
 * 公開前チェックリスト(#128/#H4)。各項目を ok=緑 / warn=黄 / block=赤 の3段階で表示する。
 * 赤(block)があると親が公開ボタンを無効化する(§5免責欠落・§13断定など)。
 */
export function DraftChecklist({ checks }: DraftChecklistProps) {
  return (
    <section aria-label="公開前チェック">
      <h3 className="mb-2 text-sm font-bold text-gray-700">公開前チェック</h3>
      <ul className="space-y-1">
        {checks.map((check) => {
          const style = LEVEL_STYLE[check.level];
          return (
            <li key={check.label} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${style.badge}`}
              >
                {style.icon}
              </span>
              <span className="flex-1 text-gray-700">
                {check.label}
                {check.hint ? <span className="ml-1 text-[11px] text-gray-400">（{check.hint}）</span> : null}
              </span>
              <span className="text-gray-500">{check.value}</span>
              <span className="sr-only">{style.sr}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
