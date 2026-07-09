// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { reconcileGrowthState } from "./reconcile";
import type { PendingItem } from "./approve";
import type { WorkerRunView } from "./workerLog";

function item(over: Partial<PendingItem>): PendingItem {
  return {
    id: "i1",
    kind: "idea",
    title: "記事A",
    subtitle: "",
    details: [],
    score: 0,
    stage: "proposed",
    ...over,
  };
}

function run(over: Partial<WorkerRunView>): WorkerRunView {
  return {
    id: "r1",
    mode: "revise",
    status: "running",
    targetPageId: "i1",
    targetTitle: "記事A",
    targetType: "article",
    startedAt: "2026-07-08T10:00:00.000Z",
    finishedAt: null,
    recordedAt: "2026-07-08T10:00:00.000Z",
    elapsedMs: null,
    exitCode: null,
    resumeCommand: null,
    detail: null,
    ...over,
  };
}

describe("reconcileGrowthState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("依頼中なのに直近 worker 実行がない activity を検出する", () => {
    const findings = reconcileGrowthState(
      [
        item({
          activities: [
            {
              kind: "revise",
              status: "requested",
              label: "構成案修正",
              requestedAtMs: null,
              updatedAtMs: null,
              hasResult: false,
              summary: null,
            },
          ],
        }),
      ],
      [],
      Date.parse("2026-07-08T10:40:00.000Z")
    );
    expect(findings).toEqual([
      expect.objectContaining({
        targetTitle: "記事A",
        detail: "構成案修正 が 依頼中 ですが、直近の worker 実行履歴がありません。",
      }),
    ]);
  });

  it("直近 worker 実行があれば依頼中 activity は検出しない", () => {
    const findings = reconcileGrowthState(
      [
        item({
          activities: [
            {
              kind: "revise",
              status: "running",
              label: "構成案修正",
              requestedAtMs: null,
              updatedAtMs: null,
              hasResult: false,
              summary: null,
            },
          ],
        }),
      ],
      [run({})],
      Date.parse("2026-07-08T10:10:00.000Z")
    );
    expect(findings).toEqual([]);
  });

  it("recordedAt のみの直近 worker 実行も activity に対応する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T10:10:00.000Z"));

    const findings = reconcileGrowthState(
      [
        item({
          activities: [
            {
              kind: "revise",
              status: "requested",
              label: "構成案修正",
              requestedAtMs: null,
              updatedAtMs: null,
              hasResult: false,
              summary: null,
            },
          ],
        }),
      ],
      [run({ startedAt: null, recordedAt: "2026-07-08T10:05:00.000Z" })]
    );

    expect(findings).toEqual([]);
  });

  it("別ページの worker 実行は activity 対応として扱わない", () => {
    const findings = reconcileGrowthState(
      [
        item({
          activities: [
            {
              kind: "revise",
              status: "requested",
              label: "構成案修正",
              requestedAtMs: null,
              updatedAtMs: null,
              hasResult: false,
              summary: null,
            },
          ],
        }),
      ],
      [run({ targetPageId: "other" })],
      Date.parse("2026-07-08T10:10:00.000Z")
    );

    expect(findings).toHaveLength(1);
  });

  it("提示中/失敗の結果あり activity は不整合にしない", () => {
    const findings = reconcileGrowthState(
      [
        item({
          activities: [
            {
              kind: "revise",
              status: "presented",
              label: "構成案修正",
              requestedAtMs: null,
              updatedAtMs: null,
              hasResult: true,
              summary: "案",
            },
            {
              kind: "decorate",
              status: "failed",
              label: "装飾提案",
              requestedAtMs: null,
              updatedAtMs: null,
              hasResult: true,
              summary: "失敗",
            },
          ],
        }),
      ],
      [],
      Date.parse("2026-07-08T10:10:00.000Z")
    );

    expect(findings).toEqual([]);
  });

  it("結果ありだが提示中/失敗でない activity を検出する", () => {
    const findings = reconcileGrowthState(
      [
        item({
          activities: [
            {
              kind: "decorate",
              status: "running",
              label: "装飾提案",
              requestedAtMs: null,
              updatedAtMs: null,
              hasResult: true,
              summary: "提案",
            },
          ],
        }),
      ],
      [run({ startedAt: null, recordedAt: null }), run({ startedAt: "bad-date", recordedAt: null })],
      Date.parse("2026-07-08T10:10:00.000Z")
    );
    expect(findings.map((f) => f.detail)).toEqual([
      "装飾提案 が 処理中 ですが、直近の worker 実行履歴がありません。",
      "装飾提案 の結果がありますが、提示中/失敗として表示されていません。",
    ]);
  });

  it("予約時刻超過・本文ミラー欠落・成果物リンク欠落を検出する", () => {
    const findings = reconcileGrowthState(
      [
        item({ scheduledAtMs: Date.parse("2026-07-08T09:00:00.000Z"), stage: "drafted" }),
        item({ id: "i2", title: "記事B", isDraftReady: true, contentId: "c1", hasDraftBody: false }),
        item({ id: "p1", kind: "proposal", title: "施策A", stage: "completed" }),
      ],
      [],
      Date.parse("2026-07-08T10:00:00.000Z")
    );
    expect(findings.map((f) => f.detail)).toEqual([
      "公開予約時刻を過ぎていますが、記事が公開済みではありません。",
      "下書きIDがありますが、下書き本文HTMLのミラーが空です。",
      "成果物化済みですが、成果物リンクがありません。",
    ]);
  });
});
