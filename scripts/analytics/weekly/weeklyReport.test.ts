import { describe, expect, it } from "vitest";

import { formatReconciliation, formatTennisbear } from "./weeklyReport";

const weeks = ["2026-09-21", "2026-09-28"];

describe("formatReconciliation", () => {
  it("週ごとに GA4 完了・台帳受付・差・キャンセルを並べ、今週は(途中)と書く", () => {
    const text = formatReconciliation(
      weeks,
      new Map([["2026-09-21", 10], ["2026-09-28", 4]]),
      new Map([["2026-09-21", { received: 8, cancelled: 1 }], ["2026-09-28", { received: 6, cancelled: 0 }]]),
      0,
      "2026-09-28",
    );
    expect(text).toContain("2026-09-21週  GA4完了=10 台帳受付=8 差=+2 (うちキャンセル 1)");
    expect(text).toContain("2026-09-28週(途中)  GA4完了=4 台帳受付=6 差=-2 (うちキャンセル 0)");
    expect(text).toContain("差の読み方");
    expect(text).not.toContain("受付日時のない");
  });

  it("どちらかに無い週は 0 として出し、差が 0 のときは符号なし", () => {
    const text = formatReconciliation(weeks, new Map(), new Map(), 0, "2026-09-28");
    expect(text).toContain("2026-09-21週  GA4完了=0 台帳受付=0 差=0 (うちキャンセル 0)");
  });

  it("受付日時のない台帳があれば、含まない旨を添える", () => {
    const text = formatReconciliation(weeks, new Map(), new Map(), 3, "2026-09-28");
    expect(text).toContain("※受付日時のない台帳 3 件は含まない");
  });
});

describe("formatTennisbear", () => {
  const applications = { byWeek: new Map([["2026-09-21", 3]]), undated: 2, events: 5 };

  it("週ごとにクリック・申込・申込÷クリックを出し、クリック 0 のときは『―』", () => {
    const text = formatTennisbear(weeks, new Map([["2026-09-21", 12]]), applications, "2026-09-28");
    expect(text).toContain("2026-09-21週  クリック=12 申込=3 申込÷クリック=25%");
    expect(text).toContain("2026-09-28週(途中)  クリック=0 申込=0 申込÷クリック=―");
  });

  it("対象の開催回数と、申込日時なしの件数を添える", () => {
    const text = formatTennisbear(weeks, new Map(), applications, "2026-09-28");
    expect(text).toContain("対象 5 回・申込日時なし 2 件は含まない");
  });
});
