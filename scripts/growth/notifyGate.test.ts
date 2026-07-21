// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import {
  FAILURE_LOG_PATH,
  FAILURE_WINDOW_MS,
  appendFailureLog,
  buildFailureSummaryLine,
  countRecentFailures,
  formatFailureLogEntry,
  resolveNotifyLevel,
  shouldPushLine,
} from "./notifyGate";

describe("resolveNotifyLevel", () => {
  it("未設定や未知値は weekly-only にする", () => {
    expect(resolveNotifyLevel({})).toBe("weekly-only");
    expect(resolveNotifyLevel({ GROWTH_NOTIFY_LEVEL: "quiet" })).toBe("weekly-only");
  });

  it("all / normal / verbose は大文字小文字を問わず all にする", () => {
    expect(resolveNotifyLevel({ GROWTH_NOTIFY_LEVEL: "all" })).toBe("all");
    expect(resolveNotifyLevel({ GROWTH_NOTIFY_LEVEL: "NORMAL" })).toBe("all");
    expect(resolveNotifyLevel({ GROWTH_NOTIFY_LEVEL: "Verbose" })).toBe("all");
  });
});

describe("shouldPushLine", () => {
  it("weekly-only では weekly と critical timeout だけ送信する", () => {
    expect(shouldPushLine("weekly", "weekly-only")).toBe(true);
    expect(shouldPushLine("routine", "weekly-only")).toBe(false);
    expect(shouldPushLine("failure", "weekly-only")).toBe(false);
    expect(shouldPushLine("critical", "weekly-only")).toBe(true);
  });

  it("all では全種別を送信する", () => {
    expect(shouldPushLine("weekly", "all")).toBe(true);
    expect(shouldPushLine("routine", "all")).toBe(true);
    expect(shouldPushLine("failure", "all")).toBe(true);
    expect(shouldPushLine("critical", "all")).toBe(true);
  });
});

describe("formatFailureLogEntry", () => {
  it("タブ区切りで ISO 時刻と key=value を出力する", () => {
    expect(
      formatFailureLogEntry({
        nowIso: "2026-07-06T14:00:00.000Z",
        source: "revise",
        exitCode: 1,
        resume: "npm run growth:revise-loop",
        detail: "fatal error",
      })
    ).toBe(
      "2026-07-06T14:00:00.000Z\tsource=revise\texit=1\tresume=npm run growth:revise-loop\tdetail=fatal error"
    );
  });

  it("任意項目が無い場合は source だけを出力し、改行やタブは空白へ正規化する", () => {
    expect(
      formatFailureLogEntry({
        nowIso: "2026-07-06T14:00:00.000Z",
        source: "regen\tbody",
        detail: "line1\nline2",
      })
    ).toBe("2026-07-06T14:00:00.000Z\tsource=regen body\tdetail=line1 line2");
  });

  it("detail が空文字の場合は detail フィールドを出力しない", () => {
    expect(
      formatFailureLogEntry({
        nowIso: "2026-07-06T14:00:00.000Z",
        source: "weekly",
        exitCode: "1",
        resume: "npm run growth:weekly",
        detail: "",
      })
    ).toBe("2026-07-06T14:00:00.000Z\tsource=weekly\texit=1\tresume=npm run growth:weekly");
  });
});

describe("countRecentFailures", () => {
  it("windowMs 以内のパース可能な行だけ数える", () => {
    const now = Date.parse("2026-07-06T14:00:00.000Z");
    const text = [
      "2026-07-06T13:59:59.000Z\tsource=weekly",
      "2026-06-30T14:00:00.000Z\tsource=revise",
      "2026-06-29T13:59:59.999Z\tsource=old",
      "2026-07-06T14:00:00.001Z\tsource=future",
      "not-date\tsource=bad",
      "",
    ].join("\n");

    expect(countRecentFailures(text, FAILURE_WINDOW_MS, now)).toBe(2);
  });

  it("空文字は 0 件にする", () => {
    expect(countRecentFailures("", FAILURE_WINDOW_MS, Date.now())).toBe(0);
  });
});

describe("buildFailureSummaryLine", () => {
  it("件数が 0 なら空文字を返す", () => {
    expect(buildFailureSummaryLine(0, FAILURE_LOG_PATH)).toBe("");
  });

  it("件数がある場合は週次本文向けの1行を返す", () => {
    expect(buildFailureSummaryLine(3, FAILURE_LOG_PATH)).toBe(
      "今週の失敗 3件（詳細: data/growth-failures.log）"
    );
  });
});

describe("appendFailureLog", () => {
  it("data ディレクトリを作り、改行付きで追記する", () => {
    const mkdirSync = vi.fn();
    const appendFileSync = vi.fn();

    appendFailureLog("entry", { mkdirSync, appendFileSync, filePath: FAILURE_LOG_PATH });

    expect(mkdirSync).toHaveBeenCalledWith("data", { recursive: true });
    expect(appendFileSync).toHaveBeenCalledWith(FAILURE_LOG_PATH, "entry\n", "utf-8");
  });

  it("filePath 省略時は既定パスを使う", () => {
    const mkdirSync = vi.fn();
    const appendFileSync = vi.fn();

    appendFailureLog("entry", { mkdirSync, appendFileSync });

    expect(mkdirSync).toHaveBeenCalledWith("data", { recursive: true });
    expect(appendFileSync).toHaveBeenCalledWith(FAILURE_LOG_PATH, "entry\n", "utf-8");
  });

  it("fs 注入が無い場合は実ファイルへ追記する", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "notify-gate-"));
    const filePath = path.join(dir, "nested", "growth-failures.log");

    try {
      appendFailureLog("entry", { filePath });

      expect(readFileSync(filePath, "utf-8")).toBe("entry\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("deps 省略時も既定パスへ追記する", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "notify-gate-cwd-"));
    const originalCwd = process.cwd();

    try {
      process.chdir(dir);
      appendFailureLog("entry");

      expect(readFileSync(path.join(dir, FAILURE_LOG_PATH), "utf-8")).toBe("entry\n");
    } finally {
      process.chdir(originalCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
