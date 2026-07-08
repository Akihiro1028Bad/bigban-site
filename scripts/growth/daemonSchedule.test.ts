import { describe, expect, it } from "vitest";

import { buildJobs, msUntilNextDue, selectDueJobs, type DaemonJob } from "./daemonSchedule";

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
  it("既定で9ジョブと script 名・間隔を返す", () => {
    expect(buildJobs({})).toEqual([
      { name: "revise", script: "growth:revise-loop", everyMs: 60_000 },
      { name: "regen", script: "growth:regen-loop", everyMs: 60_000 },
      { name: "regen-body", script: "growth:regen-body-loop", everyMs: 60_000 },
      { name: "advise", script: "growth:advise-loop", everyMs: 60_000 },
      { name: "decorate", script: "growth:decorate-loop", everyMs: 60_000 },
      { name: "advise-apply", script: "growth:advise-apply-loop", everyMs: 60_000 },
      { name: "comment-revise", script: "growth:comment-revise-loop", everyMs: 60_000 },
      { name: "publish-due", script: "growth:publish-due", everyMs: 300_000 },
      { name: "stall-check", script: "growth:stall-check", everyMs: 900_000 },
    ]);
  });

  it("GROWTH_DRAFTS_AUTO=1 の時だけ下書き自動生成ジョブを追加する", () => {
    const built = buildJobs({ GROWTH_DRAFTS_AUTO: "1" });

    expect(built).toContainEqual({
      name: "drafts-auto",
      script: "growth:drafts-auto",
      everyMs: 300_000,
    });
  });

  it("下書き自動生成ジョブの間隔を GROWTH_DAEMON_DRAFTS_EVERY_MS で上書きする", () => {
    const built = buildJobs({
      GROWTH_DRAFTS_AUTO: "1",
      GROWTH_DAEMON_DRAFTS_EVERY_MS: "600000",
    });

    expect(built.find((job) => job.name === "drafts-auto")?.everyMs).toBe(600_000);
  });

  it("pull 系の間隔だけ GROWTH_DAEMON_PULL_EVERY_MS で上書きする", () => {
    const built = buildJobs({ GROWTH_DAEMON_PULL_EVERY_MS: "30000" });

    expect(built.slice(0, 7).map((job) => job.everyMs)).toEqual(Array(7).fill(30_000));
    expect(built[7]).toEqual({ name: "publish-due", script: "growth:publish-due", everyMs: 300_000 });
    expect(built[8]).toEqual({ name: "stall-check", script: "growth:stall-check", everyMs: 900_000 });
  });

  it("publish/stall の間隔をそれぞれ環境変数で上書きする", () => {
    const built = buildJobs({
      GROWTH_DAEMON_PUBLISH_EVERY_MS: "120000",
      GROWTH_DAEMON_STALL_EVERY_MS: "600000",
    });

    expect(built[7]?.everyMs).toBe(120_000);
    expect(built[8]?.everyMs).toBe(600_000);
  });

  it("不正値は既定にフォールバックする", () => {
    const built = buildJobs({
      GROWTH_DAEMON_PULL_EVERY_MS: "abc",
      GROWTH_DAEMON_PUBLISH_EVERY_MS: "0",
      GROWTH_DAEMON_STALL_EVERY_MS: "-5",
    });

    expect(built.slice(0, 7).map((job) => job.everyMs)).toEqual(Array(7).fill(60_000));
    expect(built[7]?.everyMs).toBe(300_000);
    expect(built[8]?.everyMs).toBe(900_000);
  });
});
