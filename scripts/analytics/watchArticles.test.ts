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
  root = await realpath(await mkdtemp(join(tmpdir(), "pbt-article-watch-cli-")));
  const destination = join(root, "scripts/analytics");
  await mkdir(destination, { recursive: true });
  for (const file of ["watchArticles.mjs", "articleWatch.mjs", "articleMetrics.mjs"]) {
    await copyFile(resolve("scripts/analytics", file), join(destination, file));
  }
});
afterAll(() => rm(root, { recursive: true, force: true }));

interface Alert { code: string; path: string; severity: string; detail: Record<string, unknown> }
interface Report {
  today: string;
  sources: { ga4: { ok: boolean; error: string | null }; sitemap: { ok: boolean; count: number; error: string | null }; html: { ok: boolean; fetched: number; error: string | null } };
  articles: { path: string; inSitemap: boolean; entry: Record<string, number | null> | null; http: { status: number | null; retried: boolean; observed: string } }[];
  alerts: Alert[];
}

function run(args: string[], failure = "") {
  return execute(
    process.execPath,
    ["--import", resolve("scripts/analytics/fixtures/mockArticleWatch.mjs"), join(root, "scripts/analytics/watchArticles.mjs"), "--site", "https://example.test", "--retry-wait-ms", "10", ...args],
    {
      timeout: 15000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, GROWTH_GOOGLE_CLIENT_ID: "test", GROWTH_GOOGLE_CLIENT_SECRET: "test", GROWTH_GOOGLE_REFRESH_TOKEN: "test", GROWTH_GA4_PROPERTY_ID: "123", GROWTH_GSC_SITE_URL: "https://example.test", TEST_WATCH_FAILURE: failure },
    },
  );
}
const codes = (report: Report) => report.alerts.map((a) => `${a.code}:${a.path}`);

describe("記事ウォッチ CLI(実 API を叩かず MSW で再現)", () => {
  it("正常: G1・H1・H2 を検知し、全ソース ok で終了コード0", async () => {
    const { stdout } = await run(["--json"]);
    const report = JSON.parse(stdout) as Report;
    expect(report.sources).toEqual({ ga4: { ok: true, error: null }, sitemap: { ok: true, count: 4, error: null }, html: { ok: true, fetched: 4, error: null } });
    expect(codes(report)).toEqual(["G1:/columns/spike", "H1:/news/expired-event", "H2:/news/expired-event"]);
    expect(report.articles.find((a) => a.path === "/columns/spike")?.entry).toMatchObject({ last7: 140, prev7: 35 });
    expect(report.articles.every((a) => a.http.observed === "ok" && a.http.retried === false)).toBe(true);
  });
  it("テキスト出力は alerts を1行ずつ並べる", async () => {
    const { stdout } = await run([]);
    expect(stdout).toContain("# 記事ウォッチ ");
    expect(stdout).toContain("G1) columns/spike [中]");
  });
  it("GA4 失敗: entry は null、G は付かず、H は判定し、終了コード1", async () => {
    await expect(run(["--json"], "ga4")).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('"ga4":{"ok":false') });
    const { stdout } = await run(["--json"], "ga4").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.every((a) => a.entry === null)).toBe(true);
    expect(codes(report)).toEqual(["H1:/news/expired-event", "H2:/news/expired-event"]);
  });
  it("sitemap 失敗: 記事0件で終了コード1", async () => {
    const { stdout } = await run(["--json"], "sitemap").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.sources.sitemap).toMatchObject({ ok: false, count: 0 });
    expect(report.articles).toEqual([]);
  });
  it("記事 500 が再試行でも続く: I を最優先で先頭に置く", async () => {
    const { stdout } = await run(["--json"], "html500").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.find((a) => a.path === "/columns/steady")?.http).toEqual({ status: 500, retried: true, observed: "error" });
    expect(codes(report)[0]).toBe("I:/columns/steady");
    expect(report.sources.html.ok).toBe(false);
  });
  it("500 → 200 で復帰: retried は true だが alert は付かない", async () => {
    const { stdout } = await run(["--json"], "html500-once");
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.find((a) => a.path === "/columns/steady")?.http).toEqual({ status: 200, retried: true, observed: "ok" });
    expect(codes(report)).not.toContain("I:/columns/steady");
  });
  it("接続不能: 観測不能として I を付けず、html を取得不可にして終了コード1", async () => {
    const { stdout } = await run(["--json"], "html000").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.find((a) => a.path === "/columns/steady")?.http).toEqual({ status: null, retried: true, observed: "unreachable" });
    expect(codes(report)).not.toContain("I:/columns/steady");
    expect(report.sources.html).toMatchObject({ ok: false, error: expect.stringContaining("unreachable: /columns/steady") });
  });
  it("ソフト404(200 だが記事本文が無い): I を最優先で付ける", async () => {
    const { stdout } = await run(["--json"], "soft404");
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.find((a) => a.path === "/columns/steady")?.http).toEqual({ status: 200, retried: false, observed: "ok" });
    expect(report.alerts[0]).toEqual({ code: "I", path: "/columns/steady", severity: "最優先", detail: { status: 200, reason: "記事本文なし（ソフト404）" } });
  });
  it("sitemap に無く流入がある記事: S を付け、/en/ は除外し、上限超過は sitemap.error に回す", async () => {
    const { stdout } = await run(["--json"], "unlisted");
    const report = JSON.parse(stdout) as Report;
    expect(report.alerts.find((a) => a.path === "/columns/ghost-article")).toEqual({
      code: "S", path: "/columns/ghost-article", severity: "中", detail: { last7: 21, prev7: 21, page: "missing", status: 200 },
    });
    expect(report.alerts.find((a) => a.path === "/columns/ghost-0")).toMatchObject({ code: "S", severity: "低", detail: { page: "ok" } });
    expect(report.alerts.some((a) => a.path.startsWith("/en/"))).toBe(false);
    expect(report.articles.find((a) => a.path === "/columns/ghost-article")?.inSitemap).toBe(false);
    expect(report.articles.filter((a) => a.inSitemap === false)).toHaveLength(10);
    expect(report.sources.sitemap.error).toBe("sitemap 外の記事が10本を超えたため未確認: /columns/ghost-9, /columns/ghost-10");
    expect(report.sources.html).toEqual({ ok: true, fetched: 4, error: null });
  });
  it("不正な引数は API を呼ぶ前に拒否する(同じオプションは後勝ち)", async () => {
    await expect(run(["--retry-wait-ms", "abc"])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("--retry-wait-ms") });
    await expect(run(["--site", "https://example.test/path"])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("--site") });
  });
});
