interface ProgressStepperProps {
  label: string;
  steps: readonly string[];
  currentIndex: number;
}

export function ProgressStepper({ label, steps, currentIndex }: ProgressStepperProps) {
  return (
    <ol aria-label={label} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={step} data-complete={complete ? "true" : "false"} className="min-w-0">
            <div className="mb-2 flex items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold" style={{ borderColor: complete || current ? "var(--p-accent)" : "var(--p-border-strong)", background: complete ? "var(--p-accent)" : current ? "var(--p-accent-weak)" : "var(--p-bg-input)", color: complete ? "var(--p-accent-ink)" : current ? "var(--p-accent)" : "var(--p-text-3)", boxShadow: current ? "0 0 16px var(--p-accent-weak)" : "none" }}>{complete ? "✓" : index + 1}</span>
              {index < steps.length - 1 ? <span className="h-px min-w-0 flex-1" style={{ background: complete ? "var(--p-accent)" : "var(--p-border)" }} /> : null}
            </div>
            <span aria-current={current ? "step" : undefined} className="block truncate text-[9px] font-medium sm:text-[10.5px]" style={{ color: current ? "var(--p-text)" : "var(--p-text-3)" }}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
