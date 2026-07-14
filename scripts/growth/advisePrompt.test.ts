// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const prompt = readFileSync(new URL("./prompts/advise.md", import.meta.url), "utf8");

describe("記事アドバイスプロンプト", () => {
  it("主観採点や特定の構成型を要求しない", () => {
    expect(prompt).not.toContain("観点別スコア");
    expect(prompt).not.toContain("0〜5");
    expect(prompt).not.toContain("4段構成");
    expect(prompt).not.toContain('"scores"');
  });

  it("読者にとっての自然さと必要性を具体的に診断する", () => {
    expect(prompt).toContain("読者の判断に必要か");
    expect(prompt).toContain("同じ事実や注意点の繰り返し");
    expect(prompt).toContain("制度・手順・施設スペックの説明過多");
    expect(prompt).toContain("問題がなければ無理に指摘を作らない");
  });
});
