import { describe, expect, it } from "vitest";

import {
  buildPublishDueFailureMessage,
  buildPublishDueGateBlockMessage,
  buildPublishDuePartialStatusMessage,
  buildPublishDueSkipMessage,
} from "./publishDueNotify";

describe("buildPublishDueFailureMessage", () => {
  it("予約公開 cron の総失敗を沈黙させず理由付きで伝える", () => {
    const msg = buildPublishDueFailureMessage({
      operation: "microcms.publish",
      status: 502,
      requestId: "req-1",
    });
    expect(msg).toContain("予約公開");
    expect(msg).toContain("失敗");
    expect(msg).toContain("microcms.publish");
    expect(msg).toContain("502");
    expect(msg).toContain("req-1");
  });

  it("status が得られない場合もレスポンス本文を補わず unknown とする", () => {
    const msg = buildPublishDueFailureMessage({
      operation: "microcms.publish",
      status: null,
      requestId: "local-1",
    });
    expect(msg).toContain("HTTP status: unknown");
  });
});

describe("buildPublishDueSkipMessage", () => {
  it("不正 contentId でスキップした記事を件名付きで列挙する", () => {
    const msg = buildPublishDueSkipMessage([
      { title: "屋内ピックル入門", contentId: "bad id!" },
      { title: "", contentId: "" },
    ]);
    expect(msg).toContain("不正な下書きID");
    expect(msg).toContain("屋内ピックル入門");
    expect(msg).toContain("bad id!");
    // タイトル空は id で識別できるよう (無題) を出す
    expect(msg).toContain("(無題)");
  });

  it("空配列なら null(通知不要)", () => {
    expect(buildPublishDueSkipMessage([])).toBeNull();
  });
});

describe("buildPublishDueGateBlockMessage", () => {
  it("公開直前ゲートで止めた記事を理由付きで列挙する", () => {
    const msg = buildPublishDueGateBlockMessage([
      { title: "屋内ピックル入門", contentId: "article-1", reason: "AI免責文: 欠落" },
      { title: "", contentId: "", reason: "断定NG: 料金" },
    ]);
    expect(msg).toContain("公開直前ゲート");
    expect(msg).toContain("屋内ピックル入門");
    expect(msg).toContain("article-1");
    expect(msg).toContain("AI免責文");
    expect(msg).toContain("(無題)");
    expect(msg).toContain("断定NG");
  });

  it("空配列なら null(通知不要)", () => {
    expect(buildPublishDueGateBlockMessage([])).toBeNull();
  });
});

describe("buildPublishDuePartialStatusMessage", () => {
  it("公開済みだが Notion ステータス更新に失敗した記事を列挙する", () => {
    const msg = buildPublishDuePartialStatusMessage([
      { title: "東京PPA記事", contentId: "ppa-tokyo" },
      { title: "", contentId: "" },
    ]);

    expect(msg).toContain("microCMS では公開済み");
    expect(msg).toContain("Notion");
    expect(msg).toContain("東京PPA記事");
    expect(msg).toContain("ppa-tokyo");
    expect(msg).toContain("(無題)");
  });

  it("空配列なら null(通知不要)", () => {
    expect(buildPublishDuePartialStatusMessage([])).toBeNull();
  });
});
