import { describe, expect, it } from "vitest";

import config from "./vitest.config";

describe("vitest config", () => {
  it("ローカルのClaude worktreeをテスト探索対象から除外する", () => {
    if (typeof config === "function" || config instanceof Promise) {
      throw new TypeError("静的なVitest設定を想定しています");
    }

    expect(config.test?.exclude).toContain(".claude/worktrees/**");
  });
});
