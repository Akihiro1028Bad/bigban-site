import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { setMockReducedMotion } from "../../__mocks__/framer-motion";
import SectionUnderline from "./SectionUnderline";

function renderUnderline() {
  const { container } = render(<SectionUnderline />);
  return container.firstElementChild as HTMLElement;
}

describe("SectionUnderline", () => {
  beforeEach(() => {
    setMockReducedMotion(false);
  });

  it("現行の下線と同じ色・太さ・幅・中央寄せを保つ", () => {
    const classes = renderUnderline().className.split(/\s+/);
    expect(classes).toContain("mx-auto");
    expect(classes).toContain("mt-4");
    expect(classes).toContain("w-14");
    expect(classes).toContain("h-[3px]");
    expect(classes).toContain("bg-accent");
  });

  it("中央寄せ見出し用に scaleX の起点を中央へ置く", () => {
    expect(renderUnderline().className.split(/\s+/)).toContain("origin-center");
  });

  it("装飾なので支援技術には露出しない", () => {
    expect(renderUnderline()).toHaveAttribute("aria-hidden");
  });

  it("reduced-motion でも下線そのものは静的に表示する", () => {
    setMockReducedMotion(true);
    expect(renderUnderline().className.split(/\s+/)).toContain("bg-accent");
  });
});
