// @vitest-environment node
import { describe, expect, it } from "vitest";

import GrowthLayout from "./layout";

describe("GrowthLayout", () => {
  it("html(lang=ja) と body で children を包む", () => {
    const el = GrowthLayout({ children: "child" });
    expect(el.type).toBe("html");
    expect(el.props.lang).toBe("ja");

    const body = el.props.children;
    expect(body.type).toBe("body");
    expect(body.props.children).toBe("child");
  });
});
