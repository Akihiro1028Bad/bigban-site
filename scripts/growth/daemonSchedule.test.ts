import { describe, expect, it } from "vitest";

import {
  buildInitialLastRun,
  buildJobs,
  lastRunAfterAttempt,
  msUntilNextDue,
  restoreLastRun,
  selectDueJobs,
  type DaemonJob,
} from "./daemonSchedule";

const jobs: DaemonJob[] = [
  { name: "fast", script: "growth:fast", everyMs: 1_000 },
  { name: "slow", script: "growth:slow", everyMs: 5_000 },
];

describe("selectDueJobs", () => {
  it("lastRun が空なら全ジョブを due にする", () => {
    expect(selectDueJobs(jobs, {}, 10_000)).toEqual(jobs);
  });

  it("全ジョブが直近実行済みなら due は空", () => {
    expect(selectDueJobs(jobs, { fast: 9_500, slow: 6_000 }, 10_000)).toEqual([]);
  });

  it("間隔が経過した一部だけを due にする", () => {
    expect(selectDueJobs(jobs, { fast: 8_999, slow: 6_000 }, 10_000)).toEqual([jobs[0]]);
  });

  it("ちょうど everyMs 経過したジョブは due にする", () => {
    expect(selectDueJobs(jobs, { fast: 9_000, slow: 5_000 }, 10_000)).toEqual(jobs);
  });
});

describe("lastRunAfterAttempt", () => {
  it("成功時は完了時刻を通常の最終実行時刻にする", () => {
    const job: DaemonJob = { name: "metrics", script: "growth:metrics", everyMs: 86_400_000 };

    expect(lastRunAfterAttempt(job, 100_000_000, true)).toBe(100_000_000);
  });

  it("長周期ジョブの失敗時は5分後に再試行可能な時刻へ補正する", () => {
    const job: DaemonJob = { name: "review", script: "growth:review", everyMs: 604_800_000 };
    const finishedAt = 700_000_000;
    const lastRun = lastRunAfterAttempt(job, finishedAt, false);

    expect(selectDueJobs([job], { review: lastRun }, finishedAt + 299_999)).toEqual([]);
    expect(selectDueJobs([job], { review: lastRun }, finishedAt + 300_000)).toEqual([job]);
  });

  it("通常間隔が5分未満なら失敗時も通常間隔を短縮しない", () => {
    const job: DaemonJob = { name: "pull", script: "growth:pull", everyMs: 60_000 };
    const finishedAt = 1_000_000;
    const lastRun = lastRunAfterAttempt(job, finishedAt, false);

    expect(selectDueJobs([job], { pull: lastRun }, finishedAt + 59_999)).toEqual([]);
    expect(selectDueJobs([job], { pull: lastRun }, finishedAt + 60_000)).toEqual([job]);
  });
});

describe("buildInitialLastRun", () => {
  it("長周期ジョブだけ起動時刻を初回実行時刻として設定する", () => {
    const built: DaemonJob[] = [
      { name: "pull", script: "growth:pull", everyMs: 60_000 },
      { name: "metrics", script: "growth:metrics", everyMs: 86_400_000, shouldRunOnStart: false },
    ];

    expect(buildInitialLastRun(built, 10_000)).toEqual({ metrics: 10_000 });
    expect(selectDueJobs(built, buildInitialLastRun(built, 10_000), 10_000)).toEqual([built[0]]);
  });

  it("保存済み時刻を復元し、未保存の長周期ジョブだけ起動時刻で補う", () => {
    const built: DaemonJob[] = [
      { name: "pull", script: "growth:pull", everyMs: 60_000 },
      { name: "metrics", script: "growth:metrics", everyMs: 86_400_000, shouldRunOnStart: false },
      { name: "review", script: "growth:review", everyMs: 604_800_000, shouldRunOnStart: false },
    ];

    expect(restoreLastRun(built, { pull: 8_000, metrics: 7_000 }, 10_000)).toEqual({
      pull: 8_000,
      metrics: 7_000,
      review: 10_000,
    });
  });

  it("壊れた保存値は無視する", () => {
    const built: DaemonJob[] = [
      { name: "pull", script: "growth:pull", everyMs: 60_000 },
      { name: "metrics", script: "growth:metrics", everyMs: 86_400_000, shouldRunOnStart: false },
    ];

    expect(restoreLastRun(built, { pull: "bad", metrics: -1, removed: 5_000 }, 10_000)).toEqual({
      metrics: 10_000,
    });
    expect(restoreLastRun(built, [], 10_000)).toEqual({ metrics: 10_000 });
  });
});

describe("msUntilNextDue", () => {
  it("今 due のものがあれば 0 を返す", () => {
    expect(msUntilNextDue(jobs, { fast: 9_000, slow: 6_000 }, 10_000)).toBe(0);
  });

  it("全て未達なら最も早く due になるまでの残りを返す", () => {
    expect(msUntilNextDue(jobs, { fast: 9_500, slow: 6_000 }, 10_000)).toBe(500);
  });

  it("ジョブが空なら 0 を返す", () => {
    expect(msUntilNextDue([], {}, 10_000)).toBe(0);
  });
});

describe("buildJobs", () => {
  it("既定で応答ループ・公開・監視・日次計測・週次レビューを返す", () => {
    expect(buildJobs({})).toEqual([
      { name: "revise", script: "growth:revise-loop", everyMs: 60_000 },
      { name: "regen", script: "growth:regen-loop", everyMs: 60_000 },
      { name: "regen-body", script: "growth:regen-body-loop", everyMs: 60_000 },
      { name: "advise", script: "growth:advise-loop", everyMs: 60_000 },
      { name: "decorate", script: "growth:decorate-loop", everyMs: 60_000 },
      { name: "advise-apply", script: "growth:advise-apply-loop", everyMs: 60_000 },
      { name: "comment-revise", script: "growth:comment-revise-loop", everyMs: 60_000 },
      { name: "drafts-auto", script: "growth:drafts-auto", everyMs: 300_000 },
      { name: "initiatives-auto", script: "growth:initiatives-auto", everyMs: 300_000 },
      { name: "publish-due", script: "growth:publish-due", everyMs: 300_000 },
      { name: "stall-check", script: "growth:stall-check", everyMs: 900_000 },
      { name: "metrics", script: "growth:metrics", everyMs: 86_400_000, shouldRunOnStart: false },
      { name: "review-due", script: "growth:review-due", everyMs: 604_800_000, shouldRunOnStart: false },
      {
        name: "proposal-review-due",
        script: "growth:proposal-review-due",
        everyMs: 604_800_000,
        shouldRunOnStart: false,
      },
    ]);
  });

  it("GROWTH_DRAFTS_AUTO 未設定でも下書き対象を自動検知する", () => {
    const built = buildJobs({});

    expect(built).toContainEqual({
      name: "drafts-auto",
      script: "growth:drafts-auto",
      everyMs: 300_000,
    });
  });

  it("GROWTH_INITIATIVES_AUTO 未設定でも施策対象を自動検知する", () => {
    const built = buildJobs({});

    expect(built).toContainEqual({
      name: "initiatives-auto",
      script: "growth:initiatives-auto",
      everyMs: 300_000,
    });
  });

  it("自動検知は環境変数へ0を明示した場合だけ無効にする", () => {
    const built = buildJobs({
      GROWTH_DRAFTS_AUTO: "0",
      GROWTH_INITIATIVES_AUTO: "0",
    });

    expect(built.some((job) => job.name === "drafts-auto")).toBe(false);
    expect(built.some((job) => job.name === "initiatives-auto")).toBe(false);
  });

  it("下書き自動生成ジョブの間隔を GROWTH_DAEMON_DRAFTS_EVERY_MS で上書きする", () => {
    const built = buildJobs({
      GROWTH_DRAFTS_AUTO: "1",
      GROWTH_DAEMON_DRAFTS_EVERY_MS: "600000",
    });

    expect(built.find((job) => job.name === "drafts-auto")?.everyMs).toBe(600_000);
  });

  it("施策自動成果物化ジョブの間隔を GROWTH_DAEMON_INITIATIVES_EVERY_MS で上書きする", () => {
    const built = buildJobs({
      GROWTH_INITIATIVES_AUTO: "1",
      GROWTH_DAEMON_INITIATIVES_EVERY_MS: "600000",
    });

    expect(built.find((job) => job.name === "initiatives-auto")?.everyMs).toBe(600_000);
  });

  it("pull 系の間隔だけ GROWTH_DAEMON_PULL_EVERY_MS で上書きする", () => {
    const built = buildJobs({ GROWTH_DAEMON_PULL_EVERY_MS: "30000" });

    expect(built.slice(0, 7).map((job) => job.everyMs)).toEqual(Array(7).fill(30_000));
    expect(built.find((job) => job.name === "publish-due")).toEqual({
      name: "publish-due",
      script: "growth:publish-due",
      everyMs: 300_000,
    });
    expect(built.find((job) => job.name === "stall-check")).toEqual({
      name: "stall-check",
      script: "growth:stall-check",
      everyMs: 900_000,
    });
  });

  it("publish/stall の間隔をそれぞれ環境変数で上書きする", () => {
    const built = buildJobs({
      GROWTH_DAEMON_PUBLISH_EVERY_MS: "120000",
      GROWTH_DAEMON_STALL_EVERY_MS: "600000",
    });

    expect(built.find((job) => job.name === "publish-due")?.everyMs).toBe(120_000);
    expect(built.find((job) => job.name === "stall-check")?.everyMs).toBe(600_000);
  });

  it("metrics/review の間隔をそれぞれ環境変数で上書きする", () => {
    const built = buildJobs({
      GROWTH_DAEMON_METRICS_EVERY_MS: "3600000",
      GROWTH_DAEMON_REVIEW_EVERY_MS: "86400000",
    });

    expect(built.find((job) => job.name === "metrics")?.everyMs).toBe(3_600_000);
    expect(built.find((job) => job.name === "review-due")?.everyMs).toBe(86_400_000);
    expect(built.find((job) => job.name === "proposal-review-due")?.everyMs).toBe(86_400_000);
  });

  it("不正値は既定にフォールバックする", () => {
    const built = buildJobs({
      GROWTH_DAEMON_PULL_EVERY_MS: "abc",
      GROWTH_DAEMON_PUBLISH_EVERY_MS: "0",
      GROWTH_DAEMON_STALL_EVERY_MS: "-5",
    });

    expect(built.slice(0, 7).map((job) => job.everyMs)).toEqual(Array(7).fill(60_000));
    expect(built.find((job) => job.name === "publish-due")?.everyMs).toBe(300_000);
    expect(built.find((job) => job.name === "stall-check")?.everyMs).toBe(900_000);
  });
});
