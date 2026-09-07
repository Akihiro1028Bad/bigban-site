// @vitest-environment node
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
let root: string;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "pbt-analysis-cli-")));
  const destination = join(root, "scripts/analytics");
  await mkdir(destination, { recursive: true });
  for (const file of ["query.mjs", "monitoring.mjs", "articleMetrics.mjs", "ctaEvents.mjs"]) {
    await copyFile(resolve("scripts/analytics", file), join(destination, file));
  }
});
afterAll(() => rm(root, { recursive: true, force: true }));
function run(args: string[], failure = "") {
  return execute(process.execPath, ["--import", resolve("scripts/analytics/fixtures/mockGoogle.mjs"), join(root, "scripts/analytics/query.mjs"), ...args], {
    timeout: 10000,
    env: { NODE_ENV: "test", PATH: process.env.PATH, GROWTH_GOOGLE_CLIENT_ID: "test", GROWTH_GOOGLE_CLIENT_SECRET: "test", GROWTH_GOOGLE_REFRESH_TOKEN: "test", GROWTH_GA4_PROPERTY_ID: "123", GROWTH_GSC_SITE_URL: "https://example.test", TEST_GOOGLE_FAILURE: failure },
  });
}
describe("分析CLI（実際の.env.localを読まずMSWでAPIを再現）", () => {
  it("監視専用JSONは前期値を含み、GSC失敗に依存しない", async () => {
    const { stdout } = await run(["--days", "1", "--prev-offset", "7", "--monitor-only", "--json"], "gsc");
    const report = JSON.parse(stdout);
    expect(report.metrics.find((r: { name: string }) => r.name === "reservation_click")).toMatchObject({ current: 30, previous: 10 });
    expect(report.periods.current.startDate).not.toBe(report.periods.previous.startDate);
  });
  it("監視失敗でもJSONを残し非ゼロ終了する", async () => {
    await expect(run(["--monitor-only", "--json"], "ga4")).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('"current":null') });
  });
  it("通常の月次出力にも比較値とクリック回数の単位を載せる", async () => {
    const { stdout } = await run(["--days", "28"]);
    expect(stdout).toContain("reservation_click  今期=30 前期=10 (+200%)");
    expect(stdout).toContain("100PVあたり");
  });
  it("不正な組み合わせはAPIを呼ぶ前に拒否する", async () => {
    await expect(run(["--json"])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("--monitor-only") });
  });
});
