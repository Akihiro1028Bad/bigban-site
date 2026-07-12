import type { ReactNode } from "react";

interface ConsoleHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function ConsoleHeader({ eyebrow, title, description, action }: ConsoleHeaderProps) {
  return (
    <header className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className="mb-1 text-[10px] font-semibold tracking-[0.18em]" style={{ color: "var(--p-accent)" }}>{eyebrow}</div> : null}
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>{description}</p>
      </div>
      {action}
    </header>
  );
}

interface SummaryButtonProps {
  label: string;
  value: number;
  hint: string;
  color: string;
  icon: ReactNode;
  onClick: () => void;
}

export function SummaryButton({ label, value, hint, color, icon, onClick }: SummaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="console-card group min-h-[132px] text-left"
      aria-label={`${label} ${value}件`}
    >
      <span className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
          {icon}
        </span>
        <span className="text-[20px] font-semibold tabular-nums">{value}</span>
      </span>
      <span className="mt-4 block text-[13px] font-semibold">{label}</span>
      <span className="mt-1 block text-[11.5px]" style={{ color: "var(--p-text-3)" }}>{hint} →</span>
    </button>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />;
}
