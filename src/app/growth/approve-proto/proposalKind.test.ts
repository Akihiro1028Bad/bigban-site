import { describe, expect, it } from "vitest";

import { approveOutcomeFor, KIND_META } from "./proposalKind";
import type { ProposalKind } from "./types";

describe("proposalKind: KIND_META", () => {
  it("4種別すべてに label と tone がある", () => {
    const kinds: ProposalKind[] = ["article", "site", "event", "other"];
    for (const k of kinds) {
      expect(KIND_META[k].label.length).toBeGreaterThan(0);
      expect(KIND_META[k].tone).toMatch(/^var\(--p-/);
    }
  });
});

describe("proposalKind: approveOutcomeFor", () => {
  it("article は記事化のラベル/結末を返す", () => {
    const o = approveOutcomeFor("article");
    expect(o.buttonLabel).toBe("承認して記事化");
    expect(o.preview).toBe("記事ドラフト生成キュー");
    expect(o.toast).toContain("記事生成パイプライン");
    expect(o.done).toContain("記事生成パイプライン");
  });

  it("site は実装タスク化", () => {
    expect(approveOutcomeFor("site").buttonLabel).toBe("承認して実装タスク化");
    expect(approveOutcomeFor("site").preview).toBe("実装タスク");
  });

  it("event は開催準備", () => {
    expect(approveOutcomeFor("event").buttonLabel).toBe("承認して開催準備へ");
    expect(approveOutcomeFor("event").preview).toBe("開催準備タスク");
  });

  it("other はタスク化", () => {
    expect(approveOutcomeFor("other").buttonLabel).toBe("承認してタスク化");
    expect(approveOutcomeFor("other").preview).toBe("タスク");
  });

  it("未指定は article にフォールバックする", () => {
    expect(approveOutcomeFor()).toEqual(approveOutcomeFor("article"));
  });
});
