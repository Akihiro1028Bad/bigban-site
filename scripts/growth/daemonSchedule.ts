export interface DaemonJob {
  name: string;
  script: string;
  everyMs: number;
  shouldRunOnStart?: boolean;
}

const PULL_DEFAULT_MS = 60_000;
const DRAFTS_DEFAULT_MS = 300_000;
const INITIATIVES_DEFAULT_MS = 300_000;
const PUBLISH_DEFAULT_MS = 300_000;
const STALL_DEFAULT_MS = 900_000;
const METRICS_DEFAULT_MS = 86_400_000;
const REVIEW_DEFAULT_MS = 604_800_000;
const FAILURE_RETRY_MS = 300_000;

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

function isAutoDetectionEnabled(value: string | undefined): boolean {
  return value !== "0";
}

export function buildJobs(env: Record<string, string | undefined>): DaemonJob[] {
  const pullEveryMs = positiveMs(env.GROWTH_DAEMON_PULL_EVERY_MS, PULL_DEFAULT_MS);
  const draftsEveryMs = positiveMs(env.GROWTH_DAEMON_DRAFTS_EVERY_MS, DRAFTS_DEFAULT_MS);
  const initiativesEveryMs = positiveMs(
    env.GROWTH_DAEMON_INITIATIVES_EVERY_MS,
    INITIATIVES_DEFAULT_MS
  );
  const publishEveryMs = positiveMs(env.GROWTH_DAEMON_PUBLISH_EVERY_MS, PUBLISH_DEFAULT_MS);
  const stallEveryMs = positiveMs(env.GROWTH_DAEMON_STALL_EVERY_MS, STALL_DEFAULT_MS);
  const metricsEveryMs = positiveMs(env.GROWTH_DAEMON_METRICS_EVERY_MS, METRICS_DEFAULT_MS);
  const reviewEveryMs = positiveMs(env.GROWTH_DAEMON_REVIEW_EVERY_MS, REVIEW_DEFAULT_MS);
  const draftsAutoJobs =
    isAutoDetectionEnabled(env.GROWTH_DRAFTS_AUTO)
      ? [{ name: "drafts-auto", script: "growth:drafts-auto", everyMs: draftsEveryMs }]
      : [];
  const initiativesAutoJobs =
    isAutoDetectionEnabled(env.GROWTH_INITIATIVES_AUTO)
      ? [{ name: "initiatives-auto", script: "growth:initiatives-auto", everyMs: initiativesEveryMs }]
      : [];

  return [
    ...PULL_JOBS.map((job) => ({ ...job, everyMs: pullEveryMs })),
    ...draftsAutoJobs,
    ...initiativesAutoJobs,
    { name: "publish-due", script: "growth:publish-due", everyMs: publishEveryMs },
    { name: "stall-check", script: "growth:stall-check", everyMs: stallEveryMs },
    {
      name: "metrics",
      script: "growth:metrics",
      everyMs: metricsEveryMs,
      shouldRunOnStart: false,
    },
    {
      name: "review-due",
      script: "growth:review-due",
      everyMs: reviewEveryMs,
      shouldRunOnStart: false,
    },
    {
      name: "proposal-review-due",
      script: "growth:proposal-review-due",
      everyMs: reviewEveryMs,
      shouldRunOnStart: false,
    },
  ];
}

export function buildInitialLastRun(
  jobs: readonly DaemonJob[],
  now: number
): Record<string, number> {
  return Object.fromEntries(
    jobs.filter((job) => job.shouldRunOnStart === false).map((job) => [job.name, now])
  );
}

export function restoreLastRun(
  jobs: readonly DaemonJob[],
  stored: unknown,
  now: number
): Record<string, number> {
  const restored = buildInitialLastRun(jobs, now);
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return restored;

  const values = stored as Record<string, unknown>;
  for (const job of jobs) {
    const value = values[job.name];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      restored[job.name] = value;
    }
  }
  return restored;
}

export function lastRunAfterAttempt(
  job: DaemonJob,
  finishedAt: number,
  isSuccessful: boolean
): number {
  if (isSuccessful) return finishedAt;
  const retryMs = Math.min(job.everyMs, FAILURE_RETRY_MS);
  return Math.max(0, finishedAt - job.everyMs + retryMs);
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
