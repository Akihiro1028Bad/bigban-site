import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { setMockReducedMotion } from "../../__mocks__/framer-motion";
import { arcPathD, arcPoint, SECTION_ARCS } from "@/lib/sectionArc";
import SectionArcDivider from "./SectionArcDivider";

/** 光点は HTML 要素（span）として % 配置される。 */
function getStar(container: HTMLElement) {
  return container.querySelector("span") as HTMLElement;
}

describe("SectionArcDivider", () => {
  beforeEach(() => {
    setMockReducedMotion(false);
  });

  it("既定は apex の弧を描く", () => {
    const { container } = render(<SectionArcDivider />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path.getAttribute("d")).toBe(arcPathD(SECTION_ARCS.apex));
    }
  });

  it("variant=descent で落下側の弧へ切り替わる", () => {
    const { container } = render(<SectionArcDivider variant="descent" />);
    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      arcPathD(SECTION_ARCS.descent),
    );
  });

  it("SVG は非等比に引き伸ばして区切り帯いっぱいに弧を通す", () => {
    const { container } = render(<SectionArcDivider />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100");
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
  });

  it("弧は引き伸ばしても線幅が太らない（non-scaling-stroke）", () => {
    const { container } = render(<SectionArcDivider />);
    for (const path of container.querySelectorAll("path")) {
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
  });

  it("光点はスクロール進捗 0 の位置（弧の起点）に置かれる", () => {
    const { container } = render(<SectionArcDivider />);
    const start = arcPoint(SECTION_ARCS.apex, 0);
    const star = getStar(container);
    expect(star.style.left).toBe(`${start.x}%`);
    expect(star.style.top).toBe(`${start.y}%`);
  });

  it("光点は SVG の引き伸ばしで潰れないよう HTML 要素として配置する", () => {
    const { container } = render(<SectionArcDivider />);
    const star = getStar(container);
    expect(star.closest("svg")).toBeNull();
    expect(star.className).toContain("rounded-full");
    expect(star.className).toContain("bg-accent");
  });

  it("reduced-motion では光点を弧の頂点に静止させる", () => {
    setMockReducedMotion(true);
    const { container } = render(<SectionArcDivider />);
    const apex = arcPoint(SECTION_ARCS.apex, 0.5);
    const star = getStar(container);
    expect(star.style.left).toBe(`${apex.x}%`);
    expect(star.style.top).toBe(`${apex.y}%`);
  });

  it("装飾なので支援技術には露出せず、クリックも奪わない", () => {
    const { container } = render(<SectionArcDivider />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden");
    expect(root.className).toContain("pointer-events-none");
  });

  it("横スクロールを起こさないよう区切り帯の外へはみ出さない", () => {
    const { container } = render(<SectionArcDivider />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className.split(/\s+/)).toContain("overflow-hidden");
  });
});
