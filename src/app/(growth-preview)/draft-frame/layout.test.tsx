// @vitest-environment node
import { describe, expect, it } from "vitest";

import DraftFrameLayout, { metadata } from "./layout";

describe("DraftFrameLayout", () => {
  it("html(lang=ja) と body で children を包む", () => {
    const el = DraftFrameLayout({ children: "child" });
    expect(el.type).toBe("html");
    expect(el.props.lang).toBe("ja");

    const body = el.props.children;
    expect(body.type).toBe("body");
    expect(body.props.children).toBe("child");
  });

  it("noindex メタデータを持つ", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
