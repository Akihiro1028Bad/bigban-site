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
      className="mt-1 whitespace-pre-wrap rounded-md bg-white p-2 text-xs text-gray-800 ring-1 ring-gray-200"
    >
      {segs.map((s, i) => {
        if (s.type === "same") return <span key={i}>{s.text}</span>;
        if (s.type === "add") {
          return (
            <span key={i} className="rounded bg-green-100 text-green-800 underline decoration-green-600">
              {s.text}
              <span className="sr-only">（追加）</span>
            </span>
          );
        }
        return (
          <span key={i} className="rounded bg-red-100 text-red-800 line-through">
            {s.text}
            <span className="sr-only">（削除）</span>
          </span>
        );
      })}
    </pre>
  );
}
