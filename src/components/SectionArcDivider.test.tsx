import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { setMockReducedMotion } from "../../__mocks__/framer-motion";
import { arcAngleDeg, arcPathD, arcPoint, SECTION_ARCS } from "@/lib/sectionArc";
import SectionArcDivider from "./SectionArcDivider";

/** ストリークは SVG の外の HTML 要素（span）として % 配置される。 */
function getStreak(container: HTMLElement) {
  return container.querySelector("span") as HTMLElement;
}

const originalResizeObserver = globalThis.ResizeObserver;

/** 帯の実表示サイズを即座に通知する ResizeObserver に差し替える。 */
function stubBandSize(width: number, height: number) {
  class ImmediateResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
      this.callback(
        [{ contentRect: { width, height } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ImmediateResizeObserver as unknown as typeof ResizeObserver;
}

describe("SectionArcDivider", () => {
  beforeEach(() => {
    setMockReducedMotion(false);
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
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

  it("SVG は非等比に引き伸ばしつつ、弧の線幅は太らせない", () => {
    const { container } = render(<SectionArcDivider />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100");
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
    for (const path of container.querySelectorAll("path")) {
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
  });

  it("ストリークの先端をスクロール進捗 0 の位置（弧の起点）に置く", () => {
    const { container } = render(<SectionArcDivider />);
    const start = arcPoint(SECTION_ARCS.apex, 0);
    const streak = getStreak(container);
    expect(streak.style.left).toBe(`${start.x}%`);
    expect(streak.style.top).toBe(`${start.y}%`);
  });

  it("先端を基準に尾が後ろへ伸びる細い筋として組む", () => {
    const { container } = render(<SectionArcDivider />);
    const streak = getStreak(container);
    const classes = streak.className.split(/\s+/);
    // SVG の非等比な伸長で潰れないよう HTML 要素側に置く。
    expect(streak.closest("svg")).toBeNull();
    expect(classes).toContain("section-arc-streak");
    // 右端＝先端を弧の点に合わせ、そこを軸に回す。
    expect(classes).toContain("-translate-x-full");
    expect(classes).toContain("origin-right");
  });

  it("ストリークは帯の実寸から求めた接線角度へ回転する", () => {
    stubBandSize(800, 100);
    const { container } = render(<SectionArcDivider />);
    const expected = arcAngleDeg(SECTION_ARCS.apex, 0, 800, 100);
    expect(getStreak(container).style.rotate).toBe(`${expected}deg`);
  });

  it("reduced-motion では弧の頂点に静止し、水平な筋になる", () => {
    setMockReducedMotion(true);
    stubBandSize(800, 100);
    const { container } = render(<SectionArcDivider />);
    const apex = arcPoint(SECTION_ARCS.apex, 0.5);
    const streak = getStreak(container);
    expect(streak.style.left).toBe(`${apex.x}%`);
    expect(streak.style.top).toBe(`${apex.y}%`);
    // 頂点の接線は水平なので、伸長率によらず 0 度。
    expect(streak.style.rotate).toBe("0deg");
  });

  it("装飾レイヤーとして、支援技術・クリック・横スクロールのいずれも邪魔しない", () => {
    const { container } = render(<SectionArcDivider />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden");
    expect(root.className).toContain("pointer-events-none");
    // 帯からはみ出した尾が横スクロールを生まないよう切り落とす。
    expect(root.className.split(/\s+/)).toContain("overflow-hidden");
  });
});
