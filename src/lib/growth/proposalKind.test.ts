import { describe, expect, it } from "vitest";

import type { ProposalKind } from "@/app/growth/approve/types";

import { categoryForKind } from "./proposalForm";
import { KIND_META, approveOutcomeFor, kindFromCategory } from "./proposalKind";

describe("kindFromCategory", () => {
  it("コンテンツは article", () => {
    expect(kindFromCategory("コンテンツ")).toBe("article");
  });
  it("イベントは event", () => {
    expect(kindFromCategory("イベント")).toBe("event");
  });
  it("実装タスク系カテゴリ(サイトデザイン/サイト表示内容/追加機能)は site (#214)", () => {
    expect(kindFromCategory("サイトデザイン")).toBe("site");
    expect(kindFromCategory("サイト表示内容")).toBe("site");
    expect(kindFromCategory("追加機能")).toBe("site");
  });
  it("MEO は other (#214)", () => {
    expect(kindFromCategory("MEO")).toBe("other");
  });
  it("前後の空白を無視して写像する", () => {
    expect(kindFromCategory("  サイトデザイン  ")).toBe("site");
    expect(kindFromCategory(" MEO ")).toBe("other");
  });
  it("未知/空は article へフォールバック(欠落耐性)", () => {
    expect(kindFromCategory("")).toBe("article");
    expect(kindFromCategory("不明カテゴリ")).toBe("article");
  });
});

describe("kindFromCategory × categoryForKind 往復整合(#214)", () => {
  it("4種別すべてが categoryForKind→kindFromCategory で元の種別に戻る", () => {
    (["article", "site", "event", "other"] as const).forEach((kind: ProposalKind) => {
      const category = categoryForKind(kind);
      expect(kindFromCategory(category)).toBe(kind);
    });
  });
});

describe("KIND_META", () => {
  it("4種別すべてに label と tone を持つ", () => {
    (["article", "site", "event", "other"] as const).forEach((k) => {
      expect(KIND_META[k].label).toBeTruthy();
      expect(KIND_META[k].tone).toBeTruthy();
    });
  });
  it("tone は theme 実在の --p-* トークンを指す", () => {
    expect(KIND_META.article.tone).toBe("var(--p-accent)");
    expect(KIND_META.site.tone).toBe("var(--p-purple)");
    expect(KIND_META.event.tone).toBe("var(--p-green)");
    expect(KIND_META.other.tone).toBe("var(--p-text-3)");
  });
});

describe("approveOutcomeFor", () => {
  it("種別ごとの承認出口テキストを返す", () => {
    expect(approveOutcomeFor("article").buttonLabel).toBeTruthy();
    expect(approveOutcomeFor("site").buttonLabel).toBeTruthy();
    expect(approveOutcomeFor("event").preview).toBeTruthy();
    expect(approveOutcomeFor("other").toast).toBeTruthy();
  });
  it("site は実装タスク・event は開催準備・other はタスク・article は記事化へ導く", () => {
    expect(approveOutcomeFor("site").buttonLabel).toBe("承認して実装タスク化");
    expect(approveOutcomeFor("event").buttonLabel).toBe("承認して開催準備へ");
    expect(approveOutcomeFor("other").buttonLabel).toBe("承認してタスク化");
    expect(approveOutcomeFor("article").buttonLabel).toBe("承認して記事化");
  });
  it("引数省略時は article アウトカム(欠落耐性)", () => {
    expect(approveOutcomeFor()).toEqual(approveOutcomeFor("article"));
  });
  it("各種別が done を持つ", () => {
    (["article", "site", "event", "other"] as const).forEach((k) => {
      expect(approveOutcomeFor(k).done).toBeTruthy();
    });
  });
});
