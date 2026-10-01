import { describe, it, expect } from "vitest";

import { BUSINESS_HOURS_DISPLAY } from "@/constants/site";

import { businessHoursDisplayFor } from "./businessHoursDisplay";

describe("businessHoursDisplayFor", () => {
  it("ja は日本語表記(25:00)", () => {
    expect(businessHoursDisplayFor("ja")).toEqual(BUSINESS_HOURS_DISPLAY.ja);
  });

  it("ja 以外は英語表記(1:00 AM)", () => {
    expect(businessHoursDisplayFor("en")).toEqual(BUSINESS_HOURS_DISPLAY.en);
  });
});
