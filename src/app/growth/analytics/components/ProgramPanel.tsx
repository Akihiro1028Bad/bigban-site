import type { ProgramListItem } from "@/lib/growth/analyticsView";

interface ProgramPanelProps { programs: readonly ProgramListItem[]; }

export function ProgramPanel({ programs }: ProgramPanelProps) {
  return <section aria-labelledby="analytics-program-heading"><h2 id="analytics-program-heading">プログラム</h2>{programs.length === 0 ? <p>対象のプログラムはありません。</p> : <ul className="analytics-programs">{programs.map((program) => <li key={`${program.title}-${program.schedule}`}><div><strong>{program.title}</strong><small>{program.schedule}</small></div><span className={`analytics-program-fill analytics-program-fill-${program.state}`}>{program.fill}</span></li>)}</ul>}</section>;
}
