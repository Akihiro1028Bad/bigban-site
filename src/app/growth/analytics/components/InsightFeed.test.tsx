import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { analyticsSnapshot } from "../../../../../scripts/growth/__fixtures__/analyticsSnapshot";
import { sortedInsights } from "@/lib/growth/analyticsView";
import { InsightFeed } from "./InsightFeed";
describe("InsightFeed", () => { it("severity順の気づきと根拠を表示する", () => { render(<InsightFeed insights={sortedInsights(analyticsSnapshot())} />); const items = screen.getAllByRole("listitem"); expect(items[0]).toHaveTextContent("要確認"); expect(screen.getByText("根拠: n=12 / ci=95%")).toBeVisible(); }); it("表示可能な根拠がない気づきでは根拠チップを出さない", () => { const insight = analyticsSnapshot().insights[0]; render(<InsightFeed insights={[{ ...insight, evidence: { ignored: null } }]} />); expect(screen.getByRole("heading", { name: "情報" })).toBeVisible(); expect(screen.queryByText(/^根拠:/)).not.toBeInTheDocument(); }); it("空なら空状態を表示する", () => { render(<InsightFeed insights={[]} />); expect(screen.getByText("新しい気づきはありません。")).toBeVisible(); }); });
