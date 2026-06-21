import { describe, expect, it } from "vitest";

import {
  buildPreviewMessage,
  isAllowedPreviewOrigin,
  MAX_PREVIEW_HTML_LENGTH,
  parsePreviewMessage,
  PREVIEW_MESSAGE_TYPE,
} from "./draftPreview";

describe("buildPreviewMessage", () => {
  it("type タグ付きで html を包む", () => {
    expect(buildPreviewMessage("<p>x</p>")).toEqual({
      type: PREVIEW_MESSAGE_TYPE,
      html: "<p>x</p>",
    });
  });
});

describe("isAllowedPreviewOrigin", () => {
  it("自オリジンと一致すれば true", () => {
    expect(isAllowedPreviewOrigin("https://a.example", "https://a.example")).toBe(
      true,
    );
  });

  it("異なるオリジンは false", () => {
    expect(isAllowedPreviewOrigin("https://evil.example", "https://a.example")).toBe(
      false,
    );
  });
});

describe("parsePreviewMessage", () => {
  it("正規メッセージはそのまま返す", () => {
    expect(parsePreviewMessage({ type: PREVIEW_MESSAGE_TYPE, html: "<p>x</p>" })).toEqual(
      { type: PREVIEW_MESSAGE_TYPE, html: "<p>x</p>" },
    );
  });

  it("object でない(文字列)は null", () => {
    expect(parsePreviewMessage("nope")).toBeNull();
  });

  it("null は null", () => {
    expect(parsePreviewMessage(null)).toBeNull();
  });

  it("type 不一致は null", () => {
    expect(parsePreviewMessage({ type: "other", html: "x" })).toBeNull();
  });

  it("html が文字列でないと null", () => {
    expect(parsePreviewMessage({ type: PREVIEW_MESSAGE_TYPE, html: 123 })).toBeNull();
  });

  it("長すぎる html は null", () => {
    const tooLong = "a".repeat(MAX_PREVIEW_HTML_LENGTH + 1);
    expect(
      parsePreviewMessage({ type: PREVIEW_MESSAGE_TYPE, html: tooLong }),
    ).toBeNull();
  });
});
