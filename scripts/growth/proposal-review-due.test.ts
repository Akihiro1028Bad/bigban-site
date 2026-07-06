import { describe, expect, it } from "vitest";

import {
  PROPOSAL_REVIEW_DATE_PROP,
  PROPOSAL_REVIEW_DONE_PROP,
  PROPOSAL_REVIEW_MEMO_PROP,
  buildProposalReviewMemo,
  isProposalReviewDue,
} from "./proposal-review-due";

describe("isProposalReviewDue", () => {
  it("検証予定日が今日以前なら到来(true)", () => {
    expect(isProposalReviewDue("2026-07-01", "2026-07-03")).toBe(true);
  });

  it("検証予定日がちょうど今日なら到来(true・境界含む)", () => {
    expect(isProposalReviewDue("2026-07-03", "2026-07-03")).toBe(true);
  });

  it("検証予定日が未来なら未到来(false)", () => {
    expect(isProposalReviewDue("2026-07-10", "2026-07-03")).toBe(false);
  });

  it("検証予定日が未設定(null/空)なら未到来(false・欠落耐性)", () => {
    expect(isProposalReviewDue(null, "2026-07-03")).toBe(false);
    expect(isProposalReviewDue("", "2026-07-03")).toBe(false);
    expect(isProposalReviewDue("   ", "2026-07-03")).toBe(false);
  });

  it("不正な日付形式は未到来(false・沈黙落ちしない=拾わない)", () => {
    expect(isProposalReviewDue("いつか", "2026-07-03")).toBe(false);
    expect(isProposalReviewDue("2026/07/01", "2026-07-03")).toBe(false);
  });

  it("形式は合うが実在しない月(2026-13-05)は未到来(false)", () => {
    expect(isProposalReviewDue("2026-13-05", "2026-07-03")).toBe(false);
  });

  it("日時付き(ISO)でも日付部分で判定する", () => {
    expect(isProposalReviewDue("2026-07-01T09:00:00.000Z", "2026-07-03")).toBe(true);
    expect(isProposalReviewDue("2026-07-10T00:00:00+09:00", "2026-07-03")).toBe(false);
  });
});

describe("buildProposalReviewMemo", () => {
  it("仮説と成功指標を候補文に含める", () => {
    const memo = buildProposalReviewMemo(
      "GBP週次投稿",
      "ローカル指名の CTR が上がる",
      "GBP経由アクション +20%/月",
    );
    expect(memo).toContain("GBP週次投稿");
    expect(memo).toContain("ローカル指名の CTR が上がる");
    expect(memo).toContain("GBP経由アクション +20%/月");
  });

  it("仮説が空でも壊れず、成功指標だけで候補を作る", () => {
    const memo = buildProposalReviewMemo("MEO改善", "", "順位 5位以内");
    expect(memo).toContain("MEO改善");
    expect(memo).toContain("順位 5位以内");
    expect(memo).not.toContain("仮説:");
  });

  it("仮説・成功指標が両方空でも判定材料が少ない旨を返す", () => {
    const memo = buildProposalReviewMemo("名前だけ", "", "");
    expect(memo).toContain("名前だけ");
    expect(memo).toContain("判定材料が少ない");
  });
});

describe("プロパティ名(承認画面・書き込み先の単一ソース)", () => {
  it("検証予定日/検証メモ/検証済み のプロパティ名を持つ", () => {
    expect(PROPOSAL_REVIEW_DATE_PROP).toBe("検証予定日");
    // 候補メモは text `検証メモ` に書く(select `検証結果` は人の最終判定用で触らない)。
    expect(PROPOSAL_REVIEW_MEMO_PROP).toBe("検証メモ");
    expect(PROPOSAL_REVIEW_DONE_PROP).toBe("検証済み");
  });
});
