import { expect, it } from "vitest";
import { isCalendarYmd, isoDateTimeSchema, ymdSchema } from "./dateSchemas";

it("実在するYMDとISO日時だけを受理する", () => {
  expect(isCalendarYmd("2026-07-16")).toBe(true);
  expect(isCalendarYmd("2026/07/16")).toBe(false);
  expect(isCalendarYmd("2026-02-30")).toBe(false);
  expect(ymdSchema.safeParse("2026-07-16").success).toBe(true);
  expect(isoDateTimeSchema.safeParse("2026-07-16T12:00:00+09:00").success).toBe(true);
  expect(isoDateTimeSchema.safeParse("2026-02-30T12:00:00Z").success).toBe(false);
  expect(isoDateTimeSchema.safeParse("2026-07-16T12:00:00").success).toBe(false);
  expect(isoDateTimeSchema.safeParse("日時").success).toBe(false);
});
