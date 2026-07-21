import type { GrowthOperationResult, GrowthOutcome } from "@/lib/growth/operationOutcome";

export interface PublishOperationResultItem {
  pageId: string;
  title: string;
  result: GrowthOperationResult;
}

interface PublishOperationResultsProps {
  results: readonly PublishOperationResultItem[];
  onRetry: (pageId: string, resumeFrom?: string) => void;
}

const OUTCOMES: readonly GrowthOutcome[] = ["success", "partial", "retryable-failure", "manual-action-required"];

export function PublishOperationResults({ results, onRetry }: PublishOperationResultsProps) {
  if (results.length === 0) return null;
  return (
    <section aria-label="公開処理結果" className="mb-5 rounded-[12px] p-4" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <h3 className="text-[13px] font-semibold">公開処理結果</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {OUTCOMES.map((outcome) => {
          const count = results.filter((item) => item.result.outcome === outcome).length;
          return <span key={outcome} aria-label={`${outcome}: ${count}件`} className="rounded-full px-2 py-1 text-[11px]" style={{ background: "var(--p-bg-raised)" }}>{outcome}: {count}</span>;
        })}
      </div>
      <ul className="mt-3 space-y-3">
        {results.map(({ pageId, title, result }) => {
          const canRetryNotion = result.recovery?.retryable === true && result.recovery.resumeFrom === "notion:status";
          const canRetryAll = result.recovery?.retryable === true && result.recovery.resumeFrom !== "notion:status";
          return (
          <li key={pageId} className="rounded-[9px] p-3 text-[12px]" style={{ background: "var(--p-bg-raised)" }}>
            <div className="font-semibold">{title} — {result.outcome}</div>
            <p className="mt-1">{result.message}</p>
            {result.completedStages.length > 0 ? <p>完了: {result.completedStages.join(" → ")}</p> : null}
            {result.failedStage ? <p>失敗: {result.failedStage}</p> : null}
            {result.recovery?.manualAction ? <p className="mt-1">{result.recovery.manualAction}</p> : null}
            {canRetryNotion ? (
              <button
                type="button"
                className="approve-btn-ghost mt-2"
                aria-label={`${title}: Notion同期のみ再試行`}
                onClick={() => onRetry(pageId, result.recovery!.resumeFrom!)}
              >
                Notion同期のみ再試行
              </button>
            ) : null}
            {canRetryAll ? (
              <button
                type="button"
                className="approve-btn-ghost mt-2"
                aria-label={`${title}: 公開処理を再試行`}
                onClick={() => onRetry(pageId)}
              >
                公開処理を再試行
              </button>
            ) : null}
          </li>
          );
        })}
      </ul>
    </section>
  );
}
