import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessBanner } from "./FreshnessBanner";
describe("FreshnessBanner", () => { it("鮮度切れだけを警告する", () => { const { rerender } = render(<FreshnessBanner freshness={{ level: "stale", daysOld: 8, sourceSyncedYmd: "2026-07-01" }} />); expect(screen.getByRole("complementary", { name: "データ鮮度の警告" })).toHaveTextContent("8日前"); rerender(<FreshnessBanner freshness={{ level: "fresh", daysOld: 0, sourceSyncedYmd: "2026-07-17" }} />); expect(screen.queryByRole("complementary")).toBeNull(); }); });
