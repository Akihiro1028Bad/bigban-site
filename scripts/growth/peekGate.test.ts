import { describe, expect, it } from "vitest";

import { shouldRunLoop } from "./peekGate";

describe("shouldRunLoop", () => {
  it.each([
    { stdout: "0\n", exitCode: 0, expected: false, label: "zero cleanly" },
    { stdout: "2\n", exitCode: 0, expected: true, label: "positive count" },
    { stdout: "", exitCode: 0, expected: true, label: "empty output" },
    { stdout: "abc", exitCode: 0, expected: true, label: "unparseable output" },
    { stdout: "0", exitCode: 1, expected: true, label: "non-zero exit" },
    { stdout: "0", exitCode: null, expected: true, label: "unknown exit" },
    // `npm run` 経由だとバナーが前置される。最後の非空行を件数として解釈する。
    {
      stdout: "\n> bigban@1.0.0 growth:eyecatch-regen\n> tsx ... peek\n\n0",
      exitCode: 0,
      expected: false,
      label: "banner then zero",
    },
    {
      stdout: "\n> bigban@1.0.0 growth:revise\n> tsx ... peek\n\n3",
      exitCode: 0,
      expected: true,
      label: "banner then positive",
    },
  ])("returns $expected for $label", ({ stdout, exitCode, expected }) => {
    expect(shouldRunLoop(stdout, exitCode)).toBe(expected);
  });
});
