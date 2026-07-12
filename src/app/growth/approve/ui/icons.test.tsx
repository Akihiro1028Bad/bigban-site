import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as Icons from "./icons";

const ALL = Object.entries(Icons).filter(([name]) => name.startsWith("Icon"));

describe("approve icons", () => {
  it("全アイコンが svg を描画し size を反映する", () => {
    expect(ALL.length).toBe(33);
    for (const [name, Icon] of ALL) {
      const { container, unmount } = render(<Icon size={20} aria-label={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg?.getAttribute("width")).toBe("20");
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
      unmount();
    }
  });

  it("size 省略時は 16", () => {
    const { container } = render(<Icons.IconCheck />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("16");
  });
});
