import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { analyticsSnapshot } from "../../../../../scripts/growth/__fixtures__/analyticsSnapshot";
import { WardList } from "./WardList";
describe("WardList", () => { it("商圏をリストで表示する", () => { render(<WardList wards={analyticsSnapshot().catalog.wards} />); expect(screen.getByRole("heading", { name: "商圏" })).toBeVisible(); expect(screen.getByText("足立区")).toBeVisible(); }); it("欠落時は収集中を表示する", () => { render(<WardList wards={[]} />); expect(screen.getByText("商圏データを収集中です。")).toBeVisible(); }); });
