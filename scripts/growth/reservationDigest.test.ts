import { expect, it } from "vitest";
import { formatIngestDigest, formatRemarksReview } from "./reservationDigest";
import { snapshotSchema } from "./snapshotSchema";

function snapshot() { return snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "", end: "" }, meta: { inputs: [], excludedCount: 0, missingSections: [], warnings: ["w"] }, kpi: { actual: { currentWeek: 2, priorWeek: 0, cumulative: 9 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [{ id: "a", detector: "", severity: "info", title: "info", body: "", evidence: {}, label: "観察", firstSeen: "", status: "new" }, { id: "b", detector: "", severity: "alert", title: "alert", body: "", evidence: {}, label: "観察", firstSeen: "", status: "new" }] }); }
it("取り込みダイジェストをseverity順と警告付きで整形する", () => { const text = formatIngestDigest(snapshot()); expect(text).toContain("📊 予約データ取り込み(2026-07-16)"); expect(text).toContain("実予約 今週2件(累積9件)"); expect(text.indexOf("alert")).toBeLessThan(text.indexOf("info")); expect(text).toContain("⚠️ 警告1件"); });
it("備考レビューにAI投入禁止の注意を入れる", () => expect(formatRemarksReview([{ reservationId: "1", useDate: "2026-07-16", category: "x", remarks: "本文" }], "2026-07-16")).toContain("AIプロンプトに投入しないこと"));
it("警告も新規気づきも無い場合はタイトルだけにし、備考なしでも注意を残す", () => {
  const noWarnings = snapshotSchema.parse({ ...snapshot(), meta: { ...snapshot().meta, warnings: [] }, insights: [] });
  const digest = formatIngestDigest(noWarnings);
  expect(digest).not.toContain("⚠️ 警告");
  expect(digest).toContain("新規気づき0件");
  expect(formatRemarksReview([], "2026-07-16")).toContain("# 備考レビュー");
});
