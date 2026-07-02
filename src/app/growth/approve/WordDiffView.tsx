import { wordDiff } from "./wordDiff";

interface WordDiffViewProps {
  before: string;
  after: string;
}

/**
 * 元 vs 新の語句単位 diff 表示(#M4)。追加=緑(下線)、削除=赤(取り消し線)で、
 * 色だけに依存しない視覚キー＋sr-only テキストで状態を併記する(AA)。
 */
export function WordDiffView({ before, after }: WordDiffViewProps) {
  const segs = wordDiff(before, after);
  return (
    <pre
      aria-label="元と新の差分"
      className="mt-1 whitespace-pre-wrap rounded-md bg-[var(--p-bg-input)] p-2 text-xs text-[var(--p-text-2)] ring-1 ring-[var(--p-border)]"
    >
      {segs.map((s, i) => {
        if (s.type === "same") return <span key={i}>{s.text}</span>;
        if (s.type === "add") {
          return (
            <span key={i} className="rounded bg-[var(--p-green-weak)] text-[var(--p-green)] underline decoration-[var(--p-green)]">
              {s.text}
              <span className="sr-only">（追加）</span>
            </span>
          );
        }
        return (
          <span key={i} className="rounded bg-[var(--p-red-weak)] text-[var(--p-red)] line-through">
            {s.text}
            <span className="sr-only">（削除）</span>
          </span>
        );
      })}
    </pre>
  );
}
