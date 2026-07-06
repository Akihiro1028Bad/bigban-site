export interface DaemonJob {
  name: string;
  script: string;
  everyMs: number;
}

const PULL_DEFAULT_MS = 60_000;
const PUBLISH_DEFAULT_MS = 300_000;
const STALL_DEFAULT_MS = 900_000;

const PULL_JOBS: Omit<DaemonJob, "everyMs">[] = [
  { name: "revise", script: "growth:revise-loop" },
  { name: "regen", script: "growth:regen-loop" },
  { name: "regen-body", script: "growth:regen-body-loop" },
  { name: "advise", script: "growth:advise-loop" },
  { name: "decorate", script: "growth:decorate-loop" },
  { name: "advise-apply", script: "growth:advise-apply-loop" },
  { name: "comment-revise", script: "growth:comment-revise-loop" },
];

function positiveMs(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildJobs(env: Record<string, string | undefined>): DaemonJob[] {
  const pullEveryMs = positiveMs(env.GROWTH_DAEMON_PULL_EVERY_MS, PULL_DEFAULT_MS);
  const publishEveryMs = positiveMs(env.GROWTH_DAEMON_PUBLISH_EVERY_MS, PUBLISH_DEFAULT_MS);
  const stallEveryMs = positiveMs(env.GROWTH_DAEMON_STALL_EVERY_MS, STALL_DEFAULT_MS);

  return [
    ...PULL_JOBS.map((job) => ({ ...job, everyMs: pullEveryMs })),
    { name: "publish-due", script: "growth:publish-due", everyMs: publishEveryMs },
    { name: "stall-check", script: "growth:stall-check", everyMs: stallEveryMs },
  ];
}

export function selectDueJobs(
  jobs: readonly DaemonJob[],
  lastRun: Readonly<Record<string, number>>,
  now: number
): DaemonJob[] {
  return jobs.filter((job) => lastRun[job.name] === undefined || now - lastRun[job.name] >= job.everyMs);
}

export function msUntilNextDue(
  jobs: readonly DaemonJob[],
  lastRun: Readonly<Record<string, number>>,
  now: number
): number {
  if (selectDueJobs(jobs, lastRun, now).length > 0) return 0;
  if (jobs.length === 0) return 0;
  return Math.min(...jobs.map((job) => job.everyMs - (now - lastRun[job.name])));
}
