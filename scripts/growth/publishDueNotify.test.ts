import { describe, expect, it } from "vitest";

import {
  buildPublishDueFailureMessage,
  buildPublishDueSkipMessage,
} from "./publishDueNotify";

describe("buildPublishDueFailureMessage", () => {
  it("予約公開 cron の総失敗を沈黙させず理由付きで伝える", () => {
    const msg = buildPublishDueFailureMessage("NOTION_TOKEN が未設定です。");
    expect(msg).toContain("予約公開");
    expect(msg).toContain("失敗");
    expect(msg).toContain("NOTION_TOKEN が未設定です。");
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
