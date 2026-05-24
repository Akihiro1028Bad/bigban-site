import { describe, it, expect } from "vitest";
import { HYROX_STATIONS } from "./stations";

describe("HYROX_STATIONS", () => {
  it("8件ある", () => {
    expect(HYROX_STATIONS).toHaveLength(8);
  });

  it("number は 01〜08、key は station01〜station08", () => {
    HYROX_STATIONS.forEach((s, i) => {
      const n = String(i + 1).padStart(2, "0");
      expect(s.number).toBe(n);
      expect(s.key).toBe(`station${n}`);
    });
  });
});
