import { describe, expect, it } from "vitest";

import { MEDIA_KIND_LABEL, MOCK_MEDIA, mediaSvgUrl } from "./mediaLibrary";
import type { MediaKind } from "./mediaLibrary";

describe("mediaSvgUrl", () => {
  const kinds: MediaKind[] = ["mascot", "minimal", "diagram", "photo"];

  it.each(kinds)("%s の data-URI(SVG)を返す", (kind) => {
    const url = mediaSvgUrl(kind, 200);
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    const decoded = decodeURIComponent(url.replace("data:image/svg+xml,", ""));
    expect(decoded).toContain("<svg");
    expect(decoded).toContain('viewBox="0 0 160 120"');
    // hue が実際に埋め込まれる
    expect(decoded).toContain("hsl(200");
  });

  it("kind ごとに描画内容が異なる", () => {
    const mascot = decodeURIComponent(mediaSvgUrl("mascot", 100));
    const minimal = decodeURIComponent(mediaSvgUrl("minimal", 100));
    const diagram = decodeURIComponent(mediaSvgUrl("diagram", 100));
    const photo = decodeURIComponent(mediaSvgUrl("photo", 100));
    // マスコットは目(ellipse+circle)、図解は text "イメージ図"
    expect(mascot).toContain("<ellipse");
    expect(diagram).toContain("イメージ図");
    // 4種すべて異なる
    const set = new Set([mascot, minimal, diagram, photo]);
    expect(set.size).toBe(4);
  });

  it("hue の剰余計算(360超)でも壊れない", () => {
    const url = mediaSvgUrl("mascot", 340);
    // (340+40)%360 = 20, (340+180)%360 = 160
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("hsl(20");
    expect(decoded).toContain("hsl(160");
  });
});

describe("MEDIA_KIND_LABEL / MOCK_MEDIA", () => {
  it("全 kind に日本語ラベルがある", () => {
    expect(MEDIA_KIND_LABEL.mascot).toBe("マスコット");
    expect(MEDIA_KIND_LABEL.minimal).toBe("ミニマル");
    expect(MEDIA_KIND_LABEL.diagram).toBe("図解");
    expect(MEDIA_KIND_LABEL.photo).toBe("イメージ");
  });

  it("MOCK_MEDIA は data-URI 付きの一覧", () => {
    expect(MOCK_MEDIA.length).toBeGreaterThan(0);
    for (const m of MOCK_MEDIA) {
      expect(m.url.startsWith("data:image/svg+xml,")).toBe(true);
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
    }
  });
});
