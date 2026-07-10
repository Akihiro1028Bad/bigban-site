// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PROMPT_REGISTRY } from "./scripts/growth/promptRegistry";
import { PROMPT_TRACING_INCLUDES } from "./next.config";

describe("PROMPT_TRACING_INCLUDES", () => {
  it("単一マニフェストの全資料と facility-context を本番トレース対象にする", () => {
    expect(PROMPT_TRACING_INCLUDES).toEqual([
      ...PROMPT_REGISTRY.map((entry) => `./${entry.path}`),
      "./scripts/growth/facility-context.json",
    ]);
  });

  it("specs / plans はトレース対象に含めない", () => {
    expect(PROMPT_TRACING_INCLUDES.some((entry) => entry.includes("/specs/"))).toBe(false);
    expect(PROMPT_TRACING_INCLUDES.some((entry) => entry.includes("/plans/"))).toBe(false);
  });
});
