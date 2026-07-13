import { describe, expect, it } from "vitest";

import { assertNoProcessingPages, processingStatusFilter, requireLoopState } from "./loopState";

describe("requireLoopState", () => {
  it("run.mjs の mode から Notion ステータスプロパティを解決する", () => {
    expect(requireLoopState("revise")).toMatchObject({
      mode: "revise",
      label: "構成案修正",
      statusProp: "修正ステータス",
    });
  });

  it("未登録 mode は拒否する", () => {
    expect(() => requireLoopState("weekly")).toThrow("未対応の pull 型ループ");
  });
});

describe("processingStatusFilter", () => {
  it("対象ループの処理中だけを問い合わせる Notion filter を返す", () => {
    expect(processingStatusFilter(requireLoopState("comment-revise"))).toEqual({
      property: "本文コメントステータス",
      select: { equals: "処理中" },
    });
  });
});

describe("assertNoProcessingPages", () => {
  it("処理中が0件なら成功する", () => {
    expect(() => assertNoProcessingPages(requireLoopState("revise"), [])).not.toThrow();
  });

  it("処理中が1件以上なら対象ID付きで拒否する", () => {
    expect(() =>
      assertNoProcessingPages(requireLoopState("revise"), [{ id: "page-1" }, { id: "page-2" }])
    ).toThrow("構成案修正に「処理中」が残っています: page-1, page-2");
  });
});
