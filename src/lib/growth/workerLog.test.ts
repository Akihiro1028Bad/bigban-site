// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildWorkerLogProps,
  currentTargetsFromRuns,
  growthOpsViewFromPages,
  reconcileFindingFromPage,
  workerRunFromPage,
  workerStatusFromRuns,
} from "./workerLog";
import type { NotionPage } from "./notion";

function page(id: string, properties: NotionPage["properties"]): NotionPage {
  return { id, url: "", properties };
}

function runPage(over: Partial<Record<string, unknown>> = {}): NotionPage {
  return page("r1", {
    "名前": { title: [{ plain_text: "advise running" }] },
    "種別": { select: { name: "job" } },
    "ステータス": { select: { name: "running" } },
    "モード": { rich_text: [{ plain_text: "advise" }] },
    "対象ページID": { rich_text: [{ plain_text: "page-1" }] },
    "対象タイトル": { rich_text: [{ plain_text: "東京で行われたPPAアジアについての記事を書く" }] },
    "対象種別": { select: { name: "article" } },
    "開始時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
    "記録時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
    ...over,
  });
}

describe("workerRunFromPage", () => {
  it("Notionページから現在処理対象を読める run view を作る", () => {
    expect(workerRunFromPage(runPage(), Date.parse("2026-07-08T10:03:00.000Z"))).toMatchObject({
      id: "r1",
      mode: "advise",
      status: "running",
      targetPageId: "page-1",
      targetTitle: "東京で行われたPPAアジアについての記事を書く",
      targetType: "article",
      elapsedMs: 180_000,
    });
  });

  it("欠落・不正値は安全な既定値へ落とす", () => {
    expect(
      workerRunFromPage(
        page("bad", {
          "名前": { title: [{ plain_text: "fallback detail" }] },
          "ステータス": { select: { name: "unknown-status" } },
          "対象種別": { select: { name: "bad-type" } },
          "開始時刻": { date: { start: "bad-date" } },
          "終了時刻": { date: { start: "also-bad" } },
          "終了コード": { number: null },
        }),
        Date.parse("2026-07-08T10:03:00.000Z")
      )
    ).toMatchObject({
      mode: "",
      status: "skipped",
      targetPageId: null,
      targetTitle: null,
      targetType: "system",
      elapsedMs: null,
      exitCode: null,
      detail: "fallback detail",
    });
  });

  it("processName fallback・完了時刻・任意項目を読む", () => {
    expect(
      workerRunFromPage(
        runPage({
          "モード": { rich_text: [] },
          "処理名": { rich_text: [{ plain_text: "publish-due" }] },
          "ステータス": { select: { name: "success" } },
          "対象種別": { select: { name: "proposal" } },
          "終了時刻": { date: { start: "2026-07-08T10:02:00.000Z" } },
          "終了コード": { number: 0 },
          "再開コマンド": { rich_text: [{ plain_text: "npm run growth:publish-due" }] },
          "詳細": { rich_text: [{ plain_text: "done" }] },
        }),
        Date.parse("2026-07-08T10:05:00.000Z")
      )
    ).toMatchObject({
      mode: "publish-due",
      status: "success",
      targetType: "proposal",
      elapsedMs: 120_000,
      exitCode: 0,
      resumeCommand: "npm run growth:publish-due",
      detail: "done",
    });
  });

  it("elapsed は終了時刻が開始時刻より前なら 0 に丸め、終了時刻不正なら null", () => {
    expect(
      workerRunFromPage(
        runPage({
          "開始時刻": { date: { start: "2026-07-08T10:03:00.000Z" } },
          "終了時刻": { date: { start: "2026-07-08T10:02:00.000Z" } },
        }),
        Date.parse("2026-07-08T10:05:00.000Z")
      ).elapsedMs
    ).toBe(0);
    expect(
      workerRunFromPage(
        runPage({
          "終了時刻": { date: { start: "bad-date" } },
        }),
        Date.parse("2026-07-08T10:05:00.000Z")
      ).elapsedMs
    ).toBeNull();
  });

  it("nowMs 未指定でも実行中 run を作り、詳細 fallback が空なら null にする", () => {
    const run = workerRunFromPage(
      page("no-detail", {
        "名前": { title: [] },
        "ステータス": { select: { name: "running" } },
        "開始時刻": { date: { start: new Date(Date.now() - 1_000).toISOString() } },
      })
    );

    expect(run.status).toBe("running");
    expect(run.detail).toBeNull();
    expect(typeof run.elapsedMs).toBe("number");
  });
});

describe("currentTargetsFromRuns", () => {
  it("running の run だけ CurrentWorkerTarget にする", () => {
    const runs = [
      workerRunFromPage(runPage(), Date.parse("2026-07-08T10:03:00.000Z")),
      workerRunFromPage(
        runPage({ "ステータス": { select: { name: "success" } } }),
        Date.parse("2026-07-08T10:03:00.000Z")
      ),
    ];
    expect(currentTargetsFromRuns(runs, Date.parse("2026-07-08T10:05:00.000Z"))).toEqual([
      expect.objectContaining({
        targetTitle: "東京で行われたPPAアジアについての記事を書く",
        mode: "advise",
        status: "running",
        elapsedMs: 300_000,
      }),
    ]);
  });

  it("nowMs 未指定でも running run を現在処理対象にできる", () => {
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    const targets = currentTargetsFromRuns([
      workerRunFromPage(runPage({ "開始時刻": { date: { start: startedAt } } })),
    ]);

    expect(targets).toEqual([
      expect.objectContaining({
        status: "running",
        elapsedMs: expect.any(Number),
      }),
    ]);
  });
});

describe("workerStatusFromRuns", () => {
  it("heartbeat が無ければ unknown", () => {
    expect(workerStatusFromRuns([])).toEqual({
      status: "unknown",
      workerId: null,
      lastHeartbeatAt: null,
      currentJob: null,
    });
  });

  it("heartbeat が stale 閾値以内なら healthy", () => {
    const heartbeat = workerRunFromPage(
      runPage({
        "ステータス": { select: { name: "heartbeat" } },
        "記録時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
      }),
      Date.parse("2026-07-08T10:05:00.000Z")
    );
    expect(workerStatusFromRuns([heartbeat], Date.parse("2026-07-08T10:05:00.000Z"))).toMatchObject({
      status: "healthy",
      lastHeartbeatAt: "2026-07-08T10:00:00.000Z",
    });
  });

  it("heartbeat が古ければ stale", () => {
    const heartbeat = workerRunFromPage(
      runPage({
        "ステータス": { select: { name: "heartbeat" } },
        "記録時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
      }),
      Date.parse("2026-07-08T10:20:01.000Z")
    );
    expect(workerStatusFromRuns([heartbeat], Date.parse("2026-07-08T10:20:01.000Z")).status).toBe("stale");
  });

  it("heartbeat の recordedAt が無ければ startedAt を使い、不正日時は stale", () => {
    const heartbeat = workerRunFromPage(
      runPage({
        "ステータス": { select: { name: "heartbeat" } },
        "記録時刻": { date: null },
        "開始時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
      }),
      Date.parse("2026-07-08T10:01:00.000Z")
    );
    expect(workerStatusFromRuns([heartbeat], Date.parse("2026-07-08T10:01:00.000Z")).status).toBe("healthy");

    const invalid = workerRunFromPage(
      runPage({
        "ステータス": { select: { name: "heartbeat" } },
        "記録時刻": { date: { start: "bad-date" } },
      }),
      Date.parse("2026-07-08T10:01:00.000Z")
    );
    expect(workerStatusFromRuns([invalid], Date.parse("2026-07-08T10:01:00.000Z"))).toMatchObject({
      status: "stale",
      workerId: "advise running",
      currentJob: null,
    });

    const emptyDetail = workerRunFromPage(
      page("heartbeat-empty", {
        "名前": { title: [] },
        "ステータス": { select: { name: "heartbeat" } },
        "記録時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
      }),
      Date.parse("2026-07-08T10:01:00.000Z")
    );
    expect(workerStatusFromRuns([emptyDetail], Date.parse("2026-07-08T10:01:00.000Z")).workerId).toBeNull();
  });

  it("running run があれば currentJob を返す", () => {
    const heartbeat = workerRunFromPage(
      runPage({
        "ステータス": { select: { name: "heartbeat" } },
        "詳細": { rich_text: [{ plain_text: "worker-1" }] },
      }),
      Date.parse("2026-07-08T10:05:00.000Z")
    );
    const running = workerRunFromPage(runPage(), Date.parse("2026-07-08T10:05:00.000Z"));
    expect(workerStatusFromRuns([heartbeat, running], Date.parse("2026-07-08T10:05:00.000Z"))).toMatchObject({
      workerId: "worker-1",
      currentJob: "advise",
    });
  });
});

describe("reconcileFindingFromPage", () => {
  it("severity と対象情報を Notion ページから読む", () => {
    expect(
      reconcileFindingFromPage(
        page("f1", {
          "名前": { title: [{ plain_text: "fallback" }] },
          "種別": { select: { name: "error" } },
          "対象ページID": { rich_text: [{ plain_text: "page-1" }] },
          "対象タイトル": { rich_text: [{ plain_text: "記事A" }] },
          "詳細": { rich_text: [{ plain_text: "本文ミラー欠落" }] },
          "記録時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
        })
      )
    ).toEqual({
      id: "f1",
      targetPageId: "page-1",
      targetTitle: "記事A",
      severity: "error",
      detail: "本文ミラー欠落",
      recordedAt: "2026-07-08T10:00:00.000Z",
    });
  });

  it("未知 severity は warning にし、詳細が空なら title に fallback する", () => {
    expect(
      reconcileFindingFromPage(
        page("f2", {
          "名前": { title: [{ plain_text: undefined }, { plain_text: "title fallback" }] },
          "種別": { select: { name: "critical" } },
          "対象ページID": { rich_text: [{ plain_text: undefined }] },
          "対象タイトル": { rich_text: [] },
          "詳細": { rich_text: [] },
        })
      )
    ).toMatchObject({
      targetPageId: null,
      targetTitle: null,
      severity: "warning",
      detail: "title fallback",
      recordedAt: null,
    });
    expect(reconcileFindingFromPage(page("f3", { "種別": { select: { name: "info" } } }))).toMatchObject({
      severity: "info",
      detail: "",
    });
  });
});

describe("growthOpsViewFromPages", () => {
  it("recentRuns/currentTargets/failures/reconcile をまとめる", () => {
    const view = growthOpsViewFromPages(
      [
        runPage(),
        runPage({ "ステータス": { select: { name: "failed" } }, "詳細": { rich_text: [{ plain_text: "Codex failed" }] } }),
        runPage({ "ステータス": { select: { name: "reconcile" } }, "種別": { select: { name: "warning" } }, "詳細": { rich_text: [{ plain_text: "修正案ありだが未提示" }] } }),
      ],
      Date.parse("2026-07-08T10:03:00.000Z")
    );

    expect(view.currentTargets).toHaveLength(1);
    expect(view.recentFailures).toHaveLength(1);
    expect(view.reconcileFindings).toEqual([
      expect.objectContaining({ severity: "warning", detail: "修正案ありだが未提示" }),
    ]);
  });
});

describe("buildWorkerLogProps", () => {
  it("Notion書き込み用プロパティを組み立てる", () => {
    expect(
      buildWorkerLogProps({
        name: "advise running",
        kind: "job",
        status: "running",
        mode: "advise",
        workerId: "mac-mini",
        targetPageId: "page-1",
        targetTitle: "記事",
        targetType: "article",
        startedAt: "2026-07-08T10:00:00.000Z",
        recordedAt: "2026-07-08T10:00:00.000Z",
      })
    ).toMatchObject({
      "名前": { title: [{ text: { content: "advise running" } }] },
      "ステータス": { select: { name: "running" } },
      "対象タイトル": { rich_text: [{ text: { content: "記事" } }] },
    });
  });

  it("未指定の任意項目は空文字/null/system にする", () => {
    expect(
      buildWorkerLogProps({
        name: "heartbeat",
        kind: "worker",
        status: "heartbeat",
        mode: "heartbeat",
        workerId: "mac-mini",
        recordedAt: "2026-07-08T10:00:00.000Z",
        finishedAt: "2026-07-08T10:00:01.000Z",
      })
    ).toMatchObject({
      "対象ページID": { rich_text: [] },
      "対象タイトル": { rich_text: [] },
      "対象種別": { select: { name: "system" } },
      "開始時刻": { date: null },
      "終了時刻": { date: { start: "2026-07-08T10:00:01.000Z" } },
      "終了コード": { number: null },
      "再開コマンド": { rich_text: [] },
      "詳細": { rich_text: [] },
      "証跡キー": { rich_text: [] },
    });
  });
});
