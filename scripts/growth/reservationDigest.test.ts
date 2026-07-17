import { expect, it } from "vitest";
import { formatIngestDigest, formatRemarksReview } from "./reservationDigest";
import { snapshotSchema } from "./snapshotSchema";

function snapshot() { return snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, meta: { sourceSyncedAt: "2026-07-16T12:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: ["w"] }, kpi: { actual: { currentWeek: 2, priorWeek: 0, cumulative: 9 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [{ id: "a", detector: "", severity: "info", title: "info", body: "", evidence: {}, label: "観察", firstSeen: "", status: "new" }, { id: "b", detector: "", severity: "alert", title: "alert", body: "", evidence: {}, label: "観察", firstSeen: "", status: "new" }] }); }
it("取り込みダイジェストをseverity順と警告付きで整形する", () => { const text = formatIngestDigest(snapshot()); expect(text).toContain("📊 予約データ取り込み(2026-07-16)"); expect(text).toContain("実予約 今週2件(累積9件)"); expect(text.indexOf("alert")).toBeLessThan(text.indexOf("info")); expect(text).toContain("⚠️ 警告1件"); });
it("備考レビューにAI投入禁止の注意を入れる", () => expect(formatRemarksReview([{ reservationId: "1", useDate: "2026-07-16", category: "x", remarks: "本文" }], "2026-07-16")).toContain("AIプロンプトに投入しないこと"));
it("警告も新規気づきも無い場合はタイトルだけにし、備考なしでも注意を残す", () => {
  const noWarnings = snapshotSchema.parse({ ...snapshot(), meta: { ...snapshot().meta, warnings: [] }, insights: [] });
  const digest = formatIngestDigest(noWarnings);
  expect(digest).not.toContain("⚠️ 警告");
  expect(digest).toContain("新規気づき0件");
  expect(formatRemarksReview([], "2026-07-16")).toContain("# 備考レビュー");
});
it("D1とn<3の気づきは具体名を含まないタイトルに置換する", () => {
  const value = snapshotSchema.parse({ ...snapshot(), insights: [{ id: "d1:ward:具体エリア", detector: "D1", severity: "notice", title: "具体エリアの初予約", body: "", evidence: { n: 1 }, label: "観察", firstSeen: "", status: "new" }] });
  const text = formatIngestDigest(value);
  expect(text).toContain("新しいエリアからの初予約");
  expect(text).not.toContain("具体エリア");
});
it("D1以外でnが数値でなければ元のタイトルを使う", () => {
  const value = snapshotSchema.parse({ ...snapshot(), insights: [{ id: "d2:weekly:x", detector: "D2", severity: "info", title: "通常の変化", body: "", evidence: { n: "unknown" }, label: "観察", firstSeen: "", status: "new" }] });
  expect(formatIngestDigest(value)).toContain("通常の変化");
});
it("D1以外でnが3以上なら元のタイトルを使う", () => {
  const value = snapshotSchema.parse({ ...snapshot(), insights: [{ id: "d2:weekly:y", detector: "D2", severity: "info", title: "十分な標本の変化", body: "", evidence: { n: 3 }, label: "観察", firstSeen: "", status: "new" }] });
  expect(formatIngestDigest(value)).toContain("十分な標本の変化");
});
it("D1以外でnが3未満なら小標本文言に置換する", () => {
  const value = snapshotSchema.parse({ ...snapshot(), insights: [{ id: "d2:weekly:z", detector: "D2", severity: "info", title: "具体的な変化", body: "", evidence: { n: 2 }, label: "観察", firstSeen: "", status: "new" }] });
  expect(formatIngestDigest(value)).toContain("小標本の気づきがあります");
});
it("D11の運用alertはタイトルを匿名化しない", () => {
  const value = snapshotSchema.parse({ ...snapshot(), insights: [{ id: "d11:missing", detector: "D11", severity: "alert", title: "顧客CSVがありません", body: "", evidence: { n: 10 }, label: "観察", firstSeen: "", status: "new" }] });
  expect(formatIngestDigest(value)).toContain("顧客CSVがありません");
});
